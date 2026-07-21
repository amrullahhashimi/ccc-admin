/**
 * Demo data for CCC Admin.
 *
 *   node prisma/demo.js          fill the database with sample data
 *   node prisma/demo.js --wipe   remove it again
 *
 * Everything it creates is tagged so the wipe can find it and nothing else:
 *   products  → SKU starts with DEMO-
 *   customers → email ends with @example.test
 *   brands / vendors / sub-categories → matched by the names in this file,
 *                                        and only removed if nothing's attached
 *
 * Quantities come from stock entries, matching how the app works — so each
 * product gets one or more receipts rather than a magic number.
 */

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

/* ------------------------------- helpers ------------------------------- */

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const int = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/** Weighted pick: [["USED_GOOD", 5], ["NEW", 1]] → USED_GOOD five times as often. */
function weighted(pairs) {
  const total = pairs.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [value, w] of pairs) {
    if ((r -= w) <= 0) return value;
  }
  return pairs[0][0];
}

const digits = (n) => Array.from({ length: n }, () => int(0, 9)).join("");

/* -------------------------------- data -------------------------------- */

const BRANDS = [
  { name: "Apple", notes: "Authorised reseller. 1 year warranty on new." },
  { name: "Samsung", notes: "Parts direct from distributor." },
  { name: "Google", notes: null },
  { name: "Motorola", notes: "Budget range moves quickly." },
  { name: "LG", notes: "Phones discontinued — parts only now." },
  { name: "OnePlus", notes: null },
  { name: "Huawei", notes: "No Play Store — explain before selling." },
  { name: "Xiaomi", notes: null },
  { name: "Nokia", notes: "Basic phones still sell to older customers." },
  { name: "Sony", notes: null },
  { name: "Oppo", notes: null },
  { name: "Nothing", notes: "Niche, but people ask for it." },
  { name: "Anker", notes: "Best margin on accessories." },
  { name: "JBL", notes: null },
  { name: "Belkin", notes: null },
  { name: "Spigen", notes: "Cases — reliable stock." },
  { name: "OtterBox", notes: "Premium cases, lifetime warranty." },
  { name: "UGREEN", notes: null },
  { name: "PanzerGlass", notes: "Screen protectors." },
  { name: "Baseus", notes: null },
];

const VENDOR_NAMES = [
  ["GoRecell", "CAD", "Calgary", "AB", null, "Daniel Whitfield"],
  ["Mobile Parts Wholesale", "CAD", "Toronto", "ON", null, "Priya Nair"],
  ["Shenzhen Direct Trading", "USD", "Shenzhen", "Guangdong", "CN", "Wei Zhang"],
  ["PhoneParts Canada", "CAD", "Vancouver", "BC", null, "Marcus Lee"],
  ["TechSource Distribution", "USD", "Buffalo", "NY", "US", "Karen Doyle"],
  ["Northern Cellular Supply", "CAD", "Edmonton", "AB", null, "Jesse Cardinal"],
  ["Prairie Wireless Wholesale", "CAD", "Winnipeg", "MB", null, "Amanda Roy"],
  ["HK Components Ltd", "USD", "Kowloon", "Hong Kong", "HK", "Alan Cheung"],
  ["Second Shop Trade-Ins", "CAD", "Calgary", "AB", null, "Omar Haddad"],
  ["Maple Accessories Co", "CAD", "Mississauga", "ON", null, "Rachel Kim"],
  ["Rocky Mountain Mobile", "CAD", "Canmore", "AB", null, "Tyler Brooks"],
  ["Pacific Device Supply", "CAD", "Burnaby", "BC", null, "Jennifer Wu"],
  ["Great Lakes Electronics", "USD", "Detroit", "MI", "US", "Robert Klein"],
  ["Guangzhou Parts Hub", "USD", "Guangzhou", "Guangdong", "CN", "Li Mei"],
  ["Alberta Screen Repair Supply", "CAD", "Red Deer", "AB", null, "Chris Bouchard"],
  ["Bow Valley Distributors", "CAD", "Calgary", "AB", null, "Nadia Farouk"],
  ["QuickCell Wholesale", "CAD", "Ottawa", "ON", null, "Steve Tremblay"],
  ["Dubai Mobile Trading", "USD", "Dubai", "Dubai", "AE", "Yusuf Al-Rashid"],
  ["Atlantic Phone Parts", "CAD", "Halifax", "NS", null, "Megan O'Brien"],
  ["Cascade Tech Imports", "USD", "Seattle", "WA", "US", "Brian Sato"],
  ["Trade-In Traders", "CAD", "Calgary", "AB", null, "Hassan Malik"],
  ["Central Battery Supply", "CAD", "Saskatoon", "SK", null, "Laura Friesen"],
  ["Prime Accessory Imports", "USD", "Los Angeles", "CA", "US", "Diana Cruz"],
  ["Chinook Wireless Parts", "CAD", "Lethbridge", "AB", null, "Kyle Adams"],
  ["EastPoint Cellular", "CAD", "Montreal", "QC", null, "Sophie Girard"],
];

/** Sub-categories nested under whatever top-level ones already exist. */
const SUBCATEGORIES = {
  Phones: ["Smart Phones", "Basic Phones", "Foldables", "Trade-In Phones"],
  Tablets: ["iPads", "Android Tablets", "Tablet Keyboards"],
  Laptops: ["MacBooks", "Windows Laptops", "Chromebooks"],
  Watches: ["Smart Watches", "Watch Bands"],
  Accessories: [
    "Cases",
    "Chargers",
    "Cables",
    "Headphones",
    "Screen Protectors",
    "Power Banks",
    "Car Mounts",
    "Speakers",
    "Memory Cards",
  ],
  Parts: [
    "Screens",
    "Batteries",
    "Charging Ports",
    "Cameras",
    "Back Glass",
    "Speakers & Mics",
    "Frames",
    "Tools",
  ],
  "Repair Services": ["Screen Repair", "Battery Replacement", "Water Damage", "Data Recovery"],
};

const PHONE_MODELS = {
  Apple: ["iPhone 11", "iPhone 12", "iPhone 12 Pro", "iPhone 13", "iPhone 13 Pro Max", "iPhone 14", "iPhone 14 Pro", "iPhone 15", "iPhone SE"],
  Samsung: ["Galaxy A20", "Galaxy A52", "Galaxy A54", "Galaxy S20", "Galaxy S21", "Galaxy S22 Ultra", "Galaxy S23", "Galaxy Z Flip 4", "Galaxy Z Fold 4"],
  Google: ["Pixel 6", "Pixel 6a", "Pixel 7", "Pixel 7 Pro", "Pixel 8", "Pixel 8 Pro"],
  Motorola: ["Moto G Play", "Moto G Power", "Moto G Stylus", "Edge 30", "Edge 40"],
  LG: ["G8 ThinQ", "V60 ThinQ", "Velvet"],
  OnePlus: ["Nord N20", "9 Pro", "10T", "11"],
  Huawei: ["P30 Lite", "Nova 9"],
  Xiaomi: ["Redmi Note 11", "Redmi Note 12", "Poco X5"],
  Nokia: ["105 4G", "G21"],
  Sony: ["Xperia 5 IV"],
  Oppo: ["Reno 8", "A78"],
  Nothing: ["Phone (2)"],
};

const STORAGES = ["64GB", "128GB", "256GB", "512GB"];
const COLORS = ["Black", "White", "Midnight", "Blue", "Graphite", "Silver", "Red", "Green", "Purple", "Gold", "Starlight"];

const ACCESSORIES = [
  { brand: "Anker", sub: "Power Banks", names: ["PowerCore 10000 Power Bank", "PowerCore 20000 Power Bank", "MagGo Battery Pack"] },
  { brand: "Anker", sub: "Chargers", names: ["PowerPort III 65W Charger", "Nano 3 30W Charger", "MagGo Wireless Charger"] },
  { brand: "Anker", sub: "Cables", names: ["PowerLine III USB-C Cable", "USB-C to Lightning Cable 6ft", "Braided USB-C Cable 10ft"] },
  { brand: "JBL", sub: "Headphones", names: ["Tune 510BT Headphones", "Vibe Beam Earbuds", "Tune Flex Earbuds"] },
  { brand: "JBL", sub: "Speakers", names: ["Flip 6 Speaker", "Go 3 Speaker", "Charge 5 Speaker"] },
  { brand: "Apple", sub: "Chargers", names: ["20W USB-C Power Adapter", "MagSafe Charger", "35W Dual USB-C Adapter"] },
  { brand: "Apple", sub: "Cables", names: ["Lightning to USB-C Cable", "USB-C Charge Cable 2m"] },
  { brand: "Samsung", sub: "Chargers", names: ["25W Travel Adapter", "Wireless Charger Duo", "45W Super Fast Charger"] },
  { brand: "Spigen", sub: "Cases", names: ["Ultra Hybrid Case", "Liquid Air Case", "Tough Armor Case", "Rugged Armor Case"] },
  { brand: "OtterBox", sub: "Cases", names: ["Defender Series Case", "Commuter Series Case", "Symmetry Series Case"] },
  { brand: "PanzerGlass", sub: "Screen Protectors", names: ["Ultra-Wide Fit Glass", "Privacy Screen Protector", "Standard Fit Glass"] },
  { brand: "Belkin", sub: "Car Mounts", names: ["MagSafe Car Vent Mount", "Dashboard Phone Mount"] },
  { brand: "UGREEN", sub: "Cables", names: ["USB-C Hub 6-in-1", "HDMI Cable 2m", "USB-C to HDMI Adapter"] },
  { brand: "Baseus", sub: "Power Banks", names: ["Blade 20000 Power Bank", "Magnetic Wireless Power Bank"] },
  { brand: "Belkin", sub: "Memory Cards", names: ["SD Card Reader"] },
];

const PARTS = [
  { suffix: "Screen Assembly", sub: "Screens", min: 45, max: 220 },
  { suffix: "Replacement Battery", sub: "Batteries", min: 12, max: 60 },
  { suffix: "Charging Port Flex", sub: "Charging Ports", min: 8, max: 35 },
  { suffix: "Rear Camera Module", sub: "Cameras", min: 20, max: 90 },
  { suffix: "Back Glass", sub: "Back Glass", min: 15, max: 70 },
  { suffix: "Earpiece Speaker", sub: "Speakers & Mics", min: 5, max: 25 },
];

const SERVICES = [
  { name: "Screen Repair — Standard", sub: "Screen Repair", price: 129 },
  { name: "Screen Repair — Premium", sub: "Screen Repair", price: 199 },
  { name: "Battery Replacement", sub: "Battery Replacement", price: 89 },
  { name: "Water Damage Assessment", sub: "Water Damage", price: 49 },
  { name: "Water Damage Treatment", sub: "Water Damage", price: 149 },
  { name: "Data Recovery — Basic", sub: "Data Recovery", price: 99 },
  { name: "Data Recovery — Advanced", sub: "Data Recovery", price: 249 },
];

const FIRST_NAMES = [
  "Ahmad", "Sarah", "Mohammed", "Jennifer", "David", "Fatima", "Michael", "Aisha", "Robert", "Maria",
  "Omar", "Linda", "James", "Zainab", "Daniel", "Emily", "Yusuf", "Jessica", "Hassan", "Michelle",
  "Kevin", "Amina", "Brian", "Nicole", "Tariq", "Rachel", "Steven", "Layla", "Andrew", "Samira",
  "Jason", "Christina", "Bilal", "Melissa", "Ryan", "Noor", "Eric", "Amanda", "Karim", "Stephanie",
  "Justin", "Hana", "Adam", "Laura", "Farhan", "Nadia", "Chris", "Sofia", "Nathan", "Rania",
];

const LAST_NAMES = [
  "Khan", "Smith", "Ahmed", "Johnson", "Ali", "Williams", "Hussain", "Brown", "Rahman", "Jones",
  "Patel", "Miller", "Singh", "Davis", "Nguyen", "Wilson", "Chen", "Taylor", "Malik", "Anderson",
  "Haddad", "Thomas", "Osman", "Martin", "Kaur", "Lee", "Farah", "Clark", "Sharma", "Lewis",
];

const STREETS = [
  "17 Ave SW", "Macleod Trail", "Centre St N", "Bow Trail SW", "16 Ave NW", "Crowchild Trail",
  "Memorial Dr", "Elbow Dr SW", "Edmonton Trail", "Barlow Trail SE", "Deerfoot Trail", "Country Hills Blvd",
];

const CUSTOMER_NOTES = [
  "Prefers text over calls.",
  "Regular — repairs both work phones here.",
  "Always asks for a receipt by email.",
  "Owns a small business, buys in twos.",
  null, null, null, null, null,
];

const PO_NOTES = ["PO-" + digits(5), "Weekly shipment", "Restock order", "Trade-in batch", null, null];

/* -------------------------------- wipe -------------------------------- */

async function wipe() {
  const demoProducts = await prisma.product.findMany({
    where: { sku: { startsWith: "DEMO-" } },
    select: { id: true },
  });
  const ids = demoProducts.map((p) => p.id);

  const units = await prisma.productUnit.deleteMany({ where: { productId: { in: ids } } });
  const stock = await prisma.stockEntry.deleteMany({ where: { productId: { in: ids } } });
  const products = await prisma.product.deleteMany({ where: { id: { in: ids } } });
  const customers = await prisma.customer.deleteMany({
    where: { email: { endsWith: "@example.test" } },
  });

  // Brands and vendors only go if nothing real is attached to them.
  let brands = 0;
  for (const b of BRANDS) {
    const found = await prisma.brand.findFirst({
      where: { name: b.name },
      include: { _count: { select: { products: true } } },
    });
    if (found && found._count.products === 0) {
      await prisma.brand.delete({ where: { id: found.id } });
      brands++;
    }
  }

  let vendors = 0;
  for (const [name] of VENDOR_NAMES) {
    const found = await prisma.vendor.findFirst({
      where: { name },
      include: { _count: { select: { products: true } } },
    });
    if (found && found._count.products === 0) {
      try {
        await prisma.vendor.delete({ where: { id: found.id } });
        vendors++;
      } catch {
        // Still referenced by a stock entry — leave it.
      }
    }
  }

  let cats = 0;
  for (const subs of Object.values(SUBCATEGORIES)) {
    for (const name of subs) {
      const found = await prisma.category.findFirst({
        where: { name, parentId: { not: null } },
        include: { _count: { select: { products: true, children: true } } },
      });
      if (found && found._count.products === 0 && found._count.children === 0) {
        await prisma.category.delete({ where: { id: found.id } });
        cats++;
      }
    }
  }

  console.log(`Removed: ${products.count} products, ${units.count} units, ${stock.count} stock entries,`);
  console.log(`         ${customers.count} customers, ${brands} brands, ${vendors} vendors, ${cats} sub-categories.`);
  console.log("Anything still attached to real records was left alone.");
}

/* -------------------------------- seed -------------------------------- */

async function seed() {
  const locations = await prisma.location.findMany({ where: { active: true } });
  if (locations.length === 0) {
    console.error("No locations found. Run `npm run seed` first.");
    process.exit(1);
  }

  /* brands */
  const brands = {};
  for (const b of BRANDS) {
    brands[b.name] =
      (await prisma.brand.findFirst({ where: { name: b.name } })) ||
      (await prisma.brand.create({ data: b }));
  }
  console.log(`Brands: ${Object.keys(brands).length}`);

  /* vendors */
  const vendors = [];
  for (const [name, currency, city, province, country, contactPerson] of VENDOR_NAMES) {
    const existing = await prisma.vendor.findFirst({ where: { name } });
    vendors.push(
      existing ||
        (await prisma.vendor.create({
          data: {
            name,
            accountNumber: "CCC-" + digits(5),
            contactPerson,
            currency,
            phone: `+1 ${int(200, 999)} ${digits(3)} ${digits(4)}`,
            mobile: Math.random() > 0.4 ? `+1 ${int(200, 999)} ${digits(3)} ${digits(4)}` : null,
            fax: Math.random() > 0.7 ? `+1 ${int(200, 999)} ${digits(3)} ${digits(4)}` : null,
            email1: `orders@${name.toLowerCase().replace(/[^a-z]/g, "")}.example.test`,
            email2: Math.random() > 0.6 ? `accounts@${name.toLowerCase().replace(/[^a-z]/g, "")}.example.test` : null,
            country: country || "CA",
            address: `${int(100, 9999)} ${pick(STREETS)}`,
            city,
            province,
            postal: country ? null : `T${int(1, 3)}${pick("ABCEGHJ".split(""))} ${int(0, 9)}${pick("ABCEGHJ".split(""))}${int(0, 9)}`,
            notes: Math.random() > 0.5 ? "Net 30. Free shipping over $500." : null,
          },
        }))
    );
  }
  console.log(`Vendors: ${vendors.length}`);

  /* categories */
  const subCats = {};
  let parentsFound = 0;
  for (const [parentName, subs] of Object.entries(SUBCATEGORIES)) {
    const parent = await prisma.category.findFirst({ where: { name: parentName, parentId: null } });
    if (!parent) continue;
    parentsFound++;
    for (const name of subs) {
      const existing = await prisma.category.findFirst({ where: { name, parentId: parent.id } });
      subCats[name] = existing || (await prisma.category.create({ data: { name, parentId: parent.id } }));
    }
  }
  console.log(`Categories: ${parentsFound} top-level, ${Object.keys(subCats).length} sub-categories`);

  /* products */
  const TARGET = 250;
  const drafts = [];
  let n = 0;
  const nextSku = () => "DEMO-" + String(++n).padStart(4, "0");

  // Phones — where the serials live.
  for (const [brandName, models] of Object.entries(PHONE_MODELS)) {
    for (const model of models) {
      for (const storage of [...new Set([pick(STORAGES), pick(STORAGES)])]) {
        const cost = int(120, 950) * 100;
        drafts.push({
          name: `${brandName} ${model} ${storage}`,
          sku: nextSku(),
          upc: digits(12),
          ean: Math.random() > 0.5 ? digits(13) : null,
          customSku: Math.random() > 0.7 ? `${brandName.slice(0, 3).toUpperCase()}-${digits(6)}` : null,
          brandId: brands[brandName]?.id ?? null,
          categoryId: (subCats[model.match(/Flip|Fold/) ? "Foldables" : "Smart Phones"] ?? subCats["Smart Phones"])?.id ?? null,
          vendorId: pick(vendors).id,
          costCents: cost,
          salePriceCents: Math.round(cost * (1.25 + Math.random() * 0.4)),
          onlinePriceCents: Math.round(cost * (1.35 + Math.random() * 0.45)),
          reorderAt: int(0, 3),
          _serialised: true,
        });
      }
    }
  }

  // Accessories — counted stock, no serials.
  for (const group of ACCESSORIES) {
    for (const name of group.names) {
      const cost = int(8, 90) * 100;
      drafts.push({
        name: `${group.brand} ${name}`,
        sku: nextSku(),
        upc: digits(12),
        ean: null,
        customSku: null,
        brandId: brands[group.brand]?.id ?? null,
        categoryId: subCats[group.sub]?.id ?? null,
        vendorId: pick(vendors).id,
        costCents: cost,
        salePriceCents: Math.round(cost * (1.6 + Math.random() * 0.8)),
        onlinePriceCents: Math.round(cost * (1.5 + Math.random() * 0.7)),
        reorderAt: int(2, 6),
        _serialised: false,
      });
    }
  }

  // Parts — the repair side.
  for (const [brandName, models] of Object.entries(PHONE_MODELS)) {
    for (const model of models.slice(0, 5)) {
      for (const part of PARTS) {
        if (drafts.length >= TARGET - SERVICES.length) break;
        const cost = int(part.min, part.max) * 100;
        drafts.push({
          name: `${brandName} ${model} ${part.suffix}`,
          sku: nextSku(),
          upc: Math.random() > 0.5 ? digits(12) : null,
          ean: null,
          customSku: null,
          brandId: brands[brandName]?.id ?? null,
          categoryId: subCats[part.sub]?.id ?? null,
          vendorId: pick(vendors).id,
          costCents: cost,
          salePriceCents: Math.round(cost * (1.7 + Math.random() * 0.9)),
          onlinePriceCents: Math.round(cost * (1.8 + Math.random() * 0.8)),
          reorderAt: int(1, 5),
          _serialised: false,
        });
      }
    }
  }

  // Services — no cost, no stock.
  for (const s of SERVICES) {
    drafts.push({
      name: s.name,
      sku: nextSku(),
      upc: null,
      ean: null,
      customSku: null,
      brandId: null,
      categoryId: subCats[s.sub]?.id ?? null,
      vendorId: null,
      costCents: 0,
      salePriceCents: s.price * 100,
      onlinePriceCents: s.price * 100,
      reorderAt: 0,
      _service: true,
      _serialised: false,
    });
  }

  const created = [];
  for (const p of drafts.slice(0, TARGET)) {
    const { _serialised, _service, ...data } = p;
    const row = await prisma.product.create({ data });
    created.push({ ...row, _serialised, _service });
  }
  console.log(`Products: ${created.length}`);

  /* stock entries — this is where quantity comes from */
  const stockRows = [];
  for (const p of created) {
    if (p._service) continue; // services don't hold stock

    const receipts = weighted([
      [0, 1],
      [1, 5],
      [2, 3],
      [3, 1],
    ]);

    for (let i = 0; i < receipts; i++) {
      // Costs drift a little between batches, so the weighted average earns its keep.
      const drift = 0.9 + Math.random() * 0.25;
      stockRows.push({
        productId: p.id,
        quantity: p._serialised ? int(1, 8) : int(3, 40),
        costCents: Math.round(p.costCents * drift),
        vendorId: p.vendorId ?? pick(vendors).id,
        note: pick(PO_NOTES),
      });
    }

    // A few corrections, so negative entries appear in the history.
    if (receipts > 0 && Math.random() > 0.85) {
      stockRows.push({
        productId: p.id,
        quantity: -int(1, 3),
        costCents: p.costCents,
        vendorId: null,
        note: "Stock count correction",
      });
    }
  }

  for (let i = 0; i < stockRows.length; i += 50) {
    await prisma.stockEntry.createMany({ data: stockRows.slice(i, i + 50) });
  }
  console.log(`Stock entries: ${stockRows.length}`);

  /* units — 300 serials, weighted to the phones */
  const UNIT_TARGET = 300;
  const serialised = created.filter((p) => p._serialised);
  const rest = created.filter((p) => !p._serialised && !p._service);

  const unitRows = [];
  let s = 0;
  const nextSerial = () => "D" + String(++s).padStart(6, "0") + digits(6);

  for (const p of serialised) {
    const count = weighted([
      [0, 2],
      [1, 3],
      [2, 3],
      [3, 2],
      [int(6, 15), 1],
    ]);
    for (let i = 0; i < count; i++) {
      if (unitRows.length >= UNIT_TARGET) break;
      unitRows.push({
        productId: p.id,
        serial: nextSerial(),
        condition: weighted([
          ["USED_GOOD", 5],
          ["USED_LIKE_NEW", 3],
          ["NEW", 2],
          ["USED_FAIR", 2],
          ["OPEN_BOX", 1],
          ["FOR_PARTS", 1],
        ]),
        storage: pick(STORAGES),
        color: pick(COLORS),
        warrantyMonths: weighted([
          [3, 5],
          [6, 3],
          [12, 2],
          [0, 1],
        ]),
        locationId: pick(locations).id,
        status: weighted([
          ["IN_STOCK", 6],
          ["SOLD", 3],
          ["RESERVED", 1],
        ]),
      });
    }
    if (unitRows.length >= UNIT_TARGET) break;
  }

  while (unitRows.length < UNIT_TARGET && rest.length) {
    const p = pick(rest);
    unitRows.push({
      productId: p.id,
      serial: nextSerial(),
      condition: weighted([
        ["NEW", 6],
        ["OPEN_BOX", 2],
        ["USED_GOOD", 1],
      ]),
      storage: null,
      color: pick(COLORS),
      warrantyMonths: pick([3, 3, 6, 12]),
      locationId: pick(locations).id,
      status: weighted([
        ["IN_STOCK", 8],
        ["SOLD", 2],
      ]),
    });
  }

  for (let i = 0; i < unitRows.length; i += 50) {
    await prisma.productUnit.createMany({ data: unitRows.slice(i, i + 50) });
  }
  console.log(`Units: ${unitRows.length}`);

  /* customers */
  const customers = [];
  const used = new Set();
  for (let i = 0; i < 50; i++) {
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    let email = `${firstName}.${lastName}${i}`.toLowerCase() + "@example.test";
    while (used.has(email)) email = `${firstName}.${lastName}${i}${int(1, 99)}`.toLowerCase() + "@example.test";
    used.add(email);

    customers.push({
      firstName,
      lastName,
      phone: `403 ${digits(3)} ${digits(4)}`,
      email,
      address: `${int(100, 9999)} ${pick(STREETS)}`,
      city: "Calgary",
      postal: `T${int(1, 3)}${pick("ABCEGHJ".split(""))} ${int(0, 9)}${pick("ABCEGHJ".split(""))}${int(0, 9)}`,
      notes: pick(CUSTOMER_NOTES),
    });
  }
  await prisma.customer.createMany({ data: customers });
  console.log(`Customers: ${customers.length}`);

  console.log("\nDone. Run `node prisma/demo.js --wipe` to take it all out again.");
}

/* -------------------------------- run -------------------------------- */

const main = process.argv.includes("--wipe") ? wipe : seed;

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());