import pg from 'pg';

const OLD_DATABASE_URL = process.env.OLD_DATABASE_URL;
const NEW_DATABASE_URL = process.env.NEW_DATABASE_URL;

if (!OLD_DATABASE_URL || !NEW_DATABASE_URL) {
  console.error('Set OLD_DATABASE_URL and NEW_DATABASE_URL');
  process.exit(1);
}

const { Client } = pg;
const oldClient = new Client({ connectionString: OLD_DATABASE_URL });
const newClient = new Client({ connectionString: NEW_DATABASE_URL });

await oldClient.connect();
await newClient.connect();

const { rows } = await oldClient.query(`
  SELECT tablename
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename <> '_prisma_migrations'
  ORDER BY tablename
`);

let mismatches = 0;
for (const { tablename } of rows) {
  const oldCount = (await oldClient.query(`SELECT COUNT(*)::int AS c FROM "${tablename}"`)).rows[0].c;
  const newCount = (await newClient.query(`SELECT COUNT(*)::int AS c FROM "${tablename}"`)).rows[0].c;
  const status = oldCount === newCount ? 'OK' : 'MISMATCH';
  console.log(`${tablename}: old=${oldCount}, new=${newCount} [${status}]`);
  if (oldCount !== newCount) mismatches += 1;
}

await oldClient.end();
await newClient.end();
process.exit(mismatches ? 1 : 0);
