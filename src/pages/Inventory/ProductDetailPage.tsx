import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  CONDITIONS,
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
import { useAuth } from "../../context/AuthContext";
import { useStore } from "../../context/StoreContext";
import { printUnitLabel } from "./printLabel";

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
    if (!confirm("Remove this stock entry? The quantity on hand will change.")) return;
    try {
      await productsApi.removeStockEntry(entryId);
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not remove.");
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
  labelCost: "",
  note: "",
  vendorId: "",
};

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
  const [form, setForm] = useState({ ...blankSerial });

  useEffect(() => setUnits(product.units ?? []), [product.units]);

  useEffect(() => {
    if (!form.locationId && meta?.locations.length) {
      setForm((f) => ({ ...f, locationId: meta.locations[0].id }));
    }
  }, [meta, form.locationId]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const resetForm = () => {
    setEditingId(null);
    setForm((f) => ({ ...blankSerial, locationId: f.locationId }));
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
      labelCost: u.labelCostCents != null ? (u.labelCostCents / 100).toFixed(2) : "",
      note: u.note ?? "",
      vendorId: u.vendorId ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const addVendor = async () => {
    const name = prompt("New vendor name:");
    if (!name || !name.trim()) return;
    try {
      const created = await vendorsApi.create({ name: name.trim() });
      setExtraVendors((vs) => [...vs, { id: created.id, name: created.name }]);
      set("vendorId", created.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not create vendor.");
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
        await productsApi.updateUnit(editingId, {
          ...form,
          serial: form.serial.trim(),
          warrantyMonths: parseInt(form.warrantyMonths, 10),
        });
        resetForm();
      } else {
        await productsApi.addUnits(product.id, [
          { ...form, serial: form.serial.trim(), warrantyMonths: parseInt(form.warrantyMonths, 10) },
        ]);
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
    if (!confirm(`Remove serial ${unit.serial}?`)) return;
    try {
      await productsApi.removeUnit(unit.id);
      if (editingId === unit.id) resetForm();
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not remove.");
    }
  };

  const sell = async (unit: ProductUnit) => {
    if (!confirm(`Mark serial ${unit.serial} as sold? Quantity on hand drops by one.`)) return;
    setSellingId(unit.id);
    try {
      await productsApi.sellUnit(unit.id);
      if (editingId === unit.id) resetForm();
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not mark as sold.");
    }
    setSellingId(null);
  };

  const returnToStock = async (unit: ProductUnit) => {
    if (!confirm(`Return serial ${unit.serial} to stock? Quantity on hand is left as is — adjust it from the Inventory tab.`)) return;
    setReturningId(unit.id);
    try {
      await productsApi.returnUnit(unit.id);
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not return to stock.");
    }
    setReturningId(null);
  };

  const inStock = units.filter((u) => u.status === "IN_STOCK");
  const gone = units.filter((u) => u.status !== "IN_STOCK");

  const UnitTable = ({ list, muted }: { list: ProductUnit[]; muted?: boolean }) => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-gray-200 dark:border-gray-800">
          <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500">
            <th className="px-5 py-3">Serial</th>
            <th className="px-5 py-3">Condition</th>
            <th className="px-5 py-3">Location</th>
            <th className="px-5 py-3">Storage</th>
            <th className="px-5 py-3">Colour</th>
            <th className="px-5 py-3">Vendor</th>
            <th className="px-5 py-3">Status</th>
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
              <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400">{u.vendor?.name ?? "—"}</td>
              <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400">
                {u.status === "IN_STOCK" ? "In stock" : u.status === "SOLD" ? "Sold" : u.status}
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                <select className={inputClass} value={form.vendorId} onChange={(e) => set("vendorId", e.target.value)}>
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
              <label className={labelClass}>Label cost</label>
              <input type="number" step="0.01" className={inputClass} value={form.labelCost} onChange={(e) => set("labelCost", e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Storage</label>
              <input className={inputClass} value={form.storage} onChange={(e) => set("storage", e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Colour</label>
              <input className={inputClass} value={form.color} onChange={(e) => set("color", e.target.value)} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className={labelClass}>Note</label>
              <input className={inputClass} value={form.note} onChange={(e) => set("note", e.target.value)} />
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
          <div>
            <label className={labelClass}>Default vendor</label>
            <select className={inputClass} value={form.vendorId} onChange={(e) => set("vendorId", e.target.value)}>
              <option value="">—</option>
              {meta?.vendors.map((v) => (<option key={v.id} value={v.id}>{v.name}</option>))}
            </select>
          </div>
          <div><label className={labelClass}>Reorder at</label><input type="number" className={inputClass} value={form.reorderAt} onChange={(e) => set("reorderAt", e.target.value)} /></div>
          <div><label className={labelClass}>Cost price</label><input type="number" step="0.01" className={inputClass} value={form.cost} onChange={(e) => set("cost", e.target.value)} /></div>
          <div><label className={labelClass}>Online price</label><input type="number" step="0.01" className={inputClass} value={form.onlinePrice} onChange={(e) => set("onlinePrice", e.target.value)} /></div>
          <div className="sm:col-span-2 flex flex-wrap items-end gap-6">
            <div className="min-w-[10rem] flex-1">
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
    if (!confirm(`Archive ${product.name}? It stays in past sales but won't show in search.`)) return;
    try {
      await productsApi.archive(product.id);
      navigate("/inventory/search");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not archive.");
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
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/inventory/search")} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5" aria-label="Back to search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">{product.name}</h1>
            <p className="mt-0.5 text-xs text-gray-500">{product.sku}</p>
          </div>
        </div>
        {can("OWNER", "MANAGER") && (
          <button onClick={archive} className="rounded-lg border border-error-500 px-4 py-2.5 text-sm font-medium text-error-500 hover:bg-error-50 dark:hover:bg-error-500/10">Archive</button>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
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