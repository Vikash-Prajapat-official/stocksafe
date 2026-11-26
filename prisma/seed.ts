import { PrismaClient, StoreType } from "@prisma/client";

const prisma = new PrismaClient();

// Seed skeleton (idempotent). Users, ~300 NLEM items, suppliers and 6 months of
// demo movements are added in later phases.
async function main() {
  const hospital = await prisma.hospital.findFirst();
  if (!hospital) {
    await prisma.hospital.create({ data: { name: "Demo Hospital" } });
  }

  const stores: { name: string; type: StoreType }[] = [
    { name: "Main Store", type: "MAIN" },
    { name: "Pharmacy", type: "PHARMACY" },
    { name: "Ward A", type: "WARD" },
  ];
  for (const s of stores) {
    await prisma.store.upsert({ where: { name: s.name }, update: {}, create: s });
  }

  console.log(`Seeded: hospital + ${stores.length} stores`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
