import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { meta as metaApi, products as productsApi, type Meta } from "../../lib/api";
import { reportCloverSync } from "../../lib/cloverSync";
import { useNotify } from "../../components/ui/notify";

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800";

const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

export default function NewItemPage() {
  const navigate = useNavigate();
  const notify = useNotify();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Whether this product is tracked by serial number. Off = sold by quantity
  // (accessories, cases, etc.) and the Serial #s tab stays hidden for it.
  const [tracksSerials, setTracksSerials] = useState(true);

  const [form, setForm] = useState({
    name: "",
    sku: "",
    upc: "",
    ean: "",
    customSku: "",
    brandId: "",
    categoryId: "",
    vendorId: "",
    cost: "",
    onlinePrice: "",
    salePrice: "",
  });

  useEffect(() => {
    metaApi.all().then(setMeta).catch(() => {});
  }, []);

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) return setError("Product name is required.");

    setSaving(true);
    try {
      const created = await productsApi.create({ ...form, tracksSerials });
      reportCloverSync(notify, created.clover);
      // Straight to the item so serials / stock can go on next.
      navigate(`/inventory/items/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/inventory")}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
          aria-label="Back to inventory"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">New item</h1>
      </div>

      <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>
              Product name <span className="text-error-500">*</span>
            </label>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label className={labelClass}>SKU</label>
            <input
              className={inputClass}
              value={form.sku}
              onChange={(e) => set("sku", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Custom SKU</label>
            <input className={inputClass} value={form.customSku} onChange={(e) => set("customSku", e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>UPC</label>
            <input className={inputClass} value={form.upc} onChange={(e) => set("upc", e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>EAN</label>
            <input className={inputClass} value={form.ean} onChange={(e) => set("ean", e.target.value)} />
          </div>

          <div>
            <label className={labelClass}>Brand</label>
            <select className={inputClass} value={form.brandId} onChange={(e) => set("brandId", e.target.value)}>
              <option value="">—</option>
              {meta?.brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Category</label>
            <select className={inputClass} value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
              <option value="">—</option>
              {meta?.categories.map((c) => (
                <option key={c.id} value={c.id}>{c.label ?? c.name}</option>
              ))}
            </select>
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
          <div />

          <div>
            <label className={labelClass}>Cost price</label>
            <input type="number" step="0.01" className={inputClass} value={form.cost} onChange={(e) => set("cost", e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Online price</label>
            <input type="number" step="0.01" className={inputClass} value={form.onlinePrice} onChange={(e) => set("onlinePrice", e.target.value)} />
          </div>
          <div className="sm:col-span-2 flex flex-wrap items-end gap-6">
            <div className="min-w-[10rem] flex-1">
              <label className={labelClass}>Sale price</label>
              <input type="number" step="0.01" className={inputClass} value={form.salePrice} onChange={(e) => set("salePrice", e.target.value)} />
            </div>
            <label className="flex cursor-pointer items-center gap-2 pb-3 text-sm text-gray-700 dark:text-gray-400">
              <input
                type="checkbox"
                checked={tracksSerials}
                onChange={(e) => setTracksSerials(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-gray-700"
              />
              Items Serialized
            </label>
          </div>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/15">{error}</p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => navigate("/inventory")}
          className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {saving ? "Saving…" : tracksSerials ? "Save and add serials" : "Save and add stock"}
        </button>
      </div>
    </form>
  );
}