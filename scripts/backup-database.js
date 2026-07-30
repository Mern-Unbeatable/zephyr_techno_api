/**
 * Full database backup → JSON (Prisma)
 *
 * Usage:
 *   node scripts/backup-database.js
 *   npm run db:backup
 *
 * Output:
 *   prisma/backups/db-backup-<timestamp>.json
 *   prisma/backups/latest-full-backup.json
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.join(__dirname, "..", "prisma", "backups");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[Backup] DATABASE_URL is not set. Aborting.");
  process.exit(1);
}

/** Export order (documentation / restore dependency order). */
export const MODEL_EXPORT_ORDER = [
  "category",
  "series",
  "deviceModel",
  "condition",
  "color",
  "storageOption",
  "conditionModelPrice",
  "user",
  "userAddress",
  "product",
  "productHighlight",
  "productSpecification",
  "productIncludedItem",
  "productGallery",
  "productFaq",
  "productColor",
  "productStorageOption",
  "promoCode",
  "promoCodeSeriesBridge",
  "promoCodeModelBridge",
  "cart",
  "cartItem",
  "order",
  "orderItem",
  "review",
  "sellRequest",
  "deviceImage",
  "contactMessage",
  "businessForm",
];

function serializeValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  // Prisma Decimal
  if (typeof value === "object" && value !== null && typeof value.toNumber === "function") {
    return value.toString();
  }
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = serializeValue(v);
    }
    return out;
  }
  return value;
}

async function main() {
  const adapter = new PrismaPg({ connectionString: DATABASE_URL });
  // Base client — includes soft-deleted rows (no soft-delete extension)
  const prisma = new PrismaClient({ adapter });

  try {
    console.log("[Backup] Starting full database export…");
    fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const data = {};
    const counts = {};

    for (const model of MODEL_EXPORT_ORDER) {
      if (!prisma[model]) {
        console.warn(`[Backup] Skipping unknown model: ${model}`);
        continue;
      }
      const rows = await prisma[model].findMany();
      data[model] = serializeValue(rows);
      counts[model] = rows.length;
      console.log(`[Backup] ${model}: ${rows.length}`);
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const payload = {
      meta: {
        exportedAt: new Date().toISOString(),
        source: "prisma-backup",
        databaseProvider: "postgresql",
        modelOrder: MODEL_EXPORT_ORDER,
        counts,
      },
      data,
    };

    const stampedPath = path.join(BACKUP_DIR, `db-backup-${stamp}.json`);
    const latestPath = path.join(BACKUP_DIR, "latest-full-backup.json");
    const json = JSON.stringify(payload, null, 2);

    fs.writeFileSync(stampedPath, json, "utf8");
    fs.writeFileSync(latestPath, json, "utf8");

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`[Backup] Done. ${total} rows written.`);
    console.log(`[Backup] ${stampedPath}`);
    console.log(`[Backup] ${latestPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  main().catch((err) => {
    console.error("[Backup] Failed:", err);
    process.exit(1);
  });
}