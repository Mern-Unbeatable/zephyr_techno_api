import 'dotenv/config';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const migrationName = '20260909060000_variant_condition_price_matrix';

const existing = await client.query(
  `SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = $1`,
  [migrationName],
);

if (existing.rows.length) {
  console.log('Already recorded:', migrationName);
} else {
  await client.query(
    `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
     VALUES (gen_random_uuid()::text, $1, NOW(), $2, NULL, NULL, NOW(), 1)`,
    ['manual-sql-apply', migrationName],
  );
  console.log('Recorded migration as applied:', migrationName);
}

await client.end();
