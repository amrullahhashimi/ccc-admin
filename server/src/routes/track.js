const express = require("express");

// PUBLIC route (no login) — a customer looks up their repair by its secret token.
// Only customer-safe fields are returned: no internal notes, passcode, or IMEI.
module.exports = (prisma) => {
  const router = express.Router();

  router.get("/:token", async (req, res) => {
    try {
      const t = await prisma.ticket.findUnique({
        where: { trackToken: req.params.token },
        include: {
          customer: { select: { firstName: true } },
          location: { select: { name: true } },
          parts: { select: { productId: true, quantity: true, priceCents: true } },
        },
      });
      if (!t) return res.status(404).json({ error: "We couldn't find that repair." });

      const parts = t.parts ?? [];
      const partsCents = parts.filter((p) => p.productId).reduce((s, p) => s + (p.quantity || 0) * (p.priceCents || 0), 0);
      const labourCents = parts.filter((p) => !p.productId).reduce((s, p) => s + (p.quantity || 0) * (p.priceCents || 0), 0);
      const totalCents = partsCents + labourCents;

      res.json({
        number: t.number,
        status: t.status,
        deviceMake: t.deviceMake,
        deviceModel: t.deviceModel,
        warranty: t.warranty,
        dateIn: t.dateIn,
        promisedAt: t.promisedAt,
        completedAt: t.completedAt,
        location: t.location?.name ?? null,
        customerName: t.customer?.firstName ?? "",
        partsCents,
        labourCents,
        totalCents,
        depositCents: t.depositCents,
        balanceCents: totalCents - t.depositCents,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};