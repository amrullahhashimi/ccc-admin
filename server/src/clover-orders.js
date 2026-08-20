/**
 * Bringing a sale rung up on the Clover register back into this app.
 *
 * The link is the item id we created when the serial was first pushed
 * (ProductUnit.cloverItemId), so a line item on a Clover order points straight
 * at the handset it sold — no name matching, no guessing. A serial typed into
 * the line item's note still works as a fallback, which is how stock that
 * predates the Clover sync gets matched.
 *
 * A matched serial is marked SOLD, linked to the Sale this creates, and taken
 * off the quantity on hand. Anything unmatched is still recorded on the sale,
 * flagged for review rather than dropped, so the takings always reconcile even
 * when the catalogue and the shelf have drifted apart.
 */

/**
 * Clover's tender labelKey, mapped to how this app names a payment method.
 *
 * Keyed on labelKey rather than the label, because the label is free text a
 * merchant can rename — this account has one simply called "Etransfer", with
 * no key at all, which is why the label is still consulted as a fallback.
 */
const TENDER_METHODS = {
  "com.clover.tender.cash": "CASH",
  "com.clover.tender.credit_card": "CREDIT_CARD",
  "com.clover.tender.debit_card": "DEBIT_CARD",
  "com.clover.tender.external_pin_debit": "DEBIT_CARD",
  "com.clover.tender.check": "CHEQUE",
};

/** Entry types read like shouting; these are how staff describe them. */
const ENTRY_TYPES = {
  EMV_CONTACTLESS: "contactless",
  CONTACTLESS: "contactless",
  EMV_CONTACT: "chip",
  CHIP: "chip",
  SWIPE: "swiped",
  SWIPED: "swiped",
  KEYED: "keyed in",
  MANUAL: "keyed in",
};

/**
 * How one Clover payment was made: a method this app understands, plus the
 * description worth showing beside it.
 *
 * Everything used to be recorded as CARD, which turned a drawer full of cash
 * into card takings on every report that asked.
 */
function methodOf(payment) {
  const tender = payment?.tender ?? {};
  const label = String(tender.label ?? "").trim();
  const card = payment?.cardTransaction;

  let method = TENDER_METHODS[tender.labelKey];
  if (!method) {
    // No key, or one we don't know: fall back to reading the label.
    const lower = label.toLowerCase();
    if (lower.includes("transfer")) method = "ETRANSFER";
    else if (lower.includes("cheque") || lower.includes("check")) method = "CHEQUE";
    else if (lower.includes("debit")) method = "DEBIT_CARD";
    else if (lower.includes("credit")) method = "CREDIT_CARD";
    else if (lower.includes("cash")) method = "CASH";
    // A card transaction settles it even when the tender is something vague
    // like "External Payment".
    else method = card ? "CREDIT_CARD" : "OTHER";
  }

  const parts = [];
  if (card?.cardType) parts.push(String(card.cardType).replace(/_/g, " ").toLowerCase());
  if (card?.last4) parts.push(`····${card.last4}`);
  if (card?.entryType) {
    const entry = ENTRY_TYPES[card.entryType];
    if (entry) parts.push(entry);
  }

  // Card details when there are any. Otherwise the tender's own name, but only
  // where the method didn't already say it — "Cash · Cash" helps nobody. A
  // tender we couldn't place is exactly where the label still earns its keep.
  const details = parts.length
    ? parts.join(" ").replace(/^./, (c) => c.toUpperCase())
    : method === "OTHER"
      ? label || null
      : null;

  return { method, details };
}

/** Clover's unitQty is fixed-point, scaled by 1000 (1000 = qty 1). */
const qtyOf = (li) => {
  const n = Math.round((li.unitQty ?? 1000) / 1000);
  return Number.isFinite(n) && n > 0 ? n : 1;
};

/**
 * Find the serial a line item sold.
 *
 * Only IN_STOCK units are eligible: one already marked SOLD belongs to an
 * earlier sale, and claiming it again would silently move it between sales.
 */
async function matchUnit(prisma, storeId, li) {
  const where = { storeId, status: "IN_STOCK" };

  // The item we created for this serial. Strongest link there is.
  if (li.item?.id) {
    const byItem = await prisma.productUnit.findFirst({
      where: { ...where, cloverItemId: li.item.id },
      include: { product: true },
    });
    if (byItem) return { unit: byItem, how: "item" };
  }

  // Staff typing or scanning the serial into the line item's note — how stock
  // added before the Clover sync existed still gets matched.
  const note = String(li.note ?? "").trim();
  if (note) {
    const byNote = await prisma.productUnit.findFirst({
      where: { ...where, serial: note },
      include: { product: true },
    });
    if (byNote) return { unit: byNote, how: "note" };
  }

  return { unit: null, how: null };
}

/**
 * How much of an order has been handed back.
 *
 * Clover computes `paymentState` from whichever relations the request
 * expanded — the same order reads OPEN, PAID or REFUNDED depending on the
 * query — so it is treated as one signal among several rather than the
 * answer. A refunds collection or a line item flagged refunded is concrete.
 *
 * Partial is called out separately: reversing a whole sale because one line
 * of four came back would put three handsets on the shelf that never left.
 */
function refundState(order) {
  const lines = order.lineItems?.elements ?? [];
  const refundedLines = lines.filter((li) => li.refunded).length;
  const hasRefunds = (order.refunds?.elements ?? []).length > 0;

  const fully =
    order.paymentState === "REFUNDED" ||
    (lines.length > 0 && refundedLines === lines.length) ||
    (hasRefunds && refundedLines === 0 && lines.length === 0);

  return { fully, partly: !fully && (refundedLines > 0 || hasRefunds) };
}

/**
 * Undo a sale the register has since refunded.
 *
 * Every serial the sale consumed goes back on the shelf — IN_STOCK, unlinked
 * from the sale, and one back on the quantity on hand — mirroring exactly what
 * the import took. The sale itself is kept and marked REFUNDED rather than
 * deleted: it happened, and the takings for that day have to still add up.
 *
 * Clover's stock is left alone. The refund was rung up there, so the register
 * has already adjusted its own count; pushing one back would double it.
 */
async function refundSale({ prisma, store, sale }) {
  const units = await prisma.productUnit.findMany({
    where: { saleId: sale.id, storeId: store.id },
    include: { product: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.sale.update({ where: { id: sale.id }, data: { status: "REFUNDED" } });

    for (const unit of units) {
      await tx.productUnit.update({
        where: { id: unit.id },
        data: { status: "IN_STOCK", saleId: null },
      });
      await tx.stockEntry.create({
        data: {
          productId: unit.productId,
          quantity: 1,
          costCents: unit.product.costCents,
          note: `Refunded serial ${unit.serial} on Clover`,
        },
      });
    }
  });

  return {
    imported: false,
    refunded: true,
    reference: sale.cloverOrderId,
    restored: units.length,
  };
}

/**
 * Bring one Clover order into line with what this app holds.
 *
 * Usually that means importing a paid sale, but the same call also catches an
 * order that has since been refunded — the poller keeps seeing orders as they
 * change, and a refund is a change like any other.
 *
 * Returns { imported, reference, matched, reviewed }, { refunded, restored },
 * or { imported: false, reason } saying why it was passed over. Safe to call
 * twice: both paths check what has already been done before doing anything.
 */
async function importOrder({ prisma, store, order }) {
  if (!order?.id) return { imported: false, reason: "no order id" };

  // Looked up before the paid check, not after: a refunded order is no longer
  // PAID, so checking payment state first would hide every refund from us.
  const already = await prisma.sale.findUnique({ where: { cloverOrderId: order.id } });

  if (already) {
    const refund = refundState(order);
    if (refund.fully && already.status !== "REFUNDED") {
      return refundSale({ prisma, store, sale: already });
    }
    if (refund.partly) {
      return {
        imported: false,
        reason: "partly refunded on Clover — needs checking by hand",
        reference: order.id,
      };
    }
    return { imported: false, reason: "already imported", reference: order.id };
  }

  // An order only becomes a sale once it is paid for. An unpaid one is a
  // basket still open on the register, and the poller will see it again.
  if (order.paymentState !== "PAID") {
    return { imported: false, reason: `not paid yet (${order.paymentState || "unknown"})` };
  }

  const lineItems = order.lineItems?.elements ?? [];
  const payments = order.payments?.elements ?? [];

  let needsReview = false;
  const lineData = [];
  const soldUnits = [];

  for (const li of lineItems) {
    const quantity = qtyOf(li);
    const unitPriceCents = Math.round(li.price ?? 0);
    const { unit } = await matchUnit(prisma, store.id, li);

    if (unit) {
      soldUnits.push(unit);
      lineData.push({
        productId: unit.productId,
        name: unit.product.name,
        quantity,
        unitPriceCents,
        costCents: unit.product.costCents,
      });
    } else {
      // Sold on the register but not traceable to a serial here: a plan, an
      // accessory, or stock this app never knew about. Recorded so the totals
      // are right, flagged so somebody can look.
      needsReview = true;
      lineData.push({
        productId: null,
        name: li.name || "Clover item",
        quantity,
        unitPriceCents,
        costCents: 0,
      });
    }
  }

  const totalCents = Math.round(order.total ?? 0);
  const subtotalCents = lineData.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const taxCents = Math.max(0, totalCents - subtotalCents);

  const pays = payments.length
    ? payments.map((p) => ({
        amountCents: Math.round(p.amount ?? 0),
        ...methodOf(p),
        reference: p.id || null,
      }))
    : // No payment rows on a paid order: the money arrived, we just can't say how.
      [{ amountCents: totalCents, method: "OTHER", details: null, reference: null }];

  const sale = await prisma.$transaction(async (tx) => {
    const created = await tx.sale.create({
      data: {
        // No shop sale number: this sale is the Clover order, and
        // cloverOrderId below is its identity. See Sale.number in the schema.
        storeId: store.id,
        source: "CLOVER",
        cloverOrderId: order.id,
        status: "PAID",
        needsReview,
        subtotalCents,
        taxCents,
        totalCents,
        items: { create: lineData },
        payments: { create: pays },
      },
    });

    for (const unit of soldUnits) {
      // SOLD plus the sale it went out on, so the serial row can point at it.
      await tx.productUnit.update({
        where: { id: unit.id },
        data: { status: "SOLD", saleId: created.id },
      });

      // And one off the quantity on hand, the same entry the manual sell
      // button writes — otherwise stock drifts up by one per Clover sale.
      // No storeId here — a stock entry is scoped through its product.
      await tx.stockEntry.create({
        data: {
          productId: unit.productId,
          quantity: -1,
          costCents: unit.product.costCents,
          note: `Sold serial ${unit.serial} on Clover`,
        },
      });
    }

    return created;
  });

  return {
    imported: true,
    reference: sale.cloverOrderId,
    matched: soldUnits.length,
    reviewed: needsReview,
  };
}

module.exports = { importOrder, refundSale, refundState, matchUnit, qtyOf, methodOf };
