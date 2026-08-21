/**
 * Vendor product & price comparison.
 *
 * The shape of the thing: a vendor sends a message, the parser proposes offers,
 * a person reviews them, and only then does anything reach the database. This
 * file guards that last step — every field is re-validated here, because what
 * comes back from the review screen is user input like any other, and the parse
 * that produced it may have been done by a model (see sourcing/ai.js).
 *
 * Store scoping is absolute: catalogue, offers, messages and history are all
 * stamped with the caller's store and every read is filtered by it, so two
 * shops on one deployment never see each other's buying prices.
 */

const express = require("express");
const { ah } = require("../async-route");
const { scope, stamp, assertStore, storeId } = require("../tenancy");

const { parseMessage, splitBrand } = require("../sourcing/parse");
const { buildMatchKey, displayName, normalizeAttributes, productLabel } = require("../sourcing/normalize");
const { confidenceLabel, rankMatches } = require("../sourcing/match");
const { compareProduct, groupOffersByVendor } = require("../sourcing/compare");
const online = require("../sourcing/online");
const ai = require("../sourcing/ai");

/** Above this the catalogue is paged in the database rather than in memory. */
const MAX_ROWS = 5000;
const CURRENCIES = ["CAD", "USD"];

/* ------------------------------ validation ------------------------------ */

const text = (v, max = 191) => {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === "" ? null : t.slice(0, max);
};

const intIn = (v, { min, max, fallback = null }) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
};

/**
 * The catalogue half of a reviewed row.
 *
 * The review screen edits one "Product" box holding the brand and model, with
 * every other attribute in its own column — so a typed name is split back into
 * the two fields here rather than being stored as one lump.
 */
function attributesFrom(body) {
  const typedName = text(body.productName, 191);
  let brand = text(body.brand);
  let model = text(body.model);

  if (typedName) {
    const [prefix, remainder] = splitBrand(typedName);
    brand = prefix ?? null;
    model = remainder;
  }

  return normalizeAttributes({
    brand,
    model,
    generation: text(body.generation),
    productType: text(body.productType),
    storage: text(body.storage, 40),
    ram: text(body.ram, 40),
    connectivity: text(body.connectivity, 40),
    carrier: text(body.carrier, 60),
    condition: text(body.condition, 40),
    grade: text(body.grade, 20),
    color: text(body.color, 60),
    cpu: text(body.cpu, 60),
    screenSize: text(body.screenSize, 20),
    specifications:
      body.specifications && typeof body.specifications === "object" && !Array.isArray(body.specifications)
        ? body.specifications
        : null,
  });
}

/**
 * The offer half. Returns { error } rather than throwing so one bad row can be
 * reported against its own line instead of failing the whole import.
 */
function offerFrom(body) {
  const priceCents = Number.isInteger(body.priceCents)
    ? body.priceCents
    : Math.round(Number(String(body.price ?? "").replace(/[^0-9.]/g, "")) * 100);

  if (!Number.isInteger(priceCents) || priceCents <= 0 || priceCents > 100000000) {
    return { error: "A price is needed, in dollars and cents." };
  }

  const minQuantity = intIn(body.minQuantity, { min: 1, max: 1000000, fallback: 1 });
  const maxRaw = body.maxQuantity === "" || body.maxQuantity == null ? null : body.maxQuantity;
  const maxQuantity = maxRaw === null ? null : intIn(maxRaw, { min: 1, max: 1000000, fallback: null });

  if (maxQuantity !== null && maxQuantity < minQuantity) {
    return { error: "The maximum quantity is below the minimum." };
  }

  const availableRaw = body.availableQuantity === "" || body.availableQuantity == null ? null : body.availableQuantity;

  return {
    value: {
      priceCents,
      availableQuantity: availableRaw === null ? null : intIn(availableRaw, { min: 0, max: 1000000, fallback: null }),
      currency: CURRENCIES.includes(body.currency) ? body.currency : "CAD",
      minQuantity,
      maxQuantity,
      condition: text(body.condition, 40),
      grade: text(body.grade, 20),
      note: text(body.note, 500),
    },
  };
}

/* -------------------------------- CSV -------------------------------- */

const cell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** UTF-8 BOM first, so Excel opens accented names without mangling them. */
const csv = (columns, rows) =>
  "﻿" +
  [columns.map((c) => cell(c.label)).join(","), ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(","))].join(
    "\r\n"
  );

const dollars = (cents) => (cents == null ? "" : (cents / 100).toFixed(2));

/* ------------------------------- the routes ------------------------------- */

module.exports = (prisma, requireRole) => {
  const router = express.Router();

  /** Products with their offers, already store-scoped, ready to summarise. */
  const loadCatalogue = (req, where = {}) =>
    prisma.catalogProduct.findMany({
      where: { ...scope(req), ...where },
      take: MAX_ROWS,
      include: {
        offers: {
          where: { active: true },
          include: { vendor: { select: { id: true, name: true, active: true } } },
        },
      },
    });

  /**
   * One catalogue row as the tables want it: cheapest applicable price, who is
   * offering it, and how many vendors are in play.
   */
  function summarise(product, quantity = 1, offers = product.offers) {
    const comparison = compareProduct(product, groupOffersByVendor(offers), quantity);
    const best = comparison.vendors[0] ?? null;

    return {
      id: product.id,
      normalizedName: product.normalizedName,
      brand: product.brand,
      model: product.model,
      generation: product.generation,
      productType: product.productType,
      storage: product.storage,
      ram: product.ram,
      connectivity: product.connectivity,
      carrier: product.carrier,
      condition: product.condition,
      grade: product.grade,
      color: product.color,
      cpu: product.cpu,
      screenSize: product.screenSize,
      updatedAt: product.updatedAt,
      offerCount: product.offers.length,
      vendorCount: comparison.vendorCount ?? 0,
      lowestCents: comparison.cheapestCents,
      currency: best?.currency ?? "CAD",
      bestVendor: best ? { id: best.vendorId, name: best.vendorName } : null,
      savingsCents: comparison.savingsCents,
      tied: comparison.tied,
      quantityBreak: best?.quantityBreak ?? false,
    };
  }

  /* ------------------------------ filtering ------------------------------ */

  function filterRows(rows, query) {
    const q = text(query.q)?.toLowerCase();
    const brand = text(query.brand);
    const productType = text(query.productType);
    const storage = text(query.storage);
    const condition = text(query.condition);
    const grade = text(query.grade);
    const vendorId = text(query.vendorId);
    /* The comparison is assembled by picking imports, so this is a list.
       Nothing picked means everything, which is the useful default rather than
       an empty screen. */
    const messageIds = String(query.messageIds ?? query.messageId ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const multiVendor = query.multiVendor === "1" || query.multiVendor === "true";
    const minCents = query.minPrice ? Math.round(Number(query.minPrice) * 100) : null;
    const maxCents = query.maxPrice ? Math.round(Number(query.maxPrice) * 100) : null;
    const withOffersOnly = query.availability === "offered";

    return rows.filter((row) => {
      if (q) {
        const haystack = [row.normalizedName, row.brand, row.model, row.storage, row.cpu]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!q.split(/\s+/).every((word) => haystack.includes(word))) return false;
      }
      if (brand && row.brand !== brand) return false;
      if (productType && row.productType !== productType) return false;
      if (storage && row.storage !== storage) return false;
      if (condition && row.condition !== condition) return false;
      if (grade && row.grade !== grade) return false;
      if (vendorId && !row._vendorIds.includes(vendorId)) return false;
      // Narrow to what the chosen imports brought in, so they can be read
      // against what was already on file.
      if (messageIds.length && !messageIds.some((id) => (row._messageIds ?? []).includes(id))) return false;
      if (multiVendor && (row.vendorCount ?? 0) < 2) return false;
      if (withOffersOnly && row.lowestCents == null) return false;
      if (minCents != null && (row.lowestCents == null || row.lowestCents < minCents)) return false;
      if (maxCents != null && (row.lowestCents == null || row.lowestCents > maxCents)) return false;
      return true;
    });
  }

  const SORTS = {
    lowest: (a, b) => (a.lowestCents ?? Infinity) - (b.lowestCents ?? Infinity),
    highest: (a, b) => (b.lowestCents ?? -Infinity) - (a.lowestCents ?? -Infinity),
    newest: (a, b) => new Date(b.createdAt ?? b.updatedAt) - new Date(a.createdAt ?? a.updatedAt),
    updated: (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt),
    savings: (a, b) => (b.savingsCents ?? -1) - (a.savingsCents ?? -1),
    name: (a, b) => String(a.normalizedName).localeCompare(String(b.normalizedName)),
  };

  /* ------------------------------- options ------------------------------- */

  /** Everything the filter bars need, drawn from the data that actually exists. */
  router.get(
    "/options",
    ah(async (req, res) => {
      const [products, vendors] = await Promise.all([
        prisma.catalogProduct.findMany({
          where: scope(req),
          select: { brand: true, productType: true, storage: true, condition: true, grade: true },
          take: MAX_ROWS,
        }),
        prisma.vendor.findMany({
          where: { ...scope(req), active: true },
          select: { id: true, name: true, currency: true },
          orderBy: { name: "asc" },
        }),
      ]);

      const distinct = (key) =>
        [...new Set(products.map((p) => p[key]).filter(Boolean))].sort((a, b) =>
          String(a).localeCompare(String(b), undefined, { numeric: true })
        );

      res.json({
        vendors,
        brands: distinct("brand"),
        productTypes: distinct("productType"),
        storages: distinct("storage"),
        conditions: distinct("condition"),
        grades: distinct("grade"),
        aiEnabled: ai.isEnabled(),
      });
    })
  );

  /* ------------------------------ dashboard ------------------------------ */

  router.get(
    "/dashboard",
    ah(async (req, res) => {
      const quantity = intIn(req.query.quantity, { min: 1, max: 1000000, fallback: 1 });

      const [products, vendorCount, offerCount, messages, recentChanges] = await Promise.all([
        loadCatalogue(req),
        prisma.vendor.count({ where: { ...scope(req), active: true } }),
        prisma.vendorOffer.count({ where: { ...scope(req), active: true } }),
        prisma.vendorMessage.findMany({
          where: scope(req),
          orderBy: { receivedAt: "desc" },
          take: 5,
          include: { vendor: { select: { id: true, name: true } } },
        }),
        prisma.offerPriceHistory.findMany({
          where: scope(req),
          orderBy: { changedAt: "desc" },
          take: 10,
          include: {
            vendorOffer: {
              include: {
                vendor: { select: { id: true, name: true } },
                catalogProduct: { select: { id: true, normalizedName: true } },
              },
            },
          },
        }),
      ]);

      const rows = products.map((p) => summarise(p, quantity));

      // A "best deal" is only meaningful where there is something to compare
      // against — one vendor's price is not a saving.
      const bestDeals = rows
        .filter((r) => r.vendorCount > 1 && r.savingsCents != null)
        .sort((a, b) => (b.savingsCents ?? 0) - (a.savingsCents ?? 0))
        .slice(0, 8);

      res.json({
        quantity,
        totals: {
          vendors: vendorCount,
          products: products.length,
          offers: offerCount,
          messages: await prisma.vendorMessage.count({ where: scope(req) }),
          multiVendorProducts: rows.filter((r) => r.vendorCount > 1).length,
        },
        bestDeals,
        recentMessages: messages.map((m) => ({
          id: m.id,
          vendor: m.vendor,
          itemCount: m.itemCount,
          status: m.status,
          receivedAt: m.receivedAt,
        })),
        recentChanges: recentChanges.map((h) => ({
          id: h.id,
          changedAt: h.changedAt,
          oldPriceCents: h.oldPriceCents,
          newPriceCents: h.newPriceCents,
          vendor: h.vendorOffer?.vendor ?? null,
          product: h.vendorOffer?.catalogProduct ?? null,
          minQuantity: h.vendorOffer?.minQuantity ?? 1,
        })),
      });
    })
  );

  /* -------------------------------- vendors -------------------------------- */

  /** The vendor list as a buyer wants it: how much they quote, and how recently. */
  router.get(
    "/vendors",
    ah(async (req, res) => {
      const q = text(req.query.q);
      const where = { ...scope(req) };
      if (!req.query.includeInactive) where.active = true;
      if (q) where.OR = [{ name: { contains: q } }, { contactPerson: { contains: q } }, { email1: { contains: q } }];

      const vendors = await prisma.vendor.findMany({
        where,
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          currency: true,
          active: true,
          contactPerson: true,
          phone: true,
          email1: true,
          offers: { where: { active: true }, select: { catalogProductId: true, priceCents: true } },
          messages: { orderBy: { receivedAt: "desc" }, take: 1, select: { id: true, receivedAt: true, itemCount: true } },
          _count: { select: { messages: true } },
        },
      });

      res.json(
        vendors.map((v) => ({
          id: v.id,
          name: v.name,
          currency: v.currency,
          active: v.active,
          contactPerson: v.contactPerson,
          phone: v.phone,
          email1: v.email1,
          offerCount: v.offers.length,
          productCount: new Set(v.offers.map((o) => o.catalogProductId)).size,
          messageCount: v._count.messages,
          lastMessageAt: v.messages[0]?.receivedAt ?? null,
          lastMessageId: v.messages[0]?.id ?? null,
        }))
      );
    })
  );

  /* --------------------------------- parse --------------------------------- */

  /**
   * Read a message and propose offers. Writes nothing.
   *
   * Each proposal carries its match candidates and, when the vendor has quoted
   * this product before, what they said last time — so the review screen can
   * show "was $110, now $105" rather than quietly creating a second offer.
   */
  router.post(
    "/parse",
    ah(async (req, res) => {
      const vendorId = text(req.body.vendorId);
      const message = String(req.body.message ?? "");

      if (!vendorId) return res.status(400).json({ error: "Choose which vendor this came from." });
      if (!message.trim()) return res.status(400).json({ error: "Paste the vendor's message first." });
      if (message.length > 200000) return res.status(413).json({ error: "That message is too long to read." });

      const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, ...scope(req) } });
      if (!vendor) return res.status(404).json({ error: "That vendor was not found." });

      let { items, skipped, lineCount } = parseMessage(message);
      let readBy = "rules";

      // The assistant is only asked when the rules got nowhere, and only ever
      // adds to what a person will review.
      const wanted = req.body.useAi === true;
      if (wanted && ai.isEnabled() && (!items.length || items.every((i) => i.priceCents == null))) {
        const aiItems = await ai.parseWithAi(message);
        if (aiItems && aiItems.length) {
          items = aiItems;
          skipped = [];
          readBy = "ai";
        }
      }

      const catalogue = await prisma.catalogProduct.findMany({ where: scope(req), take: MAX_ROWS });
      const existingOffers = await prisma.vendorOffer.findMany({
        where: { ...scope(req), vendorId, active: true },
        select: { id: true, catalogProductId: true, minQuantity: true, maxQuantity: true, priceCents: true },
      });

      const proposals = items.map((item, index) => {
        const attributes = normalizeAttributes(item);
        const matchKey = buildMatchKey(attributes);
        const { matches, decision, suggested } = rankMatches({ ...attributes, matchKey }, catalogue);

        const best = matches[0] ?? null;
        // An exact signature attaches itself; a strong-but-partial match is
        // filled in for the reviewer to confirm rather than silently ignored.
        const matchedId = decision === "accept" ? best.candidate.id : suggested;

        // Same vendor, same product, same tier — this is an update, not a new offer.
        const duplicate = matchedId
          ? existingOffers.find(
              (o) => o.catalogProductId === matchedId && o.minQuantity === (item.minQuantity ?? 1)
            ) ?? null
          : null;

        return {
          index,
          raw: item.raw,
          lineNumber: item.lineNumber ?? null,
          ...attributes,
          matchKey,
          /** Brand and model only — the specs have columns of their own. */
          productName: productLabel(attributes),
          /** The full descriptor, which is what the catalogue row is called. */
          proposedName: displayName(attributes),
          priceCents: item.priceCents ?? null,
          currency: item.currency ?? vendor.currency ?? "CAD",
          minQuantity: item.minQuantity ?? 1,
          maxQuantity: item.maxQuantity ?? null,
          availableQuantity: item.availableQuantity ?? null,
          parseConfidence: item.confidence ?? null,
          warnings: item.warnings ?? [],
          source: item.source ?? "rules",
          decision,
          /** True when the row is attached to a match a person should tick. */
          needsConfirmation: decision === "review" && !!suggested,
          catalogProductId: matchedId,
          match: best
            ? {
                id: best.candidate.id,
                name: best.candidate.normalizedName,
                score: best.score,
                label: confidenceLabel(best.score),
                conflicts: best.conflicts,
                unknowns: best.unknowns,
              }
            : null,
          alternatives: matches.slice(0, 4).map((m) => ({
            id: m.candidate.id,
            name: m.candidate.normalizedName,
            score: m.score,
            label: confidenceLabel(m.score),
            conflicts: m.conflicts,
          })),
          existingOffer: duplicate
            ? {
                id: duplicate.id,
                priceCents: duplicate.priceCents,
                changed: duplicate.priceCents !== (item.priceCents ?? null),
              }
            : null,
        };
      });

      res.json({
        vendor: { id: vendor.id, name: vendor.name, currency: vendor.currency },
        readBy,
        aiAvailable: ai.isEnabled(),
        lineCount,
        items: proposals,
        skipped,
      });
    })
  );

  /* -------------------------------- import -------------------------------- */

  /**
   * Save the reviewed rows.
   *
   * One transaction: either the message, its products, its offers and their
   * price history all land, or none of it does. A half-imported price list is
   * worse than none, because the missing half looks like a vendor who stopped
   * quoting.
   */
  router.post(
    "/import",
    ah(async (req, res) => {
      const vendorId = text(req.body.vendorId);
      const rawMessage = String(req.body.rawMessage ?? "");
      const name = text(req.body.name, 120);
      const rows = Array.isArray(req.body.items) ? req.body.items : [];

      if (!vendorId) return res.status(400).json({ error: "Choose which vendor this came from." });
      if (!rows.length) return res.status(400).json({ error: "There is nothing to save." });
      if (rows.length > 1000) return res.status(413).json({ error: "That is too many rows for one import." });

      const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, ...scope(req) } });
      if (!vendor) return res.status(404).json({ error: "That vendor was not found." });

      /* Validate everything before opening the transaction, so a typo on row 40
         doesn't roll back rows 1-39 after the work has been done. */
      const prepared = [];
      for (const [index, row] of rows.entries()) {
        const attributes = attributesFrom(row);
        if (!attributes.model && !attributes.brand) {
          return res.status(400).json({ error: `Row ${index + 1} has no product name.` });
        }

        const offer = offerFrom(row);
        if (offer.error) return res.status(400).json({ error: `Row ${index + 1}: ${offer.error}` });

        prepared.push({
          attributes,
          matchKey: buildMatchKey(attributes),
          // Always derived, so two vendors' wording can't produce two names for
          // the same signature.
          name: displayName(attributes),
          catalogProductId: text(row.catalogProductId),
          offer: offer.value,
        });
      }

      const store = storeId(req);
      const userId = req.session?.user?.id ?? null;

      const result = await prisma.$transaction(
        async (tx) => {
          const message = await tx.vendorMessage.create({
            data: {
              vendorId,
              name,
              rawMessage: rawMessage.slice(0, 200000),
              status: "IMPORTED",
              itemCount: prepared.length,
              importedById: userId,
              storeId: store,
            },
          });

          let created = 0;
          let updated = 0;
          let newProducts = 0;
          const priceChanges = [];

          for (const row of prepared) {
            /* The product. An id from the review screen is honoured (that is the
               user confirming a match), but it is still checked against this
               store before anything hangs off it. */
            let product = null;

            if (row.catalogProductId) {
              product = await tx.catalogProduct.findFirst({
                where: { id: row.catalogProductId, storeId: store },
              });
              if (!product) throw Object.assign(new Error("That product was not found."), { status: 404 });
            }

            if (!product) {
              product = await tx.catalogProduct.findFirst({ where: { storeId: store, matchKey: row.matchKey } });
            }

            if (!product) {
              product = await tx.catalogProduct.create({
                data: {
                  ...row.attributes,
                  specifications: row.attributes.specifications ?? undefined,
                  normalizedName: row.name,
                  matchKey: row.matchKey,
                  storeId: store,
                },
              });
              newProducts++;
            }

            /* The offer. A tier is identified by where it starts, so re-sending
               "10 or more" updates that tier and records the movement. */
            const existing = await tx.vendorOffer.findFirst({
              where: { vendorId, catalogProductId: product.id, minQuantity: row.offer.minQuantity },
            });

            if (existing) {
              if (existing.priceCents !== row.offer.priceCents) {
                await tx.offerPriceHistory.create({
                  data: {
                    vendorOfferId: existing.id,
                    oldPriceCents: existing.priceCents,
                    newPriceCents: row.offer.priceCents,
                    changedById: userId,
                    storeId: store,
                  },
                });
                priceChanges.push({
                  product: product.normalizedName,
                  oldPriceCents: existing.priceCents,
                  newPriceCents: row.offer.priceCents,
                });
              }

              await tx.vendorOffer.update({
                where: { id: existing.id },
                data: {
                  ...row.offer,
                  active: true,
                  lastSeenAt: new Date(),
                  sourceMessageId: message.id,
                },
              });
              updated++;
            } else {
              await tx.vendorOffer.create({
                data: {
                  ...row.offer,
                  vendorId,
                  catalogProductId: product.id,
                  sourceMessageId: message.id,
                  lastSeenAt: new Date(),
                  storeId: store,
                },
              });
              created++;
            }
          }

          return { messageId: message.id, name: message.name, created, updated, newProducts, priceChanges };
        },
        { timeout: 60000, maxWait: 15000 }
      );

      res.status(201).json(result);
    })
  );

  /* ------------------------------- catalogue ------------------------------- */

  router.get(
    "/products",
    ah(async (req, res) => {
      const quantity = intIn(req.query.quantity, { min: 1, max: 1000000, fallback: 1 });
      const page = intIn(req.query.page, { min: 1, max: 10000, fallback: 1 });
      const pageSize = intIn(req.query.pageSize, { min: 5, max: 200, fallback: 25 });
      const sort = SORTS[req.query.sort] ? req.query.sort : "name";

      const products = await loadCatalogue(req);
      const rows = products.map((p) => ({
        ...summarise(p, quantity),
        createdAt: p.createdAt,
        _vendorIds: [...new Set(p.offers.map((o) => o.vendorId))],
        _messageIds: [...new Set(p.offers.map((o) => o.sourceMessageId).filter(Boolean))],
      }));

      const filtered = filterRows(rows, req.query).sort(SORTS[sort]);
      const start = (page - 1) * pageSize;

      res.json({
        quantity,
        page,
        pageSize,
        total: filtered.length,
        rows: filtered.slice(start, start + pageSize).map(({ _vendorIds, _messageIds, ...row }) => row),
      });
    })
  );

  router.get(
    "/products/:id",
    ah(async (req, res) => {
      const quantity = intIn(req.query.quantity, { min: 1, max: 1000000, fallback: 1 });

      const product = await prisma.catalogProduct.findFirst({
        where: { id: req.params.id, ...scope(req) },
        include: {
          offers: {
            include: {
              vendor: { select: { id: true, name: true, active: true } },
              sourceMessage: { select: { id: true, receivedAt: true } },
            },
            orderBy: [{ vendorId: "asc" }, { minQuantity: "asc" }],
          },
        },
      });
      if (!product) return res.status(404).json({ error: "That product was not found." });

      const history = await prisma.offerPriceHistory.findMany({
        where: { ...scope(req), vendorOffer: { catalogProductId: product.id } },
        orderBy: { changedAt: "desc" },
        take: 100,
        include: {
          vendorOffer: { select: { id: true, minQuantity: true, vendor: { select: { id: true, name: true } } } },
          changedBy: { select: { id: true, name: true } },
        },
      });

      const comparison = compareProduct(
        product,
        groupOffersByVendor(product.offers.filter((o) => o.active)),
        quantity
      );

      res.json({
        product: {
          id: product.id,
          normalizedName: product.normalizedName,
          brand: product.brand,
          model: product.model,
          generation: product.generation,
          productType: product.productType,
          storage: product.storage,
          ram: product.ram,
          connectivity: product.connectivity,
          carrier: product.carrier,
          condition: product.condition,
          grade: product.grade,
          color: product.color,
          cpu: product.cpu,
          screenSize: product.screenSize,
          specifications: product.specifications,
          matchKey: product.matchKey,
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
        },
        offers: product.offers.map((o) => ({
          id: o.id,
          vendor: o.vendor,
          priceCents: o.priceCents,
          currency: o.currency,
          minQuantity: o.minQuantity,
          maxQuantity: o.maxQuantity,
          availableQuantity: o.availableQuantity,
          condition: o.condition,
          grade: o.grade,
          note: o.note,
          active: o.active,
          lastSeenAt: o.lastSeenAt,
          sourceMessageId: o.sourceMessageId,
          sourceReceivedAt: o.sourceMessage?.receivedAt ?? null,
        })),
        comparison,
        history: history.map((h) => ({
          id: h.id,
          changedAt: h.changedAt,
          oldPriceCents: h.oldPriceCents,
          newPriceCents: h.newPriceCents,
          vendor: h.vendorOffer?.vendor ?? null,
          minQuantity: h.vendorOffer?.minQuantity ?? 1,
          changedBy: h.changedBy?.name ?? null,
        })),
      });
    })
  );

  /** Correcting a product's attributes re-derives its signature and its name. */
  router.patch(
    "/products/:id",
    ah(async (req, res) => {
      const existing = await prisma.catalogProduct.findFirst({
        where: { id: req.params.id, ...scope(req) },
      });
      if (!assertStore(req, res, existing, "product")) return;

      const attributes = attributesFrom({ ...existing, ...req.body });
      if (!attributes.model && !attributes.brand) {
        return res.status(400).json({ error: "A product needs at least a brand or a model." });
      }

      const matchKey = buildMatchKey(attributes);
      const clash = await prisma.catalogProduct.findFirst({
        where: { ...scope(req), matchKey, NOT: { id: existing.id } },
      });
      if (clash) {
        return res.status(409).json({
          error: `Those details already belong to "${clash.normalizedName}". Move the offers there instead of creating a second copy.`,
          conflictId: clash.id,
        });
      }

      const updated = await prisma.catalogProduct.update({
        where: { id: existing.id },
        data: {
          ...attributes,
          specifications: attributes.specifications ?? undefined,
          matchKey,
          normalizedName: text(req.body.normalizedName, 191) || displayName(attributes),
        },
      });
      res.json(updated);
    })
  );

  router.delete(
    "/products/:id",
    requireRole("OWNER", "MANAGER"),
    ah(async (req, res) => {
      const existing = await prisma.catalogProduct.findFirst({
        where: { id: req.params.id, ...scope(req) },
        select: { id: true, storeId: true },
      });
      if (!assertStore(req, res, existing, "product")) return;

      await prisma.catalogProduct.delete({ where: { id: existing.id } });
      res.json({ ok: true });
    })
  );

  /* ------------------------------ online prices ------------------------------ */

  /**
   * What the thing sells for on the open market.
   *
   * Canadian national retail first, the local classified market second — the
   * order matters, because a Best Buy listing is a price anyone can walk in and
   * pay, while an ad is one person's asking price.
   *
   * Cached: a lookup runs when nothing is stored, when the stored answer has
   * gone stale, or when somebody asks for a refresh. Every other view reads what
   * is already here, which keeps the page quick and keeps us from hammering
   * somebody else's website all day.
   */
  router.get(
    "/products/:id/online",
    ah(async (req, res) => {
      const product = await prisma.catalogProduct.findFirst({
        where: { id: req.params.id, ...scope(req) },
      });
      if (!product) return res.status(404).json({ error: "That product was not found." });

      const refresh = req.query.refresh === "1" || req.query.refresh === "true";
      const stale =
        !product.onlineCheckedAt ||
        Date.now() - new Date(product.onlineCheckedAt).getTime() > online.TTL_MINUTES * 60000;

      let failures = [];

      if (refresh || stale) {
        const found = await online.searchOnline(product);
        failures = found.failures;

        // Replaced wholesale rather than merged: a listing that has gone from a
        // search has usually sold, and keeping it would quote a price that no
        // longer exists.
        await prisma.$transaction([
          prisma.onlinePrice.deleteMany({ where: { catalogProductId: product.id, storeId: storeId(req) } }),
          ...(found.results.length
            ? [
                prisma.onlinePrice.createMany({
                  data: found.results.map((r) => ({
                    source: r.source,
                    sourceLabel: r.sourceLabel,
                    tier: r.tier,
                    title: r.title,
                    url: r.url,
                    priceCents: r.priceCents,
                    currency: r.currency,
                    location: r.location,
                    inStock: r.inStock,
                    catalogProductId: product.id,
                    storeId: storeId(req),
                  })),
                }),
              ]
            : []),
          prisma.catalogProduct.update({
            where: { id: product.id },
            data: { onlineCheckedAt: new Date() },
          }),
        ]);
      }

      const [rows, refreshed] = await Promise.all([
        prisma.onlinePrice.findMany({
          where: { catalogProductId: product.id, ...scope(req) },
          orderBy: { priceCents: "asc" },
        }),
        prisma.catalogProduct.findFirst({
          where: { id: product.id, ...scope(req) },
          select: { onlineCheckedAt: true },
        }),
      ]);

      /* The number a buyer is actually after: the gap between the best price a
         vendor quotes and the cheapest anyone is selling it for. */
      /* National retail first, then the local market — the order of how much a
         price can be relied on. Sorted here rather than in the query, where
         "local" would simply sort before "retail" alphabetically. */
      const tierRank = { retail: 0, local: 1 };
      rows.sort((a, b) => (tierRank[a.tier] ?? 9) - (tierRank[b.tier] ?? 9) || a.priceCents - b.priceCents);

      const cheapestRetail = rows.filter((r) => r.tier === "retail")[0] ?? null;
      const cheapestLocal = rows.filter((r) => r.tier === "local")[0] ?? null;

      const bestOffer = await prisma.vendorOffer.findFirst({
        where: { catalogProductId: product.id, active: true, minQuantity: 1, ...scope(req) },
        orderBy: { priceCents: "asc" },
        select: { priceCents: true, vendor: { select: { id: true, name: true } } },
      });

      res.json({
        query: online.queryFor(product),
        checkedAt: refreshed?.onlineCheckedAt ?? null,
        results: rows.map((r) => ({
          id: r.id,
          source: r.source,
          sourceLabel: r.sourceLabel,
          tier: r.tier,
          title: r.title,
          url: r.url,
          priceCents: r.priceCents,
          currency: r.currency,
          location: r.location,
          inStock: r.inStock,
        })),
        links: online.searchLinks(product),
        failures,
        /** Cheapest online against the best single-unit wholesale price. */
        margin:
          bestOffer && cheapestRetail
            ? {
                vendor: bestOffer.vendor,
                vendorPriceCents: bestOffer.priceCents,
                retailPriceCents: cheapestRetail.priceCents,
                marginCents: cheapestRetail.priceCents - bestOffer.priceCents,
                localPriceCents: cheapestLocal?.priceCents ?? null,
              }
            : null,
      });
    })
  );

  /* --------------------------------- offers --------------------------------- */

  router.patch(
    "/offers/:id",
    ah(async (req, res) => {
      const existing = await prisma.vendorOffer.findFirst({
        where: { id: req.params.id, ...scope(req) },
      });
      if (!assertStore(req, res, existing, "offer")) return;

      const offer = offerFrom({ ...existing, ...req.body });
      if (offer.error) return res.status(400).json({ error: offer.error });

      const active = req.body.active === undefined ? existing.active : !!req.body.active;

      const updated = await prisma.$transaction(async (tx) => {
        if (offer.value.priceCents !== existing.priceCents) {
          await tx.offerPriceHistory.create({
            data: {
              vendorOfferId: existing.id,
              oldPriceCents: existing.priceCents,
              newPriceCents: offer.value.priceCents,
              changedById: req.session?.user?.id ?? null,
              storeId: storeId(req),
            },
          });
        }
        return tx.vendorOffer.update({ where: { id: existing.id }, data: { ...offer.value, active } });
      });

      res.json(updated);
    })
  );

  router.delete(
    "/offers/:id",
    requireRole("OWNER", "MANAGER"),
    ah(async (req, res) => {
      const existing = await prisma.vendorOffer.findFirst({
        where: { id: req.params.id, ...scope(req) },
        select: { id: true, storeId: true },
      });
      if (!assertStore(req, res, existing, "offer")) return;

      await prisma.vendorOffer.delete({ where: { id: existing.id } });
      res.json({ ok: true });
    })
  );

  /* ------------------------------- comparison ------------------------------- */

  /**
   * The grid: products down the side, vendors across the top, one price per
   * cell at the chosen quantity.
   */
  router.get(
    "/comparison",
    ah(async (req, res) => {
      const quantity = intIn(req.query.quantity, { min: 1, max: 1000000, fallback: 1 });
      const page = intIn(req.query.page, { min: 1, max: 10000, fallback: 1 });
      const pageSize = intIn(req.query.pageSize, { min: 5, max: 100, fallback: 25 });

      const products = await loadCatalogue(req);

      /* Only the chosen imports appear. Adding one list puts that list on the
         screen — not every vendor who happens to sell the same thing — so the
         table is built up deliberately, one import at a time. */
      const chosen = String(req.query.messageIds ?? req.query.messageId ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      const offersOf = (product) =>
        chosen.length ? product.offers.filter((o) => chosen.includes(o.sourceMessageId)) : product.offers;

      const rows = products
        .map((product) => {
          const offers = offersOf(product);
          const summary = summarise(product, quantity, offers);
          const comparison = compareProduct(product, groupOffersByVendor(offers), quantity);
          return {
            ...summary,
            _vendorIds: [...new Set(offers.map((o) => o.vendorId))],
            _messageIds: [...new Set(product.offers.map((o) => o.sourceMessageId).filter(Boolean))],
            cells: comparison.vendors,
            savingsCents: comparison.savingsCents,
          };
        })
        .filter((row) => row.cells.length > 0);

      const filtered = filterRows(rows, req.query);

      // Only show columns for vendors that actually quote something on this page.
      const onPage = filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
      const vendorMap = new Map();
      for (const row of onPage) {
        for (const cell of row.cells) {
          if (!vendorMap.has(cell.vendorId)) vendorMap.set(cell.vendorId, cell.vendorName ?? "Vendor");
        }
      }

      res.json({
        quantity,
        page,
        pageSize,
        total: filtered.length,
        vendors: [...vendorMap.entries()]
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        rows: onPage.map(({ _vendorIds, _messageIds, ...row }) => row),
      });
    })
  );

  /* -------------------------------- messages -------------------------------- */

  router.get(
    "/messages",
    ah(async (req, res) => {
      const page = intIn(req.query.page, { min: 1, max: 10000, fallback: 1 });
      const pageSize = intIn(req.query.pageSize, { min: 5, max: 100, fallback: 25 });
      const vendorId = text(req.query.vendorId);
      const q = text(req.query.q);

      const where = { ...scope(req) };
      if (vendorId) where.vendorId = vendorId;
      // Searched by what it was called, or by who sent it — both are how people
      // remember an import.
      if (q) where.OR = [{ name: { contains: q } }, { vendor: { name: { contains: q } } }];

      const [total, messages] = await Promise.all([
        prisma.vendorMessage.count({ where }),
        prisma.vendorMessage.findMany({
          where,
          orderBy: { receivedAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            vendor: { select: { id: true, name: true } },
            importedBy: { select: { id: true, name: true } },
            _count: { select: { offers: true } },
          },
        }),
      ]);

      res.json({
        page,
        pageSize,
        total,
        rows: messages.map((m) => ({
          id: m.id,
          name: m.name,
          vendor: m.vendor,
          status: m.status,
          itemCount: m.itemCount,
          /** Offers still pointing at this message — what a delete would remove. */
          offerCount: m._count.offers,
          importedBy: m.importedBy?.name ?? null,
          receivedAt: m.receivedAt,
        })),
      });
    })
  );

  /** The original words, for auditing an offer back to its source. */
  router.get(
    "/messages/:id",
    ah(async (req, res) => {
      const message = await prisma.vendorMessage.findFirst({
        where: { id: req.params.id, ...scope(req) },
        include: {
          vendor: { select: { id: true, name: true } },
          importedBy: { select: { id: true, name: true } },
          offers: {
            include: { catalogProduct: { select: { id: true, normalizedName: true } } },
            orderBy: { priceCents: "asc" },
          },
        },
      });
      if (!message) return res.status(404).json({ error: "That message was not found." });

      res.json({
        id: message.id,
        name: message.name,
        vendor: message.vendor,
        rawMessage: message.rawMessage,
        status: message.status,
        itemCount: message.itemCount,
        receivedAt: message.receivedAt,
        importedBy: message.importedBy?.name ?? null,
        offers: message.offers.map((o) => ({
          id: o.id,
          product: o.catalogProduct,
          priceCents: o.priceCents,
          currency: o.currency,
          minQuantity: o.minQuantity,
          maxQuantity: o.maxQuantity,
          availableQuantity: o.availableQuantity,
        })),
      });
    })
  );

  /**
   * Undo an import.
   *
   * The offers that came from this message go with it — that is what makes it
   * an undo rather than a tidy-up — and any catalogue product left with no
   * offers at all is cleared away too, so deleting a mistaken paste doesn't
   * leave a drift of empty products behind.
   *
   * An offer that predates this message but was last *updated* by it is a
   * genuine casualty: its earlier price is in the history, but the offer row
   * goes. The confirm dialog says how many offers are involved before anyone
   * commits to it.
   */
  router.delete(
    "/messages/:id",
    requireRole("OWNER", "MANAGER"),
    ah(async (req, res) => {
      const message = await prisma.vendorMessage.findFirst({
        where: { id: req.params.id, ...scope(req) },
        select: { id: true, storeId: true },
      });
      if (!assertStore(req, res, message, "message")) return;

      const store = storeId(req);

      const result = await prisma.$transaction(async (tx) => {
        const offers = await tx.vendorOffer.findMany({
          where: { sourceMessageId: message.id, storeId: store },
          select: { id: true, catalogProductId: true },
        });

        const touchedProducts = [...new Set(offers.map((o) => o.catalogProductId))];

        await tx.vendorOffer.deleteMany({ where: { id: { in: offers.map((o) => o.id) } } });
        await tx.vendorMessage.delete({ where: { id: message.id } });

        // Products nobody quotes any more have nothing left to say.
        const emptied = await tx.catalogProduct.findMany({
          where: { id: { in: touchedProducts }, storeId: store, offers: { none: {} } },
          select: { id: true },
        });
        await tx.catalogProduct.deleteMany({ where: { id: { in: emptied.map((p) => p.id) } } });

        return { offersRemoved: offers.length, productsRemoved: emptied.length };
      });

      res.json({ ok: true, ...result });
    })
  );

  /* ------------------------------ price history ------------------------------ */

  router.get(
    "/price-history",
    ah(async (req, res) => {
      const limit = intIn(req.query.limit, { min: 1, max: 500, fallback: 100 });
      const where = { ...scope(req) };

      const productId = text(req.query.productId);
      const vendorId = text(req.query.vendorId);
      if (productId) where.vendorOffer = { catalogProductId: productId };
      if (vendorId) where.vendorOffer = { ...(where.vendorOffer ?? {}), vendorId };

      const history = await prisma.offerPriceHistory.findMany({
        where,
        orderBy: { changedAt: "desc" },
        take: limit,
        include: {
          vendorOffer: {
            select: {
              id: true,
              minQuantity: true,
              vendor: { select: { id: true, name: true } },
              catalogProduct: { select: { id: true, normalizedName: true } },
            },
          },
          changedBy: { select: { id: true, name: true } },
        },
      });

      res.json(
        history.map((h) => ({
          id: h.id,
          changedAt: h.changedAt,
          oldPriceCents: h.oldPriceCents,
          newPriceCents: h.newPriceCents,
          minQuantity: h.vendorOffer?.minQuantity ?? 1,
          vendor: h.vendorOffer?.vendor ?? null,
          product: h.vendorOffer?.catalogProduct ?? null,
          changedBy: h.changedBy?.name ?? null,
        }))
      );
    })
  );

  /* -------------------------------- exports -------------------------------- */

  const send = (res, filename, body) => {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(body);
  };

  /** Every offer, one row each — the flat view for a spreadsheet. */
  router.get(
    "/export/offers",
    ah(async (req, res) => {
      const offers = await prisma.vendorOffer.findMany({
        where: { ...scope(req), active: true },
        include: { vendor: { select: { name: true } }, catalogProduct: true },
        orderBy: [{ catalogProductId: "asc" }, { priceCents: "asc" }],
        take: MAX_ROWS,
      });

      const columns = [
        { label: "Product", value: (o) => o.catalogProduct.normalizedName },
        { label: "Brand", value: (o) => o.catalogProduct.brand },
        { label: "Model", value: (o) => o.catalogProduct.model },
        { label: "Vendor", value: (o) => o.vendor.name },
        { label: "Price", value: (o) => dollars(o.priceCents) },
        { label: "Currency", value: (o) => o.currency },
        { label: "Minimum quantity", value: (o) => o.minQuantity },
        { label: "Maximum quantity", value: (o) => o.maxQuantity ?? "" },
        { label: "In stock", value: (o) => o.availableQuantity ?? "" },
        { label: "Condition", value: (o) => o.condition ?? o.catalogProduct.condition ?? "" },
        { label: "Grade", value: (o) => o.grade ?? o.catalogProduct.grade ?? "" },
        { label: "Storage", value: (o) => o.catalogProduct.storage ?? "" },
        { label: "RAM", value: (o) => o.catalogProduct.ram ?? "" },
        { label: "Connectivity", value: (o) => o.catalogProduct.connectivity ?? "" },
        { label: "Last updated", value: (o) => new Date(o.updatedAt).toISOString().slice(0, 10) },
      ];

      send(res, "vendor-offers.csv", csv(columns, offers));
    })
  );

  /** The comparison grid as it appears on screen, at the same quantity. */
  router.get(
    "/export/comparison",
    ah(async (req, res) => {
      const quantity = intIn(req.query.quantity, { min: 1, max: 1000000, fallback: 1 });
      const products = await loadCatalogue(req);

      const chosen = String(req.query.messageIds ?? req.query.messageId ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      const offersOf = (product) =>
        chosen.length ? product.offers.filter((o) => chosen.includes(o.sourceMessageId)) : product.offers;

      const rows = products
        .map((product) => {
          const offers = offersOf(product);
          return {
            ...summarise(product, quantity, offers),
            _vendorIds: [...new Set(offers.map((o) => o.vendorId))],
            _messageIds: [...new Set(product.offers.map((o) => o.sourceMessageId).filter(Boolean))],
            cells: compareProduct(product, groupOffersByVendor(offers), quantity).vendors,
          };
        })
        .filter((r) => r.cells.length);

      const filtered = filterRows(rows, req.query);

      const vendorMap = new Map();
      for (const row of filtered) for (const c of row.cells) vendorMap.set(c.vendorId, c.vendorName ?? "Vendor");
      const vendors = [...vendorMap.entries()].sort((a, b) => a[1].localeCompare(b[1]));

      const columns = [
        { label: "Product", value: (r) => r.normalizedName },
        { label: "Storage", value: (r) => r.storage ?? "" },
        { label: "Condition", value: (r) => r.condition ?? "" },
        { label: "Grade", value: (r) => r.grade ?? "" },
        ...vendors.map(([id, name]) => ({
          label: name,
          value: (r) => dollars(r.cells.find((c) => c.vendorId === id)?.priceCents ?? null),
        })),
        { label: "Cheapest", value: (r) => dollars(r.lowestCents) },
        { label: "Best vendor", value: (r) => (r.tied ? "Tied" : r.bestVendor?.name ?? "") },
        { label: "Saving vs next", value: (r) => dollars(r.savingsCents) },
        { label: `At quantity`, value: () => quantity },
      ];

      send(res, `price-comparison-qty-${quantity}.csv`, csv(columns, filtered));
    })
  );

  return router;
};
