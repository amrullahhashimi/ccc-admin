/**
 * The parser and the comparison, on the messages that actually arrive.
 *
 * Run with `npm test` (node --test) — no test framework to install.
 *
 * These are the cases that decide whether the feature can be trusted: reading a
 * price that isn't marked as one, keeping a quantity rebate attached to the
 * right lines, and refusing to merge two products that differ where it counts.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { parseMessage, parseLine } = require("../src/sourcing/parse");
const { buildMatchKey, displayName } = require("../src/sourcing/normalize");
const { rankMatches, scoreMatch } = require("../src/sourcing/match");
const { compareProduct } = require("../src/sourcing/compare");

const one = (line) => parseLine(line, {});

/* ----------------------------- 1. plain line ----------------------------- */

test('1. "iPhone XR 64gb $110"', () => {
  const item = one("iPhone XR 64gb $110");
  assert.equal(item.brand, "Apple");
  assert.equal(item.model, "iPhone XR");
  assert.equal(item.storage, "64GB");
  assert.equal(item.priceCents, 11000);
  assert.equal(item.minQuantity, 1);
  assert.equal(item.productType, "Phone");
});

test('1b. the same line written three other ways', () => {
  for (const line of ["iPhone XR 64GB 110", "IPHONE XR 64 GB - $110", "iphone xr 64gb $110"]) {
    const item = one(line);
    assert.equal(item.model, "iPhone XR", line);
    assert.equal(item.storage, "64GB", line);
    assert.equal(item.priceCents, 11000, line);
  }
});

/* -------------------------- 2. specs and grade -------------------------- */

test('2. "iPad 8 wifi+cell 32GB Grade A $145"', () => {
  const item = one("iPad 8 wifi+cell 32GB Grade A $145");
  assert.equal(item.brand, "Apple");
  assert.equal(item.model, "iPad 8");
  assert.equal(item.storage, "32GB");
  assert.equal(item.connectivity, "WiFi + Cellular");
  assert.equal(item.grade, "A");
  assert.equal(item.priceCents, 14500);
  assert.equal(item.productType, "Tablet");
});

/* ---------------------------- 3. bare "Each" ---------------------------- */

test('3. "iPad 8 119.99 Each"', () => {
  const item = one("iPad 8 119.99 Each");
  assert.equal(item.model, "iPad 8");
  assert.equal(item.priceCents, 11999);
  assert.equal(item.minQuantity, 1);
});

/* ------------------------- 4. rebate on one line ------------------------- */

test('4. "Quantity Rebates If you take 10 or more iPad 8 119.99 Each"', () => {
  const { items } = parseMessage("Quantity Rebates If you take 10 or more iPad 8 119.99 Each");
  assert.equal(items.length, 1);
  assert.equal(items[0].model, "iPad 8");
  assert.equal(items[0].priceCents, 11999);
  assert.equal(items[0].minQuantity, 10);
  assert.equal(items[0].maxQuantity, null);
});

test("4b. a rebate heading carries down the lines beneath it", () => {
  const { items } = parseMessage(
    ["Quantity Rebates", "If you take 10 or more", "iPad 8 119.99 Each", "iPad 7 109.99 Each", "iPad 6 79.99$ Each", "iPad 5 69.99$ Each"].join("\n")
  );
  assert.equal(items.length, 4);
  assert.deepEqual(items.map((i) => i.model), ["iPad 8", "iPad 7", "iPad 6", "iPad 5"]);
  assert.deepEqual(items.map((i) => i.priceCents), [11999, 10999, 7999, 6999]);
  assert.ok(items.every((i) => i.minQuantity === 10), "every line inherits the rebate quantity");
});

/* ------------------------------ 5. computer ------------------------------ */

test('5. "Surface Pro i5-11th Gen 8Gb 256Gb $440"', () => {
  const item = one("Surface Pro i5-11th Gen 8Gb 256Gb $440");
  assert.equal(item.brand, "Microsoft");
  assert.equal(item.model, "Surface Pro");
  assert.equal(item.cpu, "i5-11th Gen");
  assert.equal(item.ram, "8GB", "the smaller size on a computer is RAM");
  assert.equal(item.storage, "256GB");
  assert.equal(item.priceCents, 44000);
});

/* ------------------------- 6. multi-word models ------------------------- */

test('6. "Pixel 9 pro fold $770"', () => {
  const item = one("Pixel 9 pro fold $770");
  assert.equal(item.brand, "Google");
  assert.equal(item.model, "Pixel 9 Pro Fold");
  assert.equal(item.priceCents, 77000);
});

test('6b. "Pixel 10 pro fol $1000" — one-letter typo is repaired', () => {
  const item = one("Pixel 10 pro fol $1000");
  assert.equal(item.model, "Pixel 10 Pro Fold");
  assert.equal(item.priceCents, 100000);
});

/* ------------------------------ 7. OnePlus ------------------------------ */

test('7. "Oneplus Open 512GB $700"', () => {
  const item = one("Oneplus Open 512GB $700");
  assert.equal(item.brand, "OnePlus");
  assert.equal(item.model, "OnePlus Open");
  assert.equal(item.storage, "512GB");
  assert.equal(item.priceCents, 70000);
});

test('7b. "Oneplus 15 512GB $800"', () => {
  const item = one("Oneplus 15 512GB $800");
  assert.equal(item.model, "OnePlus 15");
  assert.equal(item.storage, "512GB");
  assert.equal(item.priceCents, 80000);
});

/* --------------------------- whole messages --------------------------- */

test("Vendor A's message, end to end", () => {
  const message = [
    "Phone 16e. 128gb 480",
    "iPhone XR 64gb $110",
    "Pixel 9 pro fold $770",
    "Pixel 10 pro fol $1000",
    "Oneplus 15 512GB $800",
    "Oneplus Open 512GB $700",
    "Ipad 8 wifi+cell 32GB Grade A $145",
    "Ipad mini 6 wifi 64GB Grade A $365",
    "Ipad Air 5 wifi 64GB Grade A $395",
    "Surface Pro i5-11th Gen 8Gb 256Gb $440",
  ].join("\n");

  const { items, skipped } = parseMessage(message);
  assert.equal(skipped.length, 0, "every line should be read");
  assert.equal(items.length, 10);

  assert.equal(items[0].model, "iPhone 16e", '"Phone 16e" is read as an iPhone');
  assert.equal(items[0].storage, "128GB");
  assert.equal(items[0].priceCents, 48000);
  assert.ok(items[0].warnings.some((w) => /Phone/.test(w)), "and the assumption is flagged");

  assert.equal(items[6].model, "iPad 8", '"Ipad" is spelled the house way');
  assert.equal(items[6].connectivity, "WiFi + Cellular");

  assert.equal(items[7].model, "iPad Mini 6");
  assert.equal(items[7].connectivity, "WiFi");
  assert.equal(items[7].grade, "A");

  assert.equal(items[8].model, "iPad Air 5");
  assert.equal(items[8].priceCents, 39500);

  assert.ok(items.every((i) => i.priceCents != null), "no line loses its price");
  assert.ok(items.every((i) => i.minQuantity === 1), "nothing invents a rebate");
});

test("Vendor B's message, end to end", () => {
  const { items } = parseMessage(
    ["Quantity Rebates", "If you take 10 or more", "iPad 8 119.99 Each", "iPad 7 109.99 Each", "iPad 6 79.99$ Each", "iPad 5 69.99$ Each"].join("\n")
  );
  assert.equal(items.length, 4);
  assert.ok(items.every((i) => i.brand === "Apple" && i.minQuantity === 10));
  assert.equal(items[0].storage, null, "the vendor didn't say, so we don't either");
  assert.equal(items[0].condition, null);
  assert.equal(items[0].grade, null);
});

test("a model number is never mistaken for a price", () => {
  const item = one("iPad 8");
  assert.equal(item.model, "iPad 8");
  assert.equal(item.priceCents, null);
  assert.ok(item.warnings.some((w) => /price/i.test(w)));
});

test("chatter and headings are set aside, not turned into products", () => {
  const { items, skipped } = parseMessage(
    ["Hi Amrullah", "Today's list", "----", "iPhone XR 64gb $110", "Thanks"].join("\n")
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].model, "iPhone XR");
  assert.equal(skipped.length, 0);
});

/* ------------------------------- matching ------------------------------- */

const productFrom = (line) => {
  const item = one(line);
  return { ...item, id: line, matchKey: buildMatchKey(item), normalizedName: displayName(item) };
};

test("the same product written differently matches exactly", () => {
  const existing = productFrom("Apple iPad 8 WiFi 32GB Grade A $150");
  const incoming = one("Ipad 8 wifi 32gb grade a $145");
  const { score, exact } = scoreMatch(incoming, existing);
  assert.equal(score, 100);
  assert.ok(exact);
});

test("WiFi is never merged into WiFi + Cellular on its own", () => {
  const existing = productFrom("iPad 8 WiFi 32GB $150");
  const incoming = one("iPad 8 wifi+cell 32GB $145");
  const { score, conflicts } = scoreMatch(incoming, existing);
  assert.ok(conflicts.includes("connectivity"));
  assert.ok(score < 95, `conflicting connectivity must stay below auto-accept, got ${score}`);

  const { decision } = rankMatches(incoming, [existing]);
  assert.notEqual(decision, "accept");
});

test("Grade A and Grade B stay apart", () => {
  const existing = productFrom("iPad 8 WiFi 32GB Grade A $150");
  const incoming = one("iPad 8 wifi 32GB Grade B $120");
  const { score, conflicts } = scoreMatch(incoming, existing);
  assert.ok(conflicts.includes("grade"));
  assert.ok(score < 95);
});

test("different storage is a conflict, not a near miss", () => {
  const existing = productFrom("iPad 8 WiFi 32GB $150");
  const incoming = one("iPad 8 wifi 128GB $190");
  const { conflicts, score } = scoreMatch(incoming, existing);
  assert.ok(conflicts.includes("storage"));
  assert.ok(score < 95);
});

test("nothing similar at all proposes a new product", () => {
  const existing = productFrom("iPad 8 WiFi 32GB $150");
  const incoming = one("Oneplus Open 512GB $700");
  const { decision } = rankMatches(incoming, [existing]);
  assert.equal(decision, "new");
});

/* ------------------------------ comparison ------------------------------ */

const offer = (vendorId, priceCents, minQuantity = 1, maxQuantity = null) => ({
  id: `${vendorId}-${minQuantity}`,
  vendorId,
  priceCents,
  minQuantity,
  maxQuantity,
  currency: "CAD",
  active: true,
});

test("8. two vendors at different prices — the cheaper one is green", () => {
  const result = compareProduct({ id: "p1" }, {
    A: { vendorName: "Vendor A", offers: [offer("A", 14500)] },
    B: { vendorName: "Vendor B", offers: [offer("B", 11999)] },
    C: { vendorName: "Vendor C", offers: [offer("C", 12500)] },
  }, 1);

  assert.equal(result.cheapestCents, 11999);
  assert.equal(result.vendors[0].vendorId, "B");
  assert.equal(result.vendors[0].tone, "cheapest");
  assert.equal(result.vendors[1].tone, "higher");
  assert.equal(result.savingsCents, 501, "savings are against the next cheapest, not the dearest");
});

test("9. two vendors at exactly the same price — both yellow, neither green", () => {
  const result = compareProduct({ id: "p1" }, {
    A: { offers: [offer("A", 12000)] },
    B: { offers: [offer("B", 12000)] },
    C: { offers: [offer("C", 12500)] },
  }, 1);

  assert.ok(result.tied);
  const tones = Object.fromEntries(result.vendors.map((v) => [v.vendorId, v.tone]));
  assert.equal(tones.A, "tied");
  assert.equal(tones.B, "tied");
  assert.equal(tones.C, "higher");
  assert.equal(result.vendors.filter((v) => v.tone === "cheapest").length, 0);
});

test("10. quantity moves the winner", () => {
  const offers = {
    A: { offers: [offer("A", 13000, 1, 4), offer("A", 12500, 5, 9), offer("A", 11500, 25)] },
    B: { offers: [offer("B", 12000, 1)] },
  };

  const atOne = compareProduct({ id: "p1" }, offers, 1);
  assert.equal(atOne.vendors[0].vendorId, "B", "at one unit B is cheaper");
  assert.equal(atOne.vendors.find((v) => v.vendorId === "A").priceCents, 13000);

  const atFive = compareProduct({ id: "p1" }, offers, 5);
  assert.equal(atFive.vendors[0].vendorId, "B", "at five B still wins by $5");

  const atThirty = compareProduct({ id: "p1" }, offers, 30);
  assert.equal(atThirty.vendors[0].vendorId, "A", "at thirty A's 25+ tier takes it");
  assert.equal(atThirty.vendors[0].priceCents, 11500);
  assert.ok(atThirty.vendors[0].quantityBreak);
});

test("a vendor with no tier covering the quantity is left out entirely", () => {
  const result = compareProduct({ id: "p1" }, {
    A: { offers: [offer("A", 11999, 10)] },
    B: { offers: [offer("B", 12500, 1)] },
  }, 1);

  assert.equal(result.vendors.length, 1);
  assert.equal(result.vendors[0].vendorId, "B");
  assert.equal(result.savingsCents, null, "one vendor means nothing to compare against");
});

test("quantity tiers written under a product are attached to it", () => {
  const { items } = parseMessage(["iPad 8 WiFi 32GB", "1-4 $130", "5-9 $125", "10-24 $119.99", "25+ $115"].join("\n"));
  assert.equal(items.length, 5);
  assert.deepEqual(
    items.slice(1).map((i) => [i.minQuantity, i.maxQuantity, i.priceCents]),
    [[1, 4, 13000], [5, 9, 12500], [10, 24, 11999], [25, null, 11500]]
  );
  assert.ok(items.slice(1).every((i) => i.model === "iPad 8"), "each tier keeps the product above it");
});

/* ---------------------------- tabular price lists ---------------------------- */
/*
 * Plenty of vendors paste a spreadsheet rather than typing a message. Read as
 * prose, the Condition column and the stock count end up inside the product
 * name — which is exactly what these guard against.
 */

const TABLE = [
  "Device\tCondition\tCarrier\tIn Stock - Live List\tWholesale Sell Price (CAD)",
  "Apple iPad 5 128GB\tGood\tWi-Fi\t4\t$150.00",
  "Apple iPad 5 128GB\tFair\tWi-Fi\t1\t$140.00",
  "Apple iPad 5 32GB\tGood\tWi-Fi & Cellular\t2\t$150.00",
  'Apple iPad Pro 9.7" (2016) 128GB\tFair\tWi-Fi\t2\t$235.00',
  "Apple iPhone 14 - eSim Only 128GB\tFair\tUnlocked\t1\t$420.00",
  "Apple Watch Series 11 42mm GPS \tMint\tWi-Fi\t1\t$395.00",
  "Samsung Galaxy S21 5G \tFair\tUnlocked-VZN\t1\t$200.00",
  "Sonim XP 9900 \tFair\tUnlocked\t34\t$265.00",
].join("\n");

test("a pasted spreadsheet is read as columns", () => {
  const { items, skipped, format } = parseMessage(TABLE);
  assert.equal(format, "table");
  assert.equal(items.length, 8, "the heading row is not a product");
  assert.equal(skipped.length, 0);
});

test("the heading row never becomes a product", () => {
  const { items } = parseMessage(TABLE);
  assert.ok(
    !items.some((i) => /device|wholesale|live list/i.test(i.model ?? "")),
    items.map((i) => i.model).join(" | ")
  );
});

test("a Condition column lands under Condition, not in the name", () => {
  const { items } = parseMessage(TABLE);
  const [first, second] = items;
  assert.equal(first.model, "iPad 5");
  assert.equal(first.condition, "Good", "the vendor filed it under Condition, so that is where it goes");
  assert.equal(second.condition, "Fair");
  assert.equal(first.grade, null, "and nothing is invented for a column they did not send");
  assert.ok(!/good|fair/i.test(first.model + second.model));
});

test("a Grade column lands under Grade", () => {
  const { items } = parseMessage(
    ["Device\tGrade\tStock\tPrice", "Apple iPad 8 32GB\tA\t3\t$220.00", "Apple iPad 8 64GB\tB\t1\t$240.00"].join("\n")
  );
  assert.equal(items[0].grade, "A");
  assert.equal(items[0].condition, null);
  assert.equal(items[1].grade, "B");
});

test('"Fair" is never repaired into "Air"', () => {
  const { items } = parseMessage(TABLE);
  assert.ok(!items.some((i) => /\bAir\b/.test(i.model ?? "")), items.map((i) => i.model).join(" | "));
});

test("the stock count is stock, not a minimum order and not part of the name", () => {
  const { items } = parseMessage(TABLE);
  assert.equal(items[0].availableQuantity, 4);
  assert.equal(items[0].minQuantity, 1, "having four in stock does not mean you must buy four");
  assert.ok(!/\b4\b/.test(items[0].model));

  const sonim = items.find((i) => i.brand === "Sonim");
  assert.equal(sonim.availableQuantity, 34);
  assert.equal(sonim.model, "Sonim XP 9900");
});

test("a Carrier column holding connectivity is understood as connectivity", () => {
  const { items } = parseMessage(TABLE);
  assert.equal(items[0].connectivity, "WiFi");
  assert.equal(items[0].carrier, null);
  assert.equal(items[2].connectivity, "WiFi + Cellular");

  const xr = items.find((i) => i.model === "Galaxy S21");
  assert.equal(xr.carrier, "Unlocked-VZN");
});

test('a screen size is not a price: 9.7" stays 9.7"', () => {
  const { items } = parseMessage(TABLE);
  const pro = items.find((i) => /iPad Pro/.test(i.model));
  assert.equal(pro.screenSize, '9.7"');
  assert.equal(pro.priceCents, 23500, "the price comes from the price column");
  assert.equal(pro.model, "iPad Pro (2016)");
});

test("a watch keeps its own GPS variant over the vendor's Carrier column", () => {
  const { items } = parseMessage(TABLE);
  const watch = items.find((i) => /Watch/.test(i.model));
  assert.equal(watch.connectivity, "GPS");
  assert.equal(watch.condition, "Mint");
  assert.equal(watch.priceCents, 39500);
});

test("the same device in two conditions stays two products", () => {
  const { items } = parseMessage(TABLE);
  const [good, fair] = items;
  assert.notEqual(buildMatchKey(good), buildMatchKey(fair));

  const { conflicts, score } = scoreMatch(fair, { ...good, matchKey: buildMatchKey(good) });
  assert.ok(conflicts.includes("condition"));
  assert.ok(score < 95, "Good and Fair must never auto-merge");
});

test("the same device at two storage sizes stays two products", () => {
  const { items } = parseMessage(TABLE);
  const oneTwentyEight = items[0];
  const thirtyTwo = items[2];
  assert.notEqual(buildMatchKey(oneTwentyEight), buildMatchKey(thirtyTwo));
});

test("a table pasted without its heading row is still read as columns", () => {
  const { items, format } = parseMessage(
    [
      "Apple iPad 6 32GB\tGood\tWi-Fi\t15\t$175.00",
      "Apple iPhone 8 64GB\tGood\tUnlocked\t3\t$100.00",
      "Apple iPhone XR 64GB\tFair\tUnlocked\t15\t$160.00",
    ].join("\n")
  );
  assert.equal(format, "table");
  assert.equal(items.length, 3);
  assert.equal(items[0].condition, "Good");
  assert.equal(items[0].availableQuantity, 15);
  assert.equal(items[2].priceCents, 16000);
});

test("prose still parses as prose", () => {
  const { format, items } = parseMessage("iPhone XR 64gb $110\niPad 8 wifi+cell 32GB Grade A $145");
  assert.equal(format, "text");
  assert.equal(items.length, 2);
});

/* ------------------- word grades and partial-information matches ------------------- */

test("in prose the word grade decides which column it lands in", () => {
  // "Grade" makes it a grade...
  const graded = one("iPhone XR 64gb Grade Good $155");
  assert.equal(graded.model, "iPhone XR");
  assert.equal(graded.grade, "Good");
  assert.equal(graded.condition, null);
  assert.equal(graded.priceCents, 15500);

  // ...and without it, a bare word is the condition, the way vendors label it.
  const bare = one("iPad 6 32GB wifi Good $180");
  assert.equal(bare.model, "iPad 6");
  assert.equal(bare.condition, "Good");
  assert.equal(bare.grade, null);
  assert.equal(bare.connectivity, "WiFi");
});

test("agreement is scored over what both sides actually state", () => {
  // The catalogue row knows the carrier; this vendor's line doesn't say.
  const existing = productFrom("Apple iPhone XR 64GB Good Unlocked $170");
  const incoming = one("iPhone XR 64gb Good $155");

  const { score, unknowns, conflicts } = scoreMatch(incoming, existing);
  assert.equal(conflicts.length, 0, "silence is not disagreement");
  assert.ok(unknowns.includes("carrier"));
  assert.ok(score >= 90, `a line that agrees on everything it states should read as strong, got ${score}`);
  assert.ok(score < 95, "but one-sided silence must never auto-merge");
});

test("a strong partial match is offered for confirmation, not merged or ignored", () => {
  const existing = productFrom("Apple iPhone XR 64GB Good Unlocked $170");
  const incoming = one("iPhone XR 64gb Good $155");

  const { decision, suggested } = rankMatches(incoming, [existing]);
  assert.equal(decision, "review");
  assert.equal(suggested, existing.id, "the match is filled in ready to tick");
});

test("a conflicting attribute is never offered for confirmation", () => {
  const existing = productFrom("Apple iPhone XR 64GB Good Unlocked $170");
  const incoming = one("iPhone XR 128gb Good $190");

  const { decision, suggested } = rankMatches(incoming, [existing]);
  assert.notEqual(decision, "accept");
  assert.equal(suggested, null, "different storage is not something to tick past");
});

/* ------------------------------ online prices ------------------------------ */
/*
 * The network side can't be unit-tested without depending on somebody else's
 * website, so what is covered here is the judgement around it: what counts as
 * the same product, and what gets thrown away before a price is believed.
 */

const { isRelevant, queryFor } = require("../src/sourcing/online");

test("a search query drops a brand the model already says", () => {
  assert.equal(queryFor({ brand: "Sonim", model: "Sonim XP 9900", storage: null }), "Sonim XP 9900");
  assert.equal(queryFor({ brand: "Apple", model: "iPad 6", storage: "32GB" }), "Apple iPad 6 32GB");
});

test("a search query leaves out grade and carrier, which only narrow it to nothing", () => {
  const query = queryFor({ brand: "Apple", model: "iPhone XR", storage: "64GB", grade: "Good", carrier: "Unlocked" });
  assert.equal(query, "Apple iPhone XR 64GB");
});

test("a listing must name the model to count as the same product", () => {
  assert.ok(isRelevant("Refurbished (Good) - Apple iPhone XR 64GB - Black", { model: "iPhone XR" }));
  assert.ok(!isRelevant("iPhone 8 8+ X XS SE 2020 11 12 promax", { model: "iPhone XR" }), "an ad listing other models is not this product");
  assert.ok(!isRelevant("Apple iPad Air 2 32GB", { model: "iPad 6" }));
});

test("spacing differences don't lose a match", () => {
  assert.ok(isRelevant("Refurbished (Good) Sonim XP10 5G XP9900 Unlocked", { model: "Sonim XP 9900" }));
  assert.ok(isRelevant("Apple iPad6 32GB WiFi", { model: "iPad 6" }));
});

test("accessories are thrown away — a $13 case is not a $200 phone", () => {
  assert.ok(!isRelevant("Inskin Screen Protector for Sonim XP10 XP9900", { model: "Sonim XP 9900" }));
  assert.ok(!isRelevant("Case for Apple iPad 6 32GB", { model: "iPad 6" }));
  assert.ok(!isRelevant("Apple iPad 6 Charging Cable", { model: "iPad 6" }));
});

test("but not when the product itself is an accessory", () => {
  assert.ok(isRelevant("Otterbox Case for iPad 6", { model: "iPad 6", productType: "Accessory" }));
});

test("a lone quote is not painted green — there is nothing for it to beat", () => {
  const result = compareProduct({ id: "p1" }, { A: { offers: [offer("A", 16800)] } }, 1);
  assert.equal(result.vendors.length, 1);
  assert.equal(result.vendors[0].tone, "only");
  assert.equal(result.savingsCents, null);
});

test("but two quotes get the full green and red", () => {
  const result = compareProduct({ id: "p1" }, { A: { offers: [offer("A", 16800)] }, B: { offers: [offer("B", 17500)] } }, 1);
  assert.deepEqual(result.vendors.map((v) => v.tone), ["cheapest", "higher"]);
});

test("a family qualifier the product doesn't have rules a listing out", () => {
  // An iPad Mini 6 is $470 and an iPad 6 is $130. Same words, different product.
  assert.ok(!isRelevant("2021 Apple iPad Mini 6 (Wi-Fi, 64GB) - Purple", { model: "iPad 6", storage: "32GB" }));
  assert.ok(!isRelevant("Apple iPhone 14 Pro Max 128GB", { model: "iPhone 14", storage: "128GB" }));
  assert.ok(!isRelevant("Apple iPad Air 2 32GB", { model: "iPad 2", storage: "32GB" }));
});

test("but the qualifier is welcome when the product asked for it", () => {
  assert.ok(isRelevant("Apple iPad Mini 6 64GB", { model: "iPad Mini 6", storage: "64GB" }));
  assert.ok(isRelevant("Apple iPhone 14 Pro Max 256GB", { model: "iPhone 14 Pro Max", storage: "256GB" }));
});

test("the wrong capacity is the wrong price", () => {
  assert.ok(!isRelevant("Apple iPad 6 (2018), Silver, 128GB WiFi", { model: "iPad 6", storage: "32GB" }));
  assert.ok(isRelevant("Apple iPad 6 (6th Gen, 2018) 32GB", { model: "iPad 6", storage: "32GB" }));
});

test("a title that never mentions capacity is left alone", () => {
  assert.ok(isRelevant("Apple iPad 6 - WIFI ONLY - Grey", { model: "iPad 6", storage: "32GB" }));
});

test("a screen size never supplies a generation number", () => {
  // 'iPad 7th Gen 10.5"' contains a 5, and once matched as an iPad 5.
  assert.ok(!isRelevant('Apple iPad 7th Gen 10.5” Cellular + Wifi 32GB', { model: "iPad 5", storage: "32GB" }));
  assert.ok(!isRelevant("Apple iPad (10.2-inch, Wi-Fi, 32GB) Latest Model", { model: "iPad 5", storage: "32GB" }));
});

test("a stated generation has to be the right one", () => {
  assert.ok(!isRelevant("Apple iPad 7th Generation 32GB", { model: "iPad 5", storage: "32GB" }));
  assert.ok(isRelevant("Apple iPad 5 (5th Generation) 32GB", { model: "iPad 5", storage: "32GB" }));
});

test("an iPad named by its year is still that iPad", () => {
  // Amazon has no "iPad 6" — it has an "iPad 2018". Same tablet.
  assert.ok(isRelevant("Apple iPad 2018 32GB - WiFi Only Space Gray", { model: "iPad 6", storage: "32GB" }));
  assert.ok(isRelevant("Apple iPad (9.7-inch, 2017) 32GB Wi-Fi", { model: "iPad 5", storage: "32GB" }));
  assert.ok(!isRelevant("Apple iPad 2018 32GB - WiFi Only", { model: "iPad 5", storage: "32GB" }), "2018 is the 6, not the 5");
});

test("the catch-all classified ad matches nothing", () => {
  const ad = "iPad 2-10 iPad Pro 9,7, 10.5 11, 12.9 iPad Air iPad Mini 1 YR WR";
  assert.ok(!isRelevant(ad, { model: "iPad 5", storage: "32GB" }));
  assert.ok(!isRelevant(ad, { model: "iPad 6", storage: "32GB" }));
});
