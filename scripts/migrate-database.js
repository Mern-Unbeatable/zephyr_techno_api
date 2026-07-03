/**
 * One-time database migration: apply Prisma migrations to a new Postgres DB
 * and copy all data from the old database.
 *
 * Usage:
 *   OLD_DATABASE_URL="postgres://..." NEW_DATABASE_URL="postgres://..." node scripts/migrate-database.js
 *
 * If OLD_DATABASE_URL is omitted, DATABASE_URL from .env is used as the source.
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');

const cliArgs = process.argv.slice(2).filter((arg) => arg !== '--reset');
const OLD_DATABASE_URL = process.env.OLD_DATABASE_URL || cliArgs[0];
const NEW_DATABASE_URL = process.env.NEW_DATABASE_URL || cliArgs[1];
const RESET_DATABASE = process.env.RESET_DATABASE === 'true' || process.argv.includes('--reset');

if (!OLD_DATABASE_URL) {
  console.error('Missing OLD_DATABASE_URL (env var or first CLI argument)');
  process.exit(1);
}

if (!NEW_DATABASE_URL) {
  console.error('Missing NEW_DATABASE_URL (env var or second CLI argument)');
  process.exit(1);
}

if (OLD_DATABASE_URL === process.env.DATABASE_URL && !process.env.OLD_DATABASE_URL) {
  console.warn(
    'Warning: OLD_DATABASE_URL was not set and DATABASE_URL points at the target DB. Pass OLD_DATABASE_URL explicitly.'
  );
}

if (OLD_DATABASE_URL === NEW_DATABASE_URL) {
  console.error('OLD and NEW database URLs must be different');
  process.exit(1);
}

const BATCH_SIZE = 250;

async function getTablesInCopyOrder(client) {
  const { rows: tableRows } = await client.query(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
    ORDER BY tablename
  `);

  const { rows: fkRows } = await client.query(`
    SELECT
      tc.table_name AS child_table,
      ccu.table_name AS parent_table
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name <> '_prisma_migrations'
  `);

  const tables = tableRows.map((row) => row.tablename);
  const dependencies = new Map(tables.map((table) => [table, new Set()]));

  for (const { child_table: childTable, parent_table: parentTable } of fkRows) {
    if (!dependencies.has(childTable) || childTable === parentTable) {
      continue;
    }
    dependencies.get(childTable).add(parentTable);
  }

  const sorted = [];
  const visiting = new Set();
  const visited = new Set();

  function visit(tableName) {
    if (visited.has(tableName)) {
      return;
    }
    if (visiting.has(tableName)) {
      return;
    }

    visiting.add(tableName);
    for (const parentTable of dependencies.get(tableName) ?? []) {
      visit(parentTable);
    }
    visiting.delete(tableName);
    visited.add(tableName);
    sorted.push(tableName);
  }

  for (const tableName of tables) {
    visit(tableName);
  }

  return sorted;
}

async function truncateAllTables(client, tableNames) {
  if (tableNames.length === 0) {
    return;
  }

  const tableList = tableNames.map((table) => `"${table}"`).join(', ');
  await client.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
}

async function getColumns(client, tableName) {
  const { rows } = await client.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
    ORDER BY ordinal_position
    `,
    [tableName]
  );
  return rows.map((row) => row.column_name);
}

async function countRows(client, tableName) {
  const { rows } = await client.query(`SELECT COUNT(*)::int AS count FROM "${tableName}"`);
  return rows[0].count;
}

async function resetDatabase(client) {
  console.log('\n[0/4] Resetting new database (drop and recreate public schema)...');
  await client.query('DROP SCHEMA IF EXISTS public CASCADE');
  await client.query('CREATE SCHEMA public');
  await client.query('GRANT ALL ON SCHEMA public TO public');
  await client.query('GRANT ALL ON SCHEMA public TO postgres');
}

function deployMigrations(databaseUrl) {
  if (process.env.SKIP_MIGRATIONS === 'true') {
    console.log('\n[1/4] Skipping Prisma migrations (SKIP_MIGRATIONS=true)');
    return;
  }

  console.log('\n[1/4] Applying Prisma migrations to new database...');
  execSync('npx prisma migrate deploy', {
    cwd: backendRoot,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

async function copyData(oldClient, newClient) {
  console.log('\n[2/4] Copying data from old database to new database...');

  const tables = await getTablesInCopyOrder(oldClient);
  await newClient.query('BEGIN');
  await newClient.query('SET session_replication_role = replica');

  try {
    await truncateAllTables(newClient, tables);

    for (const tableName of tables) {
      const columns = await getColumns(oldClient, tableName);
      if (columns.length === 0) {
        continue;
      }

      const sourceCount = await countRows(oldClient, tableName);

      if (sourceCount === 0) {
        console.log(`  ${tableName}: 0 rows`);
        continue;
      }

      const columnList = columns.map((column) => `"${column}"`).join(', ');
      const { rows } = await oldClient.query(`SELECT ${columnList} FROM "${tableName}"`);

      if (rows.length === 0) {
        console.log(`  ${tableName}: 0 rows`);
        continue;
      }

      for (let index = 0; index < rows.length; index += BATCH_SIZE) {
        const batch = rows.slice(index, index + BATCH_SIZE);
        const valuePlaceholders = batch
          .map((_, rowIndex) => {
            const base = rowIndex * columns.length;
            const params = columns.map((__, colIndex) => `$${base + colIndex + 1}`);
            return `(${params.join(', ')})`;
          })
          .join(', ');

        const values = batch.flatMap((row) => columns.map((column) => row[column]));

        await newClient.query(
          `INSERT INTO "${tableName}" (${columnList}) VALUES ${valuePlaceholders}`,
          values
        );
      }

      console.log(`  ${tableName}: ${rows.length} rows`);
    }

    await newClient.query('SET session_replication_role = DEFAULT');
    await newClient.query('COMMIT');
  } catch (error) {
    await newClient.query('ROLLBACK');
    throw error;
  }
}

async function verify(oldClient, newClient) {
  console.log('\n[3/4] Verifying row counts...');

  const tables = await getTablesInCopyOrder(oldClient);
  const mismatches = [];

  for (const tableName of tables) {
    const oldCount = await countRows(oldClient, tableName);
    const newCount = await countRows(newClient, tableName);
    const status = oldCount === newCount ? 'OK' : 'MISMATCH';
    console.log(`  ${tableName}: old=${oldCount}, new=${newCount} [${status}]`);
    if (oldCount !== newCount) {
      mismatches.push(tableName);
    }
  }

  const { rows: migrationRows } = await newClient.query(
    'SELECT COUNT(*)::int AS count FROM "_prisma_migrations"'
  );
  console.log(`  _prisma_migrations: ${migrationRows[0].count} applied migrations`);

  if (mismatches.length > 0) {
    throw new Error(`Row count mismatch in tables: ${mismatches.join(', ')}`);
  }
}

async function main() {
  console.log('Database migration started');
  console.log(`Source: ${OLD_DATABASE_URL.replace(/:[^:@/]+@/, ':****@')}`);
  console.log(`Target: ${NEW_DATABASE_URL.replace(/:[^:@/]+@/, ':****@')}`);
  if (RESET_DATABASE) {
    console.log('Mode: full reset + migrate + copy');
  }

  const oldClient = new Client({ connectionString: OLD_DATABASE_URL });
  const newClient = new Client({ connectionString: NEW_DATABASE_URL });

  await oldClient.connect();
  await newClient.connect();

  try {
    if (RESET_DATABASE) {
      await resetDatabase(newClient);
    }

    deployMigrations(NEW_DATABASE_URL);
    await copyData(oldClient, newClient);
    await verify(oldClient, newClient);
    console.log('\nMigration completed successfully.');
  } finally {
    await oldClient.end();
    await newClient.end();
  }
}

main().catch((error) => {
  console.error('\nMigration failed:', error.message);
  process.exit(1);
});
