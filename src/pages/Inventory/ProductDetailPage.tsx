import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  CONDITIONS,
  STORAGE_SIZES,
  WARRANTY_MONTHS,
  conditionLabel,
  meta as metaApi,
  money,
  products as productsApi,
  vendors as vendorsApi,
  type Meta,
  type Product,
  type ProductUnit,
} from "../../lib/api";
import { reportCloverSync } from "../../lib/cloverSync";
import { useAuth } from "../../context/AuthContext";
import { useStore } from "../../context/StoreContext";
import { printUnitLabel } from "./printLabel";
import { useNotify } from "../../components/ui/notify";

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800";

const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

const panelClass =
  "rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]";

/* ------------------------------- maths bits ------------------------------- */

const markup = (cost: number, price: number) => (cost > 0 ? ((price - cost) / cost) * 100 : null);
const margin = (cost: number, price: number) => (price > 0 ? ((price - cost) / price) * 100 : null);
const pct = (v: number | null) => (v == null ? "—" : v.toFixed(1) + "%");

type VendorOption = { id: string; name: string };

/* ----------------------------- inventory tab ----------------------------- */

function InventoryTab({
  product,
  meta,
  onChanged,
}: {
  product: Product;
  meta: Meta | null;
  onChanged: () => void;
}) {
  const { can } = useAuth();
  const notify = useNotify();
  const [form, setForm] = useState({
    quantity: "",
    cost: (product.costCents / 100).toFixed(2),
    vendorId: product.vendorId ?? "",
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const qty = parseInt(form.quantity, 10);
    if (!Number.isFinite(qty) || qty === 0) {
      return setError("Enter a quantity. Use a negative number to correct a mistake.");
    }

    setSaving(true);
    try {
      await productsApi.addStock(product.id, {
        quantity: qty,
        cost: form.cost,
        vendorId: form.vendorId || null,
        note: form.note,
      });
      setForm((f) => ({ ...f, quantity: "", note: "" }));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add stock.");
    }
    setSaving(false);
  };

  const remove = async (entryId: string) => {
    const ok = await notify.confirm({
      title: "Remove this stock entry?",
      message: "The quantity on hand will change.",
      confirmText: "Remove",
      variant: "error",
    });
    if (!ok) return;
    try {
      await productsApi.removeStockEntry(entryId);
      notify.success("Stock entry removed.");
      onChanged();
    } catch (err) {
      notify.error("Could not remove.", {
        message: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const entries = product.stockEntries ?? [];

  return (
    <div className="space-y-5">
      <div className={panelClass}>
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="font-semibold text-gray-800 dark:text-white/90">Add inventory</h2>
        </div>
        <form onSubmit={add} className="space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelClass}>
                Quantity <span className="text-error-500">*</span>
              </label>
              <input type="number" className={inputClass} value={form.quantity} onChange={(e) => set("quantity", e.target.value)} autoFocus />
            </div>
            <div>
              <label className={labelClass}>Cost price</label>
              <input type="number" step="0.01" className={inputClass} value={form.cost} onChange={(e) => set("cost", e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Vendor</label>
              <select className={inputClass} value={form.vendorId} onChange={(e) => set("vendorId", e.target.value)}>
                <option value="">—</option>
                {meta?.vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Note</label>
              <input className={inputClass} value={form.note} onChange={(e) => set("note", e.target.value)} />
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/15">{error}</p>
          )}

          <button type="submit" disabled={saving} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
            {saving ? "Adding…" : "Add inventory"}
          </button>
          <p className="text-xs text-gray-500">
            A negative quantity corrects a mistake — nothing is overwritten, so the history stays honest.
          </p>
        </form>
      </div>

      <div className={panelClass}>
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="font-semibold text-gray-800 dark:text-white/90">Stock history</h2>
          <span className="text-sm text-gray-500">
            On hand: <span className="font-semibold text-gray-800 dark:text-white/90">{product.quantity}</span>
          </span>
        </div>

        {entries.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">No stock received yet. Add a quantity above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 dark:border-gray-800">
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3 text-right">Qty</th>
                  <th className="px-5 py-3 text-right">Unit cost</th>
                  <th className="px-5 py-3">Vendor</th>
                  <th className="px-5 py-3">Note</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-5 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {new Date(e.createdAt).toLocaleDateString()}
                    </td>
                    <td className={`px-5 py-3 text-right text-sm font-semibold tabular-nums ${e.quantity < 0 ? "text-error-500" : "text-success-600"}`}>
                      {e.quantity > 0 ? "+" : ""}{e.quantity}
                    </td>
                    <td className="px-5 py-3 text-right text-sm tabular-nums text-gray-600 dark:text-gray-400">{money(e.costCents)}</td>
                    <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400">{e.vendor?.name ?? "—"}</td>
                    <td className="max-w-xs truncate px-5 py-3 text-sm text-gray-500">{e.note || "—"}</td>
                    <td className="px-5 py-3 text-right">
                      {can("OWNER", "MANAGER") && (
                        <button onClick={() => remove(e.id)} className="text-xs font-medium text-error-500 hover:text-error-600">Remove</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ serials tab ------------------------------ */

const blankSerial = {
  serial: "",
  condition: "USED_GOOD",
  locationId: "",
  storage: "",
  color: "",
  warrantyMonths: "3",
  salePrice: "",
  labelCost: "",
  note: "",
  vendorId: "",
};

/** Dollars for an input box, or "" when there's nothing to show. */
const dollars = (cents?: number | null) =>
  cents != null ? (cents / 100).toFixed(2) : "";

function SerialsTab({
  product,
  meta,
  onChanged,
}: {
  product: Product;
  meta: Meta | null;
  onChanged: () => void;
}) {
  const { can } = useAuth();
  const notify = useNotify();
  const { store } = useStore(); // label size comes from Store settings
  const [units, setUnits] = useState<ProductUnit[]>(product.units ?? []);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Vendors created inline get added here so they show without a page reload.
  const [extraVendors, setExtraVendors] = useState<VendorOption[]>([]);
  const vendorOptions: VendorOption[] = [...(meta?.vendors ?? []), ...extraVendors];

  const [editingId, setEditingId] = useState<string | null>(null);
  const [sellingId, setSellingId] = useState<string | null>(null);
  const [returningId, setReturningId] = useState<string | null>(null);

  // New serials start at the product's sale price from the Details tab; change
  // it per unit when condition or what was paid makes this one worth more or less.
  const productSalePrice = dollars(product.salePriceCents);

  // The serial being added almost always came from the last batch of stock, so
  // its cost and vendor seed the form. Entries come back newest first; the
  // negative ones are sales and removals, so skip past those.
  const lastStockAdded = (product.stockEntries ?? []).find((e) => e.quantity > 0);
  const lastStockCost = dollars(lastStockAdded?.costCents);
  const lastStockVendor = lastStockAdded?.vendorId ?? "";

  const [form, setForm] = useState({
    ...blankSerial,
    salePrice: productSalePrice,
    labelCost: lastStockCost,
    vendorId: lastStockVendor,
  });

  useEffect(() => setUnits(product.units ?? []), [product.units]);

  useEffect(() => {
    if (!form.locationId && meta?.locations.length) {
      setForm((f) => ({ ...f, locationId: meta.locations[0].id }));
    }
  }, [meta, form.locationId]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Serials recorded before the list existed keep their own size as an option,
  // so opening one to edit can't quietly drop it.
  const storageOptions =
    form.storage && !STORAGE_SIZES.includes(form.storage)
      ? [...STORAGE_SIZES, form.storage]
      : STORAGE_SIZES;

  const resetForm = () => {
    setEditingId(null);
    setForm((f) => ({
      ...blankSerial,
      locationId: f.locationId,
      salePrice: productSalePrice,
      labelCost: lastStockCost,
      vendorId: lastStockVendor,
    }));
  };

  const editUnit = (u: ProductUnit) => {
    setEditingId(u.id);
    setForm({
      serial: u.serial,
      condition: u.condition,
      locationId: u.locationId,
      storage: u.storage ?? "",
      color: u.color ?? "",
      warrantyMonths: String(u.warrantyMonths ?? 3),
      salePrice: u.salePriceCents != null ? dollars(u.salePriceCents) : productSalePrice,
      labelCost: u.labelCostCents != null ? dollars(u.labelCostCents) : lastStockCost,
      note: u.note ?? "",
      vendorId: u.vendorId ?? lastStockVendor,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const addVendor = async () => {
    const name = await notify.prompt({
      title: "New vendor",
      label: "Vendor name",
      confirmText: "Add vendor",
    });
    if (!name || !name.trim()) return;
    try {
      const created = await vendorsApi.create({ name: name.trim() });
      setExtraVendors((vs) => [...vs, { id: created.id, name: created.name }]);
      set("vendorId", created.id);
      notify.success(`${created.name} added.`);
    } catch (err) {
      notify.error("Could not create vendor.", {
        message: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.serial.trim()) return setError("Serial number is required.");
    if (!form.locationId) return setError("Pick a location.");

    setSaving(true);
    try {
      if (editingId) {
        const { clover } = await productsApi.updateUnit(editingId, {
          ...form,
          serial: form.serial.trim(),
          warrantyMonths: parseInt(form.warrantyMonths, 10),
        });
        reportCloverSync(notify, clover);
        resetForm();
      } else {
        const { clover } = await productsApi.addUnits(product.id, [
          { ...form, serial: form.serial.trim(), warrantyMonths: parseInt(form.warrantyMonths, 10) },
        ]);
        reportCloverSync(notify, clover);
        // Keep everything but the serial — the next unit is usually similar.
        setForm((f) => ({ ...f, serial: "" }));
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
    setSaving(false);
  };

  const remove = async (unit: ProductUnit) => {
    const ok = await notify.confirm({
      title: `Remove serial ${unit.serial}?`,
      message:
        "The unit is deleted from this product, and its item is deleted from Clover too.",
      confirmText: "Remove",
      variant: "error",
    });
    if (!ok) return;
    try {
      const { clover } = await productsApi.removeUnit(unit.id);
      if (editingId === unit.id) resetForm();
      notify.success(`Serial ${unit.serial} removed.`);
      reportCloverSync(notify, clover);
      onChanged();
    } catch (err) {
      notify.error("Could not remove.", {
        message: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const sell = async (unit: ProductUnit) => {
    const ok = await notify.confirm({
      title: `Mark serial ${unit.serial} as sold?`,
      message: "Quantity on hand drops by one.",
      confirmText: "Mark as sold",
    });
    if (!ok) return;
    setSellingId(unit.id);
    try {
      const { clover } = await productsApi.sellUnit(unit.id);
      reportCloverSync(notify, clover);
      if (editingId === unit.id) resetForm();
      notify.success(`Serial ${unit.serial} marked as sold.`);
      onChanged();
    } catch (err) {
      notify.error("Could not mark as sold.", {
        message: err instanceof Error ? err.message : undefined,
      });
    }
    setSellingId(null);
  };

  const returnToStock = async (unit: ProductUnit) => {
    const ok = await notify.confirm({
      title: `Return serial ${unit.serial} to stock?`,
      message:
        "Quantity on hand is left as is — adjust it from the Inventory tab.",
      confirmText: "Return to stock",
    });
    if (!ok) return;
    setReturningId(unit.id);
    try {
      const { clover } = await productsApi.returnUnit(unit.id);
      reportCloverSync(notify, clover);
      notify.success(`Serial ${unit.serial} is back in stock.`);
      onChanged();
    } catch (err) {
      notify.error("Could not return to stock.", {
        message: err instanceof Error ? err.message : undefined,
      });
    }
    setReturningId(null);
  };

  const inStock = units.filter((u) => u.status === "IN_STOCK");
  const gone = units.filter((u) => u.status !== "IN_STOCK");

  const UnitTable = ({ list, muted }: { list: ProductUnit[]; muted?: boolean }) => (
    <div className="overflow-x-auto">
      {/* Eleven columns will not fit beside the pricing panel. Given a floor they
          scroll within this panel; without one they crush to unreadable slivers. */}
      <table className="w-full min-w-[64rem]">
        <thead className="border-b border-gray-200 dark:border-gray-800">
          <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500">
            <th className="px-5 py-3">Serial</th>
            <th className="px-5 py-3">Condition</th>
            <th className="px-5 py-3">Location</th>
            <th className="px-5 py-3">Storage</th>
            <th className="px-5 py-3">Colour</th>
            <th className="px-5 py-3">Sale price</th>
            <th className="px-5 py-3">Vendor</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">Sale</th>
            <th className="px-5 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {list.map((u) => (
            <tr
              key={u.id}
              onClick={() => editUnit(u)}
              className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.02] ${
                muted ? "opacity-50" : ""
              } ${editingId === u.id ? "bg-brand-50 dark:bg-brand-500/10" : ""}`}
            >
              <td className="px-5 py-3 text-sm tabular-nums text-gray-800 dark:text-white/90">{u.serial}</td>
              <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400">{conditionLabel(u.condition)}</td>
              <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400">{u.location?.name ?? "—"}</td>
              <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400">{u.storage || "—"}</td>
              <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400">{u.color || "—"}</td>
              {/* Units without their own price sell at the product's — shown greyed so the difference is visible. */}
              <td className={`px-5 py-3 text-sm tabular-nums ${u.salePriceCents != null ? "text-gray-800 dark:text-white/90" : "text-gray-400 dark:text-gray-500"}`}>
                {money(u.salePriceCents ?? product.salePriceCents)}
              </td>
              <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400">{u.vendor?.name ?? "—"}</td>
              <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400">
                {u.status === "IN_STOCK" ? "In stock" : u.status === "SOLD" ? "Sold" : u.status}
              </td>
              <td className="px-5 py-3 text-sm">
                {/* Only a sale rung up on the Clover register links back here; a
                    serial sold by hand has no sale record to point at. */}
                {u.sale ? (
                  <Link
                    to={`/sales/${u.sale.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-medium text-brand-500 hover:text-brand-600 hover:underline"
                  >
                    #{u.sale.number}
                  </Link>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="px-5 py-3 text-right">
                <div className="flex items-center justify-end gap-3">
                  {u.status === "IN_STOCK" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); sell(u); }}
                      disabled={sellingId === u.id}
                      className="rounded-lg bg-success-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-success-600 disabled:opacity-60"
                    >
                      {sellingId === u.id ? "Selling…" : "Sell"}
                    </button>
                  )}
                  {u.status === "IN_STOCK" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); printUnitLabel(product, u, store); }}
                      className="text-xs font-medium text-brand-500 hover:text-brand-600"
                    >
                      Print
                    </button>
                  )}
                  {u.status !== "IN_STOCK" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); returnToStock(u); }}
                      disabled={returningId === u.id}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                    >
                      {returningId === u.id ? "Returning…" : "Return"}
                    </button>
                  )}
                  {can("OWNER", "MANAGER") && u.status !== "SOLD" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); remove(u); }}
                      className="text-xs font-medium text-error-500 hover:text-error-600"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className={panelClass}>
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="font-semibold text-gray-800 dark:text-white/90">
            {editingId ? "Edit serial number" : "Add serial number"}
          </h2>
          {editingId && (
            <button onClick={resetForm} className="text-sm font-medium text-gray-500 hover:text-gray-800 dark:hover:text-white/90">
              Cancel edit
            </button>
          )}
        </div>
        <form onSubmit={submit} className="space-y-4 p-6">
          {/* [&>*]:min-w-0 — a select is as wide as its longest option unless its
              grid cell is allowed to shrink, so one long vendor name would widen
              the whole column and push the page sideways. */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
            <div className="lg:col-span-2">
              <label className={labelClass}>Serial <span className="text-error-500">*</span></label>
              <input className={inputClass} value={form.serial} onChange={(e) => set("serial", e.target.value)} autoFocus />
            </div>
            <div>
              <label className={labelClass}>Condition <span className="text-error-500">*</span></label>
              <select className={inputClass} value={form.condition} onChange={(e) => set("condition", e.target.value)}>
                {CONDITIONS.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Location <span className="text-error-500">*</span></label>
              <select className={inputClass} value={form.locationId} onChange={(e) => set("locationId", e.target.value)}>
                <option value="">—</option>
                {meta?.locations.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Vendor</label>
              <div className="flex gap-2">
                <select className={`${inputClass} min-w-0 flex-1`} value={form.vendorId} onChange={(e) => set("vendorId", e.target.value)}>
                  <option value="">—</option>
                  {vendorOptions.map((v) => (<option key={v.id} value={v.id}>{v.name}</option>))}
                </select>
                <button
                  type="button"
                  onClick={addVendor}
                  title="Add a new vendor"
                  className="shrink-0 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
                >
                  + New
                </button>
              </div>
            </div>
            <div>
              <label className={labelClass}>Warranty</label>
              <select className={inputClass} value={form.warrantyMonths} onChange={(e) => set("warrantyMonths", e.target.value)}>
                {WARRANTY_MONTHS.map((w) => (<option key={w.value} value={w.value}>{w.label}</option>))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Sale price</label>
              <input type="number" step="0.01" min="0" className={inputClass} value={form.salePrice} onChange={(e) => set("salePrice", e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Label cost</label>
              <input type="number" step="0.01" className={inputClass} value={form.labelCost} onChange={(e) => set("labelCost", e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Storage</label>
              <select className={inputClass} value={form.storage} onChange={(e) => set("storage", e.target.value)}>
                <option value="">—</option>
                {storageOptions.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
            </div>
            {/* Colour and note share a row, with the note given the wider half. */}
            <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3 lg:col-span-3">
              <div>
                <label className={labelClass}>Colour</label>
                <input className={inputClass} value={form.color} onChange={(e) => set("color", e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Note</label>
                <input className={inputClass} value={form.note} onChange={(e) => set("note", e.target.value)} />
              </div>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/15">{error}</p>
          )}

          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
              {saving ? "Saving…" : editingId ? "Save changes" : "Add serial"}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5">
                Cancel
              </button>
            )}
          </div>
          {!editingId && (
            <p className="text-xs text-gray-500">Everything but the serial stays put after adding — scan the next one and hit Add again. Click any row below to edit it.</p>
          )}
        </form>
      </div>

      <div className={panelClass}>
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="font-semibold text-gray-800 dark:text-white/90">
            In stock <span className="ml-1 text-sm font-normal text-gray-500">{inStock.length}</span>
          </h2>
        </div>
        {inStock.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">No in-stock serial numbers were found.</p>
        ) : (
          <UnitTable list={inStock} />
        )}
      </div>

      {gone.length > 0 && (
        <div className={panelClass}>
          <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
            <h2 className="font-semibold text-gray-800 dark:text-white/90">
              Sold <span className="ml-1 text-sm font-normal text-gray-500">{gone.length}</span>
            </h2>
          </div>
          <UnitTable list={gone} muted />
        </div>
      )}
    </div>
  );
}

/* ------------------------------ details tab ------------------------------ */

function DetailsTab({ product, meta, onSaved }: { product: Product; meta: Meta | null; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: product.name,
    sku: product.sku,
    upc: product.upc ?? "",
    ean: product.ean ?? "",
    customSku: product.customSku ?? "",
    brandId: product.brandId ?? "",
    categoryId: product.categoryId ?? "",
    vendorId: product.vendorId ?? "",
    cost: (product.costCents / 100).toFixed(2),
    onlinePrice: (product.onlinePriceCents / 100).toFixed(2),
    salePrice: (product.salePriceCents / 100).toFixed(2),
    taxable: product.taxable,
    tracksSerials: product.tracksSerials,
    reorderAt: String(product.reorderAt),
    notes: product.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const set = (k: keyof typeof form, v: string | boolean) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setError("Product name is required.");
    setSaving(true);
    setError("");
    try {
      await productsApi.update(product.id, form);
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
    setSaving(false);
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <div className={panelClass}>
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="font-semibold text-gray-800 dark:text-white/90">Details</h2>
        </div>
        <div className="grid gap-5 p-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>Product name <span className="text-error-500">*</span></label>
            <input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div><label className={labelClass}>SKU</label><input className={inputClass} value={form.sku} onChange={(e) => set("sku", e.target.value)} /></div>
          <div><label className={labelClass}>Custom SKU</label><input className={inputClass} value={form.customSku} onChange={(e) => set("customSku", e.target.value)} /></div>
          <div><label className={labelClass}>UPC</label><input className={inputClass} value={form.upc} onChange={(e) => set("upc", e.target.value)} /></div>
          <div><label className={labelClass}>EAN</label><input className={inputClass} value={form.ean} onChange={(e) => set("ean", e.target.value)} /></div>
          <div>
            <label className={labelClass}>Brand</label>
            <select className={inputClass} value={form.brandId} onChange={(e) => set("brandId", e.target.value)}>
              <option value="">—</option>
              {meta?.brands.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Category</label>
            <select className={inputClass} value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
              <option value="">—</option>
              {meta?.categories.map((c) => (<option key={c.id} value={c.id}>{c.label ?? c.name}</option>))}
            </select>
          </div>
          <div><label className={labelClass}>Reorder at</label><input type="number" className={inputClass} value={form.reorderAt} onChange={(e) => set("reorderAt", e.target.value)} /></div>

          {/* The three prices and the two flags read as one decision, so they share
              a full-width row. Flex rather than a five-column grid: the prices
              split the space evenly while each checkbox takes only the width its
              label needs, instead of being handed a column as wide as an input. */}
          <div className="sm:col-span-2 flex flex-wrap items-end gap-5">
            <div className="min-w-[9rem] flex-1">
              <label className={labelClass}>Cost price</label>
              <input type="number" step="0.01" className={inputClass} value={form.cost} onChange={(e) => set("cost", e.target.value)} />
            </div>
            <div className="min-w-[9rem] flex-1">
              <label className={labelClass}>Online price</label>
              <input type="number" step="0.01" className={inputClass} value={form.onlinePrice} onChange={(e) => set("onlinePrice", e.target.value)} />
            </div>
            <div className="min-w-[9rem] flex-1">
              <label className={labelClass}>Sale price</label>
              <input type="number" step="0.01" className={inputClass} value={form.salePrice} onChange={(e) => set("salePrice", e.target.value)} />
            </div>
            <label className="flex items-center gap-2 pb-3 text-sm text-gray-700 dark:text-gray-400">
              <input
                type="checkbox"
                checked={form.taxable}
                onChange={(e) => set("taxable", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-gray-700"
              />
              Taxable
            </label>
            <label className="flex items-center gap-2 pb-3 text-sm text-gray-700 dark:text-gray-400">
              <input
                type="checkbox"
                checked={form.tracksSerials}
                onChange={(e) => set("tracksSerials", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-gray-700"
              />
              Items Serialized
            </label>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Notes</label>
            <textarea rows={3} className={`${inputClass} h-auto`} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
          <button type="submit" disabled={saving} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
            {saving ? "Saving…" : "Save changes"}
          </button>
          {saved && <span className="text-sm text-success-600">Saved</span>}
          {error && <span className="text-sm text-error-500">{error}</span>}
        </div>
      </div>
    </form>
  );
}

/* -------------------------------- the page -------------------------------- */

type TabKey = "details" | "inventory" | "serials";

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();
  const notify = useNotify();

  const [product, setProduct] = useState<Product | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [tab, setTab] = useState<TabKey>("details");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setProduct(await productsApi.get(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this item.");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    metaApi.all().then(setMeta).catch(() => {});
  }, [load]);

  const archive = async () => {
    if (!product) return;
    const ok = await notify.confirm({
      title: `Archive ${product.name}?`,
      message: "It stays in past sales but won't show in search.",
      confirmText: "Archive",
      variant: "error",
    });
    if (!ok) return;
    try {
      await productsApi.archive(product.id);
      notify.success(`${product.name} archived.`);
      navigate("/inventory/search");
    } catch (err) {
      notify.error("Could not archive.", {
        message: err instanceof Error ? err.message : undefined,
      });
    }
  };

  if (loading) return <p className="p-10 text-center text-sm text-gray-500">Loading…</p>;
  if (error || !product) return <p className="p-10 text-center text-sm text-error-500">{error || "Not found."}</p>;


  const units = product.units ?? [];
  const onHand = product.quantity;
  const avgCost = product.avgCostCents ?? product.costCents;
  const reserved = units.filter((u) => u.status === "RESERVED").length;
  const totalValue = avgCost * onHand;
  const totalSaleValue = product.salePriceCents * onHand;

  const prices = [
    { name: "Sale", cents: product.salePriceCents },
    { name: "Online", cents: product.onlinePriceCents },
  ];

  // Only serialised products get the Serial #s tab.
  const tabs: [TabKey, string][] = [
    ["details", "Details"],
    ["inventory", `Inventory (${onHand})`],
  ];
  if (product.tracksSerials) tabs.push(["serials", `Serial #s (${product.serialsOnFile})`]);

  // A non-serial product should never sit on the serials tab.
  const activeTab: TabKey = tab === "serials" && !product.tracksSerials ? "details" : tab;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">{product.name}</h1>
          <p className="mt-0.5 text-xs text-gray-500">{product.sku}</p>
        </div>
        {can("OWNER", "MANAGER") && (
          <button onClick={archive} className="rounded-lg border border-error-500 px-4 py-2.5 text-sm font-medium text-error-500 hover:bg-error-50 dark:hover:bg-error-500/10">Archive</button>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        {/* min-w-0: a grid track is min-width:auto by default, so it grows to fit
            its widest child and the whole page scrolls sideways. The tables inside
            already scroll on their own — this lets them, instead of pushing the
            pricing column off the edge. */}
        <div className="min-w-0 space-y-5">
          <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
            {tabs.map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)} className={`border-b-2 px-4 py-2.5 text-sm font-medium transition ${activeTab === key ? "border-brand-500 text-brand-500" : "border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-white/90"}`}>
                {label}
              </button>
            ))}
          </div>
          {activeTab === "serials" && product.tracksSerials ? (
            <SerialsTab product={product} meta={meta} onChanged={load} />
          ) : activeTab === "inventory" ? (
            <InventoryTab product={product} meta={meta} onChanged={load} />
          ) : (
            <DetailsTab product={product} meta={meta} onSaved={load} />
          )}
        </div>

        <div className="space-y-5">
          <div className={panelClass}>
            <div className="border-b border-gray-200 px-5 py-3 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Pricing</h3>
            </div>
            <table className="w-full table-fixed">
              <colgroup><col className="w-[26%]" /><col className="w-[30%]" /><col className="w-[22%]" /><col className="w-[22%]" /></colgroup>
              <thead>
                <tr className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
                  <th className="py-2 pl-5 pr-1 text-left">Name</th>
                  <th className="px-1 py-2 text-right">Price</th>
                  <th className="px-1 py-2 text-right">Markup</th>
                  <th className="py-2 pl-1 pr-5 text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {prices.map((p) => (
                  <tr key={p.name}>
                    <td className="py-2 pl-5 pr-1 text-sm font-medium text-gray-700 dark:text-gray-300">{p.name}</td>
                    <td className="px-1 py-2 text-right text-sm tabular-nums text-gray-800 dark:text-white/90">{money(p.cents)}</td>
                    <td className="px-1 py-2 text-right text-xs tabular-nums text-gray-500">{pct(markup(avgCost, p.cents))}</td>
                    <td className="py-2 pl-1 pr-5 text-right text-xs tabular-nums text-gray-500">{pct(margin(avgCost, p.cents))}</td>
                  </tr>
                ))}
                <tr className="border-t border-gray-100 dark:border-gray-800">
                  <td className="py-2 pl-5 pr-1 text-sm text-gray-500">Avg. cost</td>
                  <td className="px-1 py-2 text-right text-sm tabular-nums text-gray-600 dark:text-gray-400">{money(avgCost)}</td>
                  <td colSpan={2} className="pr-5" />
                </tr>
              </tbody>
            </table>
          </div>

          <div className={panelClass}>
            <div className="border-b border-gray-200 px-5 py-3 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Stock</h3>
            </div>
            <dl className="divide-y divide-gray-100 dark:divide-gray-800">
              {[
                ["On hand", String(onHand)],
                ...(product.tracksSerials ? [["Serials on file", String(product.serialsOnFile)]] as [string, string][] : []),
                ["Reserved", String(reserved)],
                ["Avg. cost", money(avgCost)],
                ["Total value", money(totalValue)],
                ["Total sale value", money(totalSaleValue)],
                ["Margin", pct(margin(avgCost, product.salePriceCents))],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between px-5 py-2.5">
                  <dt className="text-sm text-gray-500">{label}</dt>
                  <dd className="text-sm font-semibold tabular-nums text-gray-800 dark:text-white/90">{value}</dd>
                </div>
              ))}
            </dl>
            {product.tracksSerials && product.serialsOnFile !== onHand && (
              <p className="border-t border-gray-100 px-5 py-3 text-xs text-warning-600 dark:border-gray-800 dark:text-warning-500">
                On hand and serials on file don't match. That's allowed — quantity comes from the Inventory tab, serials are recorded separately.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}