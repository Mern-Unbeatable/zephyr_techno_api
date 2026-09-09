import 'dotenv/config';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const cols = await client.query(`
  SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_name = 'ProductVariantStock'
  ORDER BY ordinal_position
`);
console.log('COLUMNS:');
for (const row of cols.rows) {
  console.log(`- ${row.column_name} (${row.data_type}) default=${row.column_default}`);
}

const cons = await client.query(`
  SELECT conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
  WHERE conrelid = '"ProductVariantStock"'::regclass
`);
console.log('\nCONSTRAINTS:');
for (const row of cons.rows) {
  console.log(`- ${row.conname}: ${row.def}`);
}

const pc = await client.query(`
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'ProductCondition'
  ) AS exists
`);
console.log('\nProductCondition exists:', pc.rows[0].exists);

await client.end();
