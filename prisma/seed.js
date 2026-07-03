/**
 * Admin Seed Script
 * -----------------
 * Creates (or upserts) an ADMIN user with a pre-hashed password.
 * The account is marked as email-verified so the admin can log in immediately.
 *
 * Usage:
 *   node prisma/seed.js
 *
 * You can customise credentials via env vars before running:
 *   SEED_ADMIN_EMAIL=admin@example.com
 *   SEED_ADMIN_PASSWORD=MySecret123!
 *   SEED_ADMIN_FIRST_NAME=Super
 *   SEED_ADMIN_LAST_NAME=Admin
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ── Config ────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("[Seed] ❌  DATABASE_URL is not set. Aborting.");
  process.exit(1);
}

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@zephyrtechno.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "Admin@1234";
const ADMIN_FIRST_NAME = process.env.SEED_ADMIN_FIRST_NAME || "Super";
const ADMIN_LAST_NAME = process.env.SEED_ADMIN_LAST_NAME || "Admin";

// ── Prisma client (same adapter setup as the rest of the app) ─
const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ── Seed ──────────────────────────────────────────────────────

/*
async function seedAdmin() {
  console.log('[Seed] Starting admin seed…');

  if (ADMIN_PASSWORD.length < 8) {
    console.error('[Seed] ❌  SEED_ADMIN_PASSWORD must be at least 8 characters. Aborting.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      // Re-apply every run so the password stays in sync if changed
      firstName:       ADMIN_FIRST_NAME,
      lastName:        ADMIN_LAST_NAME,
      passwordHash,
      role:            'ADMIN',
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      // Clear any stale OTP data
      emailVerificationOtpHash:      null,
      emailVerificationOtpExpiresAt: null,
      passwordResetOtpHash:          null,
      passwordResetOtpExpiresAt:     null,
      passwordResetOtpVerifiedAt:    null,
    },
    create: {
      email:           ADMIN_EMAIL,
      firstName:       ADMIN_FIRST_NAME,
      lastName:        ADMIN_LAST_NAME,
      passwordHash,
      role:            'ADMIN',
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
    },
    select: {
      id:              true,
      email:           true,
      firstName:       true,
      lastName:        true,
      role:            true,
      isEmailVerified: true,
    },
  });

  console.log('[Seed] ✅  Admin user seeded successfully:');
  console.table({
    id:              admin.id,
    email:           admin.email,
    name:            `${admin.firstName} ${admin.lastName}`,
    role:            admin.role,
    emailVerified:   admin.isEmailVerified,
  });

  console.log(`\n[Seed] 🔑  Login credentials:`);
  console.log(`         Email    : ${ADMIN_EMAIL}`);
  console.log(`         Password : ${ADMIN_PASSWORD}`);
}
*/

// ── Seed Device Models ────────────────────────────────────────
async function seedDeviceModels() {
  console.log("[Seed] Starting device models seed…\n");

  // Get all series ordered by creation
  const allSeries = await prisma.series.findMany({
    select: { id: true, name: true },
  });

  if (allSeries.length === 0) {
    console.warn("[Seed] ⚠️  No series found. Please seed series first.");
    return;
  }

  // Device models to seed per series (using lowercase series names to match actual DB)
  const modelsBySeries = {
    iphone: [
      "iPhone 17",
      "iPhone 17 Pro",
      "iPhone 17 Pro Max",
      "iPhone 16E",
      "iPhone 16 Plus",
      "iPhone 16",
      "iPhone 16 Pro",
      "iPhone 16 Pro Max",
      "iPhone 15 Pro Max",
      "iPhone 15 Plus",
      "iPhone 15 Pro",
      "iPhone 15",
      "iPhone 14 Plus",
      "iPhone 14 Pro Max",
      "iPhone 14 Pro",
      "iPhone 14",
      "iPhone 13 Pro Max",
      "iPhone 13 Pro",
      "iPhone 13 Mini",
      "iPhone 13",
      "iPhone 12 Pro Max",
      "iPhone 12 Pro",
      "iPhone 12 Mini",
      "iPhone 12",
      "iPhone 11 Pro Max",
      "iPhone 11 Pro",
      "iPhone 11",
      "iPhone XS Max",
      "iPhone XR",
      "iPhone XS",
      "iPhone X",
      "iPhone 8 Plus",
      "iPhone SE 2020",
      "iPhone 8",
      "iPhone 7 Plus",
    ],
    samsung: [
      // Z Flip Series
      "Samsung Galaxy Z Flip 6 5G Unlocked",
      "Samsung Galaxy Z Flip 5 5G Unlocked",
      "Samsung Galaxy Z Flip 4 5G Unlocked",
      "Samsung Galaxy Z Flip 3 5G Unlocked",
      "Samsung Galaxy Z Flip 5G Unlocked",

      // S25 Series
      "Samsung S25 Ultra 512GB",
      "Samsung S25 Ultra 256GB",
      "Samsung S25 Plus 512GB",
      "Samsung S25 Plus 256GB",
      "Samsung S25 512GB",
      "Samsung S25 256GB",
      "Samsung S25 128GB",

      // S24 Series
      "Samsung S24 Ultra 1TB",
      "Samsung S24 Ultra 512GB",
      "Samsung S24 Ultra 256GB",
      "Samsung S24 Plus 512GB",
      "Samsung S24 Plus 256GB",
      "Samsung S24 Plus 128GB",
      "Samsung S24 FE 512GB",
      "Samsung S24 FE 256GB",
      "Samsung S24 FE 128GB",
      "Samsung S24 512GB",
      "Samsung S24 256GB",
      "Samsung S24 128GB",

      // S23 Series
      "Samsung S23 Ultra 1TB",
      "Samsung S23 Ultra 512GB",
      "Samsung S23 Ultra 256GB",
      "Samsung S23 Plus 512GB",
      "Samsung S23 Plus 256GB",
      "Samsung S23 Plus 128GB",
      "Samsung S23 FE 256GB",
      "Samsung S23 FE 128GB",
      "Samsung S23 512GB",
      "Samsung S23 256GB",
      "Samsung S23 128GB",

      // S22 Series
      "Samsung S22 Ultra 1TB",
      "Samsung S22 Ultra 512GB",
      "Samsung S22 Ultra 256GB",
      "Samsung S22 Ultra 128GB",
      "Samsung S22 Plus 256GB",
      "Samsung S22 Plus 128GB",
      "Samsung S22 256GB",
      "Samsung S22 128GB",

      // S21 Series
      "Samsung S21 Ultra 1TB",
      "Samsung S21 Ultra 512GB",
      "Samsung S21 Ultra 256GB",
      "Samsung S21 Ultra 128GB",
      "Samsung S21 Plus 256GB",
      "Samsung S21 Plus 128GB",
      "Samsung S21 FE",
      "Samsung S21",

      // S20 Series
      "Samsung S20 Ultra",
      "Samsung S20 Plus",
      "Samsung S20 FE",
      "Samsung S20",

      // S10 Series
      "Samsung S10 Plus",
      "Samsung S10",

      // Note Series
      "Samsung Galaxy Note 20 Ultra 5G",
      "Samsung Galaxy Note 20 5G",
      "Samsung Galaxy Note 10 Plus 5G",
      "Samsung Galaxy Note 10 Lite",

      // A Series
      "Samsung Galaxy A52s 5G",
      "Samsung Galaxy A52 5G",
      "Samsung A32 5G",
      "Samsung A21s",
      "Samsung A14",
      "Samsung A12",
    ],
  };

  let totalCreated = 0;

  for (const series of allSeries) {
    // Match series name case-insensitively
    const seriesNameLower = series.name.toLowerCase();
    const models = modelsBySeries[seriesNameLower] || [];

    if (models.length > 0) {
      console.log(`\n📱 Creating models for "${series.name}" series:`);
    }

    for (const modelName of models) {
      try {
        const existing = await prisma.deviceModel.findFirst({
          where: { name: modelName, seriesId: series.id },
        });

        if (!existing) {
          await prisma.deviceModel.create({
            data: {
              name: modelName,
              seriesId: series.id,
            },
          });
          totalCreated++;
          console.log(`   ✅ ${modelName}`);
        }
      } catch (err) {
        console.error(`   ❌ Failed to create ${modelName}:`, err.message);
      }
    }
  }

  // Display all models in creation order (newest first)
  const allModels = await prisma.deviceModel.findMany({
    orderBy: { id: "desc" },
    select: {
      id: true,
      name: true,
      series: { select: { name: true } },
    },
  });

  console.log(
    `\n[Seed] ✅  Device Models Seeded (${totalCreated} new models created)`,
  );
  console.log("[Seed] 📱 All Models (Latest First):\n");

  allModels.slice(0, 20).forEach((model, idx) => {
    console.log(`${idx + 1}. ${model.name} (${model.series.name})`);
  });

  if (allModels.length > 20) {
    console.log(`... and ${allModels.length - 20} more models`);
  }
}

async function seed() {
  // Uncomment to run admin seed:
  // await seedAdmin();

  // Run device models seed
  await seedDeviceModels();
}

seed()
  .catch((err) => {
    console.error("[Seed] ❌  Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
