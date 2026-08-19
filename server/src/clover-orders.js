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
 * Import one paid Clover order, or do nothing if it is already in.
 *
 * Returns { imported, reference, matched, reviewed } so the caller can log
 * something useful. Safe to call twice with the same order — the unique
 * cloverOrderId makes a repeat a no-op rather than a duplicate sale.
 */
async function importOrder({ prisma, store, order }) {
  if (!order?.id) return { imported: false };
  if (order.paymentState !== "PAID") return { imported: false }; // not money yet

  const already = await prisma.sale.findUnique({ where: { cloverOrderId: order.id } });
  if (already) return { imported: false };

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
    ? payments.map((p) => ({ amountCents: Math.round(p.amount ?? 0), method: "CARD", reference: p.id || null }))
    : [{ amountCents: totalCents, method: "CARD", reference: null }];

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

module.exports = { importOrder, matchUnit, qtyOf };
