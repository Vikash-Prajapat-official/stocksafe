import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient, type Role, type StoreType } from "@prisma/client";
import { importItemsFromBytes } from "../src/lib/item-import";
import { itemKey } from "../src/lib/schemas/item";
import { hashPassword } from "../src/lib/password";
import { seedDemoHistory } from "./demo-history";

const prisma = new PrismaClient();

// Demo password for the seeded accounts. Override with SEED_PASSWORD, and change it for real use.
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "ChangeMe@123";

const STORES: { name: string; type: StoreType }[] = [
  { name: "Main Store", type: "MAIN" },
  { name: "Pharmacy", type: "PHARMACY" },
  { name: "Ward A", type: "WARD" },
];

// phone, name, role, stores (empty list for ADMIN/AUDITOR means all stores)
const USERS: { phone: string; name: string; role: Role; stores: string[] }[] = [
  { phone: "9000000001", name: "Admin", role: "ADMIN", stores: [] },
  { phone: "9000000002", name: "Store Keeper", role: "STOREKEEPER", stores: ["Main Store"] },
  { phone: "9000000003", name: "Pharmacist", role: "PHARMACIST", stores: ["Pharmacy"] },
  { phone: "9000000004", name: "Ward Nurse", role: "NURSE", stores: ["Ward A"] },
  { phone: "9000000005", name: "Auditor", role: "AUDITOR", stores: [] },
];

const SUPPLIERS = [
  { name: "Demo Pharma Distributors", phone: "9810000001", address: "Delhi" },
  { name: "Sample Medical Agencies", phone: "9820000002", address: "Mumbai" },
  { name: "Example Surgicals", phone: "9830000003", address: "Chennai" },
];

async function main() {
  // Safe to run many times: nothing is overwritten or duplicated.
  if (!(await prisma.hospital.findFirst())) {
    await prisma.hospital.create({ data: { name: "Demo Hospital" } });
  }

  for (const s of STORES) {
    await prisma.store.upsert({ where: { name: s.name }, update: {}, create: s });
  }
  const stores = await prisma.store.findMany();
  const storeIdByName = new Map(stores.map((s) => [s.name, s.id]));

  const passwordHash = await hashPassword(SEED_PASSWORD);
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { phone: u.phone },
      update: {}, // never reset an existing user's password or role
      create: { phone: u.phone, name: u.name, role: u.role, passwordHash },
    });
    const wanted = u.stores.length ? u.stores : stores.map((s) => s.name);
    for (const name of wanted) {
      const storeId = storeIdByName.get(name);
      if (!storeId) continue;
      await prisma.userStore.upsert({
        where: { userId_storeId: { userId: user.id, storeId } },
        update: {},
        create: { userId: user.id, storeId },
      });
    }
  }

  for (const s of SUPPLIERS) {
    if (!(await prisma.supplier.findFirst({ where: { name: s.name } }))) {
      await prisma.supplier.create({ data: s });
    }
  }

  // Item master: same validator and rules as the admin CSV import.
  const csv = readFileSync(path.join(__dirname, "data", "nlem-items.csv"));
  const existing = new Set(
    (await prisma.item.findMany({ select: { name: true, strength: true, form: true } })).map((i) =>
      itemKey(i.name, i.strength, i.form),
    ),
  );
  const result = importItemsFromBytes(new Uint8Array(csv), "nlem-items.csv", existing);
  if (result.fatal) throw new Error(`NLEM file: ${result.fatal}`);
  const alreadyThere = result.errors.filter((e) => e.message.startsWith("Already in")).length;
  const realErrors = result.errors.filter((e) => !e.message.startsWith("Already in"));
  if (realErrors.length) {
    console.error(realErrors);
    throw new Error("NLEM file has invalid rows");
  }
  const created = await prisma.item.createMany({ data: result.items.map((i) => i.data) });

  // Six months of synthetic movements, so the demo dashboard looks real. SEED_DEMO=0 skips it (for a real hospital).
  if (process.env.SEED_DEMO !== "0") await seedDemoHistory(prisma);

  console.log(
    `Seeded: ${STORES.length} stores, ${USERS.length} users, ${SUPPLIERS.length} suppliers, ` +
      `${created.count} items added (${alreadyThere} already present).`,
  );
  console.log(`Demo logins: phones 9000000001 (admin) to 9000000005 (auditor), password "${SEED_PASSWORD}"`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
