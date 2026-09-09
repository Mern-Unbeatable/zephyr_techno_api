import 'dotenv/config';
import fs from 'fs/promises';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const sql = await fs.readFile(
  'prisma/migrations/20260909060000_variant_condition_price_matrix/migration.sql',
  'utf8',
);

try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('OK: matrix migration applied');

  const cols = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'ProductVariantStock'
    ORDER BY ordinal_position
  `);
  console.log(cols.rows.map((r) => r.column_name).join(', '));
} catch (error) {
  await client.query('ROLLBACK');
  console.error('FAIL:', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
