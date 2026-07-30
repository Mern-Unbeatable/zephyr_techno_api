/**
 * Restore / seed database from a Prisma JSON backup.
 *
 * WARNING: Clears existing rows for models present in the backup, then inserts.
 *
 * Usage:
 *   node scripts/restore-database.js
 *   node scripts/restore-database.js prisma/backups/db-backup-....json
 *   npm run db:restore
 *
 * Default file: prisma/backups/latest-full-backup.json
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { MODEL_EXPORT_ORDER } from "./backup-database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_BACKUP = path.join(
  __dirname,
  "..",
  "prisma",
  "backups",
  "latest-full-backup.json",
);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[Restore] DATABASE_URL is not set. Aborting.");
  process.exit(1);
}

/** Delete children before parents (reverse of export order). */
const DELETE_ORDER = [...MODEL_EXPORT_ORDER].reverse();

const BATCH_SIZE = 200;

function parseArgs() {
  const fileArg = process.argv[2];
  return {
    file: fileArg
      ? path.isAbsolute(fileArg)
        ? fileArg
        : path.join(process.cwd(), fileArg)
      : DEFAULT_BACKUP,
  };
}

async function createManyBatched(prisma, model, rows) {
  if (!rows?.length) return 0;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    await prisma[model].createMany({
      data: chunk,
      skipDuplicates: true,
    });
    inserted += chunk.length;
  }
  return inserted;
}

async function main() {
  const { file } = parseArgs();
  if (!fs.existsSync(file)) {
    console.error(`[Restore] Backup file not found: ${file}`);
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  const data = payload.data || payload;
  const order = payload.meta?.modelOrder || MODEL_EXPORT_ORDER;

  const adapter = new PrismaPg({ connectionString: DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    console.log(`[Restore] Loading ${file}`);
    console.log(`[Restore] Clearing + inserting in FK-safe order…`);

    await prisma.$transaction(
      async (tx) => {
        // Disable FK checks aren't available on Postgres easily; delete in reverse order.
        for (const model of DELETE_ORDER) {
          if (!tx[model] || !data[model]) continue;
          const result = await tx[model].deleteMany({});
          console.log(`[Restore] cleared ${model}: ${result.count}`);
        }

        for (const model of order) {
          const rows = data[model];
          if (!tx[model] || !rows?.length) {
            if (rows) console.log(`[Restore] ${model}: 0`);
            continue;
          }
          const count = await createManyBatched(tx, model, rows);
          console.log(`[Restore] inserted ${model}: ${count}`);
        }
      },
      { timeout: 120_000 },
    );

    console.log("[Restore] Done.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[Restore] Failed:", err);
  process.exit(1);
});
