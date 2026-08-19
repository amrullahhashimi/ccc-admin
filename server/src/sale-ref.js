/**
 * How a sale is named wherever one is shown or written into a note.
 *
 * A sale raised in this app gets the shop's own running number. A sale rung up
 * on the Clover register keeps the identity Clover already gave it, so staff
 * looking at a receipt, the register and this app all see the same string
 * instead of having to map between two numbering schemes.
 *
 * Mirrored in src/lib/api.ts for the browser — the two must agree, since a
 * receipt printed here is matched against a sale looked up there.
 */
function saleRef(sale) {
  if (sale?.number != null) return `#${sale.number}`;
  return sale?.cloverOrderId || sale?.id || "";
}

module.exports = { saleRef };
