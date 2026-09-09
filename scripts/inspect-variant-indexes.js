import 'dotenv/config';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const indexes = await client.query(`
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE tablename = 'ProductVariantStock'
`);
console.log('INDEXES:');
for (const row of indexes.rows) {
  console.log(`- ${row.indexname}: ${row.indexdef}`);
}

await client.end();
