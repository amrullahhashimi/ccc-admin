const express = require("express");

function shape(body) {
  const d = {};
  [
    "firstName",
    "lastName",
    "company",
    "phone",
    "mobile",
    "email",
    "address",
    "city",
    "postal",
    "notes",
  ].forEach((k) => {
    if (body[k] !== undefined) d[k] = body[k] === "" ? null : String(body[k]).trim();
  });
  if (d.email) d.email = d.email.toLowerCase();
  if (body.contactConsent !== undefined) d.contactConsent = !!body.contactConsent;
  return d;
}

module.exports = (prisma, requireRole) => {
  const router = express.Router();

  router.get("/", async (req, res) => {
    const { q } = req.query;
    const where = q
      ? {
          OR: [
            { firstName: { contains: q } },
            { lastName: { contains: q } },
            { company: { contains: q } },
            { phone: { contains: q } },
            { mobile: { contains: q } },
            { email: { contains: q } },
          ],
        }
      : {};

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        _count: { select: { sales: true, tickets: true, layaways: true } },
      },
    });
    res.json(customers);
  });

  router.get("/:id", async (req, res) => {
    const c = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: {
        sales: { orderBy: { createdAt: "desc" }, take: 20 },
        tickets: { orderBy: { createdAt: "desc" }, take: 20 },
        layaways: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!c) return res.status(404).json({ error: "Customer not found." });
    res.json(c);
  });

  router.post("/", async (req, res) => {
    try {
      const data = shape(req.body);
      if (!data.firstName) return res.status(400).json({ error: "First name is required." });
      if (!data.phone && !data.email) {
        return res.status(400).json({ error: "Add a phone number or an email so you can reach them." });
      }
      const created = await prisma.customer.create({ data });
      res.status(201).json(created);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch("/:id", async (req, res) => {
    try {
      const updated = await prisma.customer.update({
        where: { id: req.params.id },
        data: shape(req.body),
      });
      res.json(updated);
    } catch (err) {
      if (err.code === "P2025") return res.status(404).json({ error: "Customer not found." });
      res.status(500).json({ error: err.message });
    }
  });

  router.delete("/:id", requireRole("OWNER", "MANAGER"), async (req, res) => {
    try {
      const counts = await prisma.customer.findUnique({
        where: { id: req.params.id },
        include: { _count: { select: { sales: true, tickets: true, layaways: true } } },
      });
      if (!counts) return res.status(404).json({ error: "Customer not found." });
      const { sales, tickets, layaways } = counts._count;
      if (sales || tickets || layaways) {
        return res.status(409).json({
          error: `This customer has ${sales} sales, ${tickets} tickets, and ${layaways} layaways. Deleting them would break that history.`,
        });
      }
      await prisma.customer.delete({ where: { id: req.params.id } });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
