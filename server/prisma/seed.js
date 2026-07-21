/**
 * First-run setup: creates the owner account, your two stores,
 * and a starter set of categories.
 *
 *   node prisma/seed.js
 *
 * Run it again safely — it skips anything that already exists.
 */

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const OWNER_EMAIL = process.env.OWNER_EMAIL || "owner@caceco.ca";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "changeme123";
const OWNER_NAME = process.env.OWNER_NAME || "Amrullah";

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: OWNER_EMAIL.toLowerCase() } });
  if (existing) {
    console.log(`Owner ${OWNER_EMAIL} already exists — skipping.`);
  } else {
    await prisma.user.create({
      data: {
        name: OWNER_NAME,
        email: OWNER_EMAIL.toLowerCase(),
        role: "OWNER",
        passwordHash: await bcrypt.hash(OWNER_PASSWORD, 12),
      },
    });
    console.log(`Owner created: ${OWNER_EMAIL}`);
    console.log(`Password: ${OWNER_PASSWORD}  ← change this after your first sign-in`);
  }

  const locations = [
    { name: "Glendale", address: "3931 17 Ave SW, Calgary" },
    { name: "Chinatown", address: "Unit 2, 132 3 Ave SE, Calgary" },
  ];
  for (const loc of locations) {
    await prisma.location.upsert({ where: { name: loc.name }, update: {}, create: loc });
  }
  console.log("Locations ready: Glendale, Chinatown");

  const categories = [
    "Phones",
    "Tablets",
    "Laptops",
    "Watches",
    "Accessories",
    "Parts",
    "Repair Services",
  ];
  for (const name of categories) {
    const existing = await prisma.category.findFirst({ where: { name, parentId: null } });
    if (!existing) await prisma.category.create({ data: { name } });
  }
  console.log("Categories ready");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
