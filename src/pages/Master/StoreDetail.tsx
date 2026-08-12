import { useCallback, useEffect, useState } from "react";
import {
  master,
  money,
  ROLES,
  type MasterCustomer,
  type MasterProduct,
  type MasterTicket,
  type Role,
  type Store,
  type StoreCounts,
  type User,
} from "../../lib/api";
import { TICKET_STATUS, cardClass, inputClass, labelClass, tableWrap, td, th } from "./ui";

type Tab = "inventory" | "service" | "customers" | "staff";

const TABS: [Tab, string][] = [
  ["inventory", "Inventory"],
  ["service", "Service tickets"],
  ["customers", "Customers"],
  ["staff", "Staff"],
];

const date = (v?: string | null) => (v ? new Date(v).toLocaleDateString() : "—");
const fullName = (c: { firstName: string; lastName?: string | null }) =>
  [c.firstName, c.lastName].filter(Boolean).join(" ");

const emptyUser = { name: "", email: "", password: "", role: "STAFF" as Role };

/**
 * One store, seen from the master console. The three record tabs are read-only —
 * there is no server route to change them from here. Staff is the exception:
 * the master sets up accounts, which is the whole point of the screen.
 */
export default function StoreDetail({ store, onBack }: { store: Store; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>("inventory");
  const [counts, setCounts] = useState<StoreCounts | null>(null);
  const [q, setQ] = useState("");

  const [products, setProducts] = useState<MasterProduct[]>([]);
  const [tickets, setTickets] = useState<MasterTicket[]>([]);
  const [customers, setCustomers] = useState<MasterCustomer[]>([]);
  const [staff, setStaff] = useState<User[]>([]);

  const [form, setForm] = useState(emptyUser);
  const [addingUser, setAddingUser] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    master
      .store(store.id)
      .then((r) => setCounts(r.counts))
      .catch(() => setCounts(null));
  }, [store.id]);

  // Switching tab or typing in the search box reloads just that tab.
  useEffect(() => {
    setLoading(true);
    setError("");
    const job =
      tab === "inventory"
        ? master.inventory(store.id, q).then(setProducts)
        : tab === "service"
        ? master.tickets(store.id, q).then(setTickets)
        : tab === "customers"
        ? master.customers(store.id, q).then(setCustomers)
        : master.users(store.id).then(setStaff);

    job
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load that."))
      .finally(() => setLoading(false));
  }, [tab, q, store.id]);

  // The search box doesn't apply to the staff tab.
  useEffect(() => setQ(""), [tab]);

  const reloadStaff = useCallback(async () => {
    setStaff(await master.users(store.id));
  }, [store.id]);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const user = await master.createUser(store.id, form);
      setNotice(`${user.name} can now sign in with ${user.email}.`);
      setForm(emptyUser);
      setAddingUser(false);
      await reloadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create that account.");
    }
    setBusy(false);
  }

  async function toggleUser(u: User) {
    const verb = u.active === false ? "Switch back on" : "Switch off";
    if (!confirm(`${verb} ${u.name}'s account?`)) return;
    try {
      await master.updateUser(u.id, { active: u.active === false });
      await reloadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change that account.");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            ← All stores
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">{store.name}</h1>
            <p className="text-xs text-gray-500">
              {[store.phone, store.website, store.address].filter(Boolean).join(" · ") ||
                "No contact details set"}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-400">
          Read-only
        </span>
      </div>

      {counts && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["Items", counts.products],
            ["Customers", counts.customers],
            ["Tickets", counts.tickets],
            ["Open jobs", counts.openTickets],
            ["Sales", counts.sales],
          ].map(([label, n]) => (
            <div key={String(label)} className={`${cardClass} p-4 text-center`}>
              <dd className="text-xl font-semibold text-gray-800 dark:text-white/90">{n}</dd>
              <dt className="mt-0.5 text-[11px] uppercase tracking-wide text-gray-400">{label}</dt>
            </div>
          ))}
        </dl>
      )}

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === key
                ? "border-brand-500 text-brand-500"
                : "border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-white/90"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab !== "staff" && (
        <input
          className={inputClass}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      )}

      {error && <p className="text-sm text-error-500">{error}</p>}
      {notice && (
        <p className="rounded-xl bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-500/15 dark:text-success-400">
          {notice}
        </p>
      )}
      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {/* ---------------------------- inventory ---------------------------- */}
      {tab === "inventory" && (
        <div className={tableWrap}>
          <table className="w-full">
            <thead className="border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th className={th}>Item</th>
                <th className={th}>Brand</th>
                <th className={`${th} text-right`}>On hand</th>
                <th className={`${th} text-right`}>Cost</th>
                <th className={`${th} text-right`}>Sale price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-3 text-sm text-gray-800 dark:text-white/90">
                    {p.name}
                    <span className="block text-xs text-gray-400">{p.sku}</span>
                  </td>
                  <td className={td}>{p.brand ?? "—"}</td>
                  <td className={`${td} text-right tabular-nums`}>{p.quantity}</td>
                  <td className={`${td} text-right tabular-nums`}>{money(p.costCents)}</td>
                  <td className="px-5 py-3 text-right text-sm font-medium tabular-nums text-gray-800 dark:text-white/90">
                    {money(p.salePriceCents)}
                  </td>
                </tr>
              ))}
              {!loading && products.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-sm text-gray-500">
                    Nothing in this store's inventory.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* --------------------------- service tickets --------------------------- */}
      {tab === "service" && (
        <div className={tableWrap}>
          <table className="w-full">
            <thead className="border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th className={th}>#</th>
                <th className={th}>Device</th>
                <th className={th}>Issue</th>
                <th className={th}>Customer</th>
                <th className={th}>Status</th>
                <th className={`${th} text-right`}>In</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td className="px-5 py-3 text-sm font-medium text-gray-800 dark:text-white/90">
                    {t.number}
                  </td>
                  <td className={td}>
                    {[t.deviceMake, t.deviceModel].filter(Boolean).join(" ") || "—"}
                    {t.deviceImei && (
                      <span className="block font-mono text-xs text-gray-400">{t.deviceImei}</span>
                    )}
                  </td>
                  <td className={`${td} max-w-xs truncate`}>{t.issue}</td>
                  <td className={td}>{t.customer ? fullName(t.customer) : "—"}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        TICKET_STATUS[t.status] ?? TICKET_STATUS.INTAKE
                      }`}
                    >
                      {t.status.toLowerCase().replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>{date(t.createdAt)}</td>
                </tr>
              ))}
              {!loading && tickets.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-sm text-gray-500">
                    No service tickets for this store.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------------------------- customers ---------------------------- */}
      {tab === "customers" && (
        <div className={tableWrap}>
          <table className="w-full">
            <thead className="border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th className={th}>Name</th>
                <th className={th}>Phone</th>
                <th className={th}>Email</th>
                <th className={`${th} text-right`}>Sales</th>
                <th className={`${th} text-right`}>Tickets</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {customers.map((c) => (
                <tr key={c.id}>
                  <td className="px-5 py-3 text-sm text-gray-800 dark:text-white/90">
                    {fullName(c)}
                    {c.company && <span className="block text-xs text-gray-400">{c.company}</span>}
                  </td>
                  <td className={td}>{c.phone ?? "—"}</td>
                  <td className={td}>{c.email ?? "—"}</td>
                  <td className={`${td} text-right tabular-nums`}>{c._count?.sales ?? 0}</td>
                  <td className={`${td} text-right tabular-nums`}>{c._count?.tickets ?? 0}</td>
                </tr>
              ))}
              {!loading && customers.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-sm text-gray-500">
                    No customers for this store.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ------------------------------- staff ------------------------------- */}
      {tab === "staff" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setAddingUser((v) => !v)}
              className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
            >
              {addingUser ? "Cancel" : "Add account"}
            </button>
          </div>

          {addingUser && (
            <div className={cardClass}>
              <h2 className="mb-4 font-semibold text-gray-800 dark:text-white/90">
                New account for {store.name}
              </h2>
              <form onSubmit={addUser} className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>
                    Name <span className="text-error-500">*</span>
                  </label>
                  <input
                    className={inputClass}
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Email <span className="text-error-500">*</span>
                  </label>
                  <input
                    type="email"
                    className={inputClass}
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={labelClass}>Role</label>
                  <select
                    className={inputClass}
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>
                    Starting password <span className="text-error-500">*</span>
                  </label>
                  <input
                    type="password"
                    className={inputClass}
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
                  >
                    {busy ? "Creating…" : "Create account"}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className={tableWrap}>
            <table className="w-full">
              <thead className="border-b border-gray-200 dark:border-gray-800">
                <tr>
                  <th className={th}>Name</th>
                  <th className={th}>Email</th>
                  <th className={th}>Role</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {staff.map((u) => (
                  <tr key={u.id} className={u.active === false ? "opacity-50" : ""}>
                    <td className="px-5 py-3 text-sm text-gray-800 dark:text-white/90">
                      {u.name}
                      {u.active === false && (
                        <span className="ml-2 text-xs text-error-500">switched off</span>
                      )}
                    </td>
                    <td className={td}>{u.email}</td>
                    <td className={td}>{u.role.toLowerCase()}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => toggleUser(u)}
                        className="text-xs font-medium text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      >
                        {u.active === false ? "Switch on" : "Switch off"}
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && staff.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-sm text-gray-500">
                      No accounts yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
