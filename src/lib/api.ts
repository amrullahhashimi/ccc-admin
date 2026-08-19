/**
 * Talks to the CCC Admin API.
 *
 * Sessions ride in an httpOnly cookie, so every call sends credentials
 * and the server decides what you're allowed to do.
 */

export type Role = "OWNER" | "MANAGER" | "STAFF" | "TECH";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active?: boolean;
  /** Which shop this account belongs to — every query is filtered by it. */
  storeId?: string;
  storeName?: string | null;
  /** Can create and manage stores across the whole system. */
  superAdmin?: boolean;
}

export interface Vendor {
  id: string;
  name: string;
  accountNumber?: string | null;
  contactPerson?: string | null;
  currency: string;
  phone?: string | null;
  mobile?: string | null;
  fax?: string | null;
  email1?: string | null;
  email2?: string | null;
  country?: string | null;
  address?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  postal?: string | null;
  notes?: string | null;
  active: boolean;
  createdAt: string;
  _count?: { products: number };
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  active: boolean;
  ownItems: number;
  totalItems: number;
  children?: Category[];
}

export interface ProductUnit {
  id: string;
  productId: string;
  serial: string;
  condition: string;
  storage?: string | null;
  color?: string | null;
  warrantyMonths: number;
  locationId: string;
  location?: { id: string; name: string };
  status: string; // IN_STOCK | RESERVED | SOLD | RETURNED
  createdAt: string;
  salePriceCents?: number | null; // null means "use the product's sale price"
  labelCostCents?: number | null;
  note?: string | null;
  vendorId?: string | null;
  vendor?: { id: string; name: string } | null;
  /** The Clover item this serial became, or null if it was never pushed. */
  cloverItemId?: string | null;
  /** The sale this serial went out on, when it sold through the Clover register. */
  saleId?: string | null;
  sale?: { id: string; number: number } | null;
}

/**
 * What happened when serials were mirrored to Clover.
 * `connected: false` means the store has no Clover account set up, which is
 * not a failure — there was simply nothing to sync with.
 */
export interface CloverSyncResult {
  connected: boolean;
  /** Which way the sync went, for the message shown if part of it fails. */
  action: "added" | "updated" | "removed" | "sold" | "returned";
  /** How many serials made it through. */
  count: number;
  failed: { serial: string; error: string }[];
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  upc?: string | null;
  ean?: string | null;
  customSku?: string | null;
  brandId?: string | null;
  brand?: { id: string; name: string } | null;
  categoryId?: string | null;
  category?: { id: string; name: string; parent?: { name: string } | null } | null;
  vendorId?: string | null;
  vendor?: { id: string; name: string } | null;
  costCents: number;
  onlinePriceCents: number;
  salePriceCents: number;
  taxable: boolean;
  reorderAt: number;
  notes?: string | null;
  active: boolean;
  createdAt: string;
  units?: ProductUnit[];
  stockEntries?: StockEntry[];
  quantity: number;      // sum of stock entries
  avgCostCents: number;
  serialsOnFile: number; // serials recorded, tracked separately
  unitCount: number;
  tracksSerials: boolean;
}

export interface SalePayment {
  id: string;
  amountCents: number;
  method: string; // CASH | CARD | ETRANSFER | OTHER
  reference?: string | null;
  createdAt: string;
}

export interface SaleItem {
  id: string;
  productId?: string | null;
  product?: { id: string; name: string; sku: string } | null;
  name: string;
  quantity: number;
  unitPriceCents: number;
  costCents: number;
}

export interface Sale {
  id: string;
  /** The shop's own number. Null for a sale rung up on the Clover register. */
  number: number | null;
  /** Set when the sale came from Clover — then it is the sale's identity. */
  cloverOrderId?: string | null;
  customerId?: string | null;
  customer?: Customer | null;
  userId?: string | null;
  user?: { id: string; name: string } | null;
  locationId?: string | null;
  location?: { id: string; name: string } | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  status: string; // OPEN | PAID | REFUNDED | VOID
  source: string; // APP | CLOVER
  needsReview: boolean;
  createdAt: string;
  items?: SaleItem[];
  payments?: SalePayment[];
  _count?: { items: number };
}

/**
 * How a sale is named anywhere it is shown.
 *
 * A sale raised here gets the shop's running number; one rung up on the
 * Clover register keeps the identity Clover gave it, so the receipt, the
 * register and this app all read the same. Mirrored in server/src/sale-ref.js.
 */
export const saleRef = (sale: {
  number?: number | null;
  cloverOrderId?: string | null;
  id?: string;
}): string => (sale.number != null ? `#${sale.number}` : sale.cloverOrderId || sale.id || "");

export interface SaleLineInput {
  productId?: string | null;
  unitId?: string | null;
  name: string;
  quantity: number;
  unitPriceCents: number;
  costCents?: number;
  taxable?: boolean;
}

export interface SalePaymentInput {
  amountCents: number;
  method: string;
  reference?: string;
}

export const sales = {
  list: (params: { q?: string; status?: string } = {}) => {
    const p = new URLSearchParams();
    if (params.q) p.set("q", params.q);
    if (params.status) p.set("status", params.status);
    const qs = p.toString();
    return request<Sale[]>("/api/sales" + (qs ? `?${qs}` : ""));
  },
  get: (id: string) => request<Sale>(`/api/sales/${id}`),
  create: (data: { customerId: string; locationId?: string | null; items: SaleLineInput[]; payments: SalePaymentInput[] }) =>
    request<Sale>("/api/sales", { method: "POST", ...body(data) }),
  addPayment: (id: string, data: SalePaymentInput) =>
    request<Sale>(`/api/sales/${id}/payments`, { method: "POST", ...body(data) }),
  cloverPay: (id: string, data: { amountCents: number }) =>
    request<Sale>(`/api/sales/${id}/clover-pay`, { method: "POST", ...body(data) }),
  void: (id: string) => request<Sale>(`/api/sales/${id}/void`, { method: "POST" }),
};

export interface StockEntry {
  id: string;
  productId: string;
  quantity: number;
  costCents: number;
  vendorId?: string | null;
  vendor?: { id: string; name: string } | null;
  note?: string | null;
  createdAt: string;
}

/** What the New Item form sends for each serial row. */
export interface UnitInput {
  serial: string;
  condition: string;
  locationId: string;
  storage?: string;
  color?: string;
  warrantyMonths?: number;
  salePrice?: string;
  labelCost?: string;
  note?: string;
  vendorId?: string | null;
}

export interface Customer {
  id: string;
  firstName: string;
  lastName?: string | null;
  company?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  postal?: string | null;
  contactConsent: boolean;
  notes?: string | null;
  createdAt: string;
  _count?: { sales: number; tickets: number; layaways: number };
}

export const brands = {
  list: (q?: string) =>
    request<Brand[]>("/api/brands" + (q ? `?q=${encodeURIComponent(q)}` : "")),
  create: (data: { name: string; notes?: string }) =>
    request<Brand>("/api/brands", { method: "POST", ...body(data) }),
  update: (id: string, data: { name?: string; notes?: string; active?: boolean }) =>
    request<Brand>(`/api/brands/${id}`, { method: "PATCH", ...body(data) }),
  remove: (id: string) =>
    request<{ ok: true; archived: boolean; message?: string }>(`/api/brands/${id}`, {
      method: "DELETE",
    }),
};

export interface Meta {
  categories: { id: string; name: string; parentId?: string | null; label?: string }[];
  vendors: { id: string; name: string }[];
  locations: { id: string; name: string; address?: string | null }[];
  brands: { id: string; name: string }[];
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const API_BASE = "";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(API_BASE + path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

const body = (data: unknown) => ({ body: JSON.stringify(data) });

/* ------------------------------ auth ------------------------------ */

export const auth = {
  login: (email: string, password: string) =>
    request<{ user: User; needPin: boolean }>("/api/auth/login", { method: "POST", ...body({ email, password }) }),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  me: () => request<{ user: User; locked: boolean; hasPin: boolean }>("/api/auth/me"),
  unlock: (pin: string) =>
    request<{ user: User }>("/api/auth/unlock", { method: "POST", ...body({ pin }) }),
  ping: () => request<{ ok: true }>("/api/auth/ping", { method: "POST" }),   // ← ADD THIS
  changePassword: (current: string, next: string) =>
    request<{ ok: true }>("/api/auth/password", { method: "POST", ...body({ current, next }) }),
  setPin: (pin: string) => request<{ ok: true }>("/api/auth/pin", { method: "POST", ...body({ pin }) }),
  removePin: () => request<{ ok: true }>("/api/auth/pin", { method: "DELETE" }),
};

/* ---------------------------- products ---------------------------- */

export interface ProductFilters {
  q?: string;
  location?: string;
  condition?: string;
  lowStock?: boolean;
  /** Archived items instead of live ones — the two lists never mix. */
  archived?: boolean;
}

export const products = {
  list: (filters: ProductFilters = {}) => {
    const p = new URLSearchParams();
    if (filters.q) p.set("q", filters.q);
    if (filters.location) p.set("location", filters.location);
    if (filters.condition) p.set("condition", filters.condition);
    if (filters.lowStock) p.set("lowStock", "1");
    if (filters.archived) p.set("archived", "1");
    const qs = p.toString();
    return request<Product[]>("/api/products" + (qs ? `?${qs}` : ""));
  },
  get: (id: string) => request<Product>(`/api/products/${id}`),
  // Money goes out as dollars (cost, onlinePrice, salePrice); the API stores cents.
  create: (data: Record<string, unknown> & { units?: UnitInput[] }) =>
    request<Product & { clover: CloverSyncResult }>("/api/products", {
      method: "POST",
      ...body(data),
    }),
  update: (id: string, data: Record<string, unknown>) =>
    request<Product>(`/api/products/${id}`, { method: "PATCH", ...body(data) }),
  archive: (id: string) => request<{ ok: true }>(`/api/products/${id}`, { method: "DELETE" }),
  restore: (id: string) =>
    request<{ ok: true }>(`/api/products/${id}/restore`, { method: "POST" }),

  addUnits: (productId: string, units: UnitInput[]) =>
    request<{ units: ProductUnit[]; clover: CloverSyncResult }>(
      `/api/products/${productId}/units`,
      { method: "POST", ...body({ units }) }
    ),
  updateUnit: (unitId: string, data: Partial<UnitInput> & { status?: string }) =>
    request<{ unit: ProductUnit; clover: CloverSyncResult }>(
      `/api/products/units/${unitId}`,
      { method: "PATCH", ...body(data) }
    ),
  /** Removing a serial here deletes its Clover item too. */
  removeUnit: (unitId: string) =>
    request<{ ok: true; clover: CloverSyncResult }>(`/api/products/units/${unitId}`, {
      method: "DELETE",
    }),
  /** Selling keeps the Clover item and takes one off its stock. */
  sellUnit: (unitId: string) =>
    request<{ ok: true; clover: CloverSyncResult }>(`/api/products/units/${unitId}/sell`, {
      method: "POST",
    }),
  /** Returning puts the Clover count back, undoing what the sale took off. */
  returnUnit: (unitId: string) =>
    request<{ ok: true; clover: CloverSyncResult }>(`/api/products/units/${unitId}/return`, {
      method: "POST",
    }),
  addStock: (productId: string, data: { quantity: number; cost?: string; vendorId?: string | null; note?: string }) =>
    request<StockEntry>(`/api/products/${productId}/stock`, { method: "POST", ...body(data) }),
  removeStockEntry: (entryId: string) =>
    request<{ ok: true }>(`/api/products/stock/${entryId}`, { method: "DELETE" }),
};

/* ---------------------------- customers ---------------------------- */

export const customers = {
  list: (q = "") => request<Customer[]>(`/api/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  get: (id: string) => request<Customer>(`/api/customers/${id}`),
  create: (data: Partial<Customer>) => request<Customer>("/api/customers", { method: "POST", ...body(data) }),
  update: (id: string, data: Partial<Customer>) => request<Customer>(`/api/customers/${id}`, { method: "PATCH", ...body(data) }),
  remove: (id: string) => request<{ ok: true }>(`/api/customers/${id}`, { method: "DELETE" }),
};

/* ----------------------------- vendors ----------------------------- */

export const vendors = {
  list: (q?: string) =>
    request<Vendor[]>("/api/vendors" + (q ? `?q=${encodeURIComponent(q)}` : "")),
  get: (id: string) => request<Vendor>(`/api/vendors/${id}`),
  create: (data: Record<string, unknown>) =>
    request<Vendor>("/api/vendors", { method: "POST", ...body(data) }),
  update: (id: string, data: Record<string, unknown>) =>
    request<Vendor>(`/api/vendors/${id}`, { method: "PATCH", ...body(data) }),
  // Vendors with products attached are archived, not deleted.
  remove: (id: string) =>
    request<{ ok: true; archived: boolean; message?: string }>(`/api/vendors/${id}`, {
      method: "DELETE",
    }),
};

/* ----------------------------- brands ----------------------------- */

export interface Brand {
  id: string;
  name: string;
  notes?: string | null;
  active: boolean;
  createdAt: string;
  _count?: { products: number };
}

/* ----------------------------- categories ----------------------------- */

export const categories = {
  list: () => request<Category[]>("/api/categories"),
  flat: () =>
    request<{ id: string; name: string; parentId: string | null; parentName: string | null; label: string }[]>(
      "/api/categories/flat"
    ),
  create: (data: { name: string; parentId?: string | null }) =>
    request<Category>("/api/categories", { method: "POST", ...body(data) }),
  update: (id: string, data: { name?: string; parentId?: string | null }) =>
    request<Category>(`/api/categories/${id}`, { method: "PATCH", ...body(data) }),
  remove: (id: string) =>
    request<{ ok: true; archived: boolean; message?: string }>(`/api/categories/${id}`, {
      method: "DELETE",
    }),
};

/* ----------------------------- Service ----------------------------- */

export interface ServiceLine {
  id: string;
  productId?: string | null;
  product?: { id: string; name: string; sku: string } | null;
  name: string;
  quantity: number;
  priceCents: number;
}

export interface Service {
  id: string;
  number: number;
  customerId: string;
  customer?: { id: string; firstName: string; lastName?: string | null; phone?: string | null; mobile?: string | null; email?: string | null };
  deviceMake?: string | null;
  deviceModel?: string | null;
  deviceImei?: string | null;
  passcode?: string | null;
  issue: string;
  diagnosis?: string | null;
  status: string;
  estimateCents: number;
  depositCents: number;
  technicianId?: string | null;
  technician?: { id: string; name: string } | null;
  locationId?: string | null;
  location?: { id: string; name: string } | null;
  parts?: ServiceLine[];
  partsCents?: number;
  labourCents?: number;
  totalCents?: number;
  createdAt: string;
  warranty?: boolean;
  dateIn?: string | null;
  promisedAt?: string | null;
  receiptNote?: string | null;
  externalNote?: string | null;
  internalNote?: string | null;
  trackToken?: string | null;
  signatureData?: string | null;
  signedAt?: string | null;
}

/* ----------------------------- dashboard ----------------------------- */

export interface Dashboard {
  totals: {
    products: number;
    unitsInStock: number;
    unitsSold: number;
    unitsReserved: number;
    customers: number;
    vendors: number;
    brands: number;
    stockValueCents: number;
    retailValueCents: number;
    potentialProfitCents: number;
    lowStockCount: number;
  };
  lowStock: { id: string; name: string; sku: string; quantity: number; reorderAt: number; brand: string | null }[];
  byLocation: { id: string; name: string; units: number; valueCents: number }[];
  byCondition: { condition: string; count: number }[];
  byCategory: { name: string; units: number; products: number }[];
  recent: {
    id: string;
    name: string;
    sku: string;
    quantity: number;
    salePriceCents: number;
    category: string | null;
    createdAt: string;
  }[];
}

export const dashboard = {
  get: () => request<Dashboard>("/api/dashboard"),
};

/* ------------------------------ meta ------------------------------ */

export const meta = {
  all: () => request<Meta>("/api/meta"),
  users: () => request<User[]>("/api/meta/users"),
  createUser: (data: Record<string, unknown>) =>
    request<User>("/api/meta/users", { method: "POST", ...body(data) }),
  updateUser: (id: string, data: Record<string, unknown>) =>
    request<User>(`/api/meta/users/${id}`, { method: "PATCH", ...body(data) }),
  createCategory: (name: string) =>
    request<{ id: string; name: string }>("/api/meta/categories", { method: "POST", ...body({ name }) }),
  createLocation: (data: Record<string, unknown>) =>
    request<{ id: string; name: string }>("/api/meta/locations", { method: "POST", ...body(data) }),
};

/* ---------------------------- helpers ---------------------------- */

export const CONDITIONS: { value: string; label: string }[] = [
  { value: "NEW", label: "New" },
  { value: "OPEN_BOX", label: "Open box" },
  { value: "USED_LIKE_NEW", label: "Used — like new" },
  { value: "USED_GOOD", label: "Used — good" },
  { value: "USED_FAIR", label: "Used — fair" },
  { value: "FOR_PARTS", label: "For parts" },
];

export const SERVICE_STATUSES = [
  { value: "INTAKE", label: "Open" },
  { value: "DIAGNOSING", label: "In progress" },
  { value: "WAITING_PARTS", label: "Waiting for parts" },
  { value: "READY", label: "Done" },
  { value: "COLLECTED", label: "Picked up" },
  { value: "CANCELLED", label: "Cancelled" },
];

/** Storage sizes for a serial. Free text underneath, so older odd values still load. */
export const STORAGE_SIZES: string[] = [
  "16 GB",
  "32 GB",
  "64 GB",
  "128 GB",
  "256 GB",
  "512 GB",
  "1 TB",
  "2 TB",
  "4 TB",
  "8 TB",
];

export const WARRANTY_MONTHS: { value: number; label: string }[] = [
  { value: 0, label: "No warranty" },
  { value: 3, label: "3 months" },
  { value: 4, label: "4 months" },
  { value: 5, label: "5 months" },
  { value: 6, label: "6 months" },
  { value: 7, label: "7 months" },
  { value: 8, label: "8 months" },
  { value: 9, label: "9 months" },
  { value: 10, label: "10 months" },
  { value: 11, label: "11 months" },
  { value: 12, label: "12 months" },
];

export const ROLES: { value: Role; label: string }[] = [
  { value: "OWNER", label: "Owner" },
  { value: "MANAGER", label: "Manager" },
  { value: "STAFF", label: "Staff" },
  { value: "TECH", label: "Technician" },
];

export const money = (cents?: number | null) =>
  cents == null ? "—" : "$" + (cents / 100).toFixed(2);

export const conditionLabel = (value: string) =>
  CONDITIONS.find((c) => c.value === value)?.label ?? value;

/* ------------------------------ stores ------------------------------ */

export interface Store {
  id: string;
  name: string;
  logoLight?: string | null;
  logoDark?: string | null;
  iconLight?: string | null;
  iconDark?: string | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  serviceTerms?: string | null;
  labelWidthMm: number;
  labelHeightMm: number;
  active: boolean;
  createdAt: string;
  /** Last four characters of the saved Clover token — the token itself never leaves the server. */
  cloverTokenHint?: string | null;
}

/** One upload slot: where the logo appears and what size it should be. */
export interface LogoSlot {
  label: string;
  use: string;
  width: number;
  height: number;
  maxKb: number;
}

export type CloverEnv = "production" | "sandbox";

/** What Store settings → Connect to Clover shows. The API token is never included. */
export interface CloverStatus {
  env: CloverEnv;
  merchantId: string | null;
  /** Masked last four of the saved token, or null when nothing is saved. */
  tokenHint: string | null;
  verifiedAt: string | null;
  connected: boolean;
  /** Only on save — the account name Clover confirmed. */
  merchantName?: string | null;
}

export interface CloverForm {
  env: CloverEnv;
  merchantId: string;
  /** Blank leaves the saved token alone. */
  token: string;
}

export const stores = {
  settings: () => request<Store>("/api/stores/settings"),
  logoSlots: () => request<Record<string, LogoSlot>>("/api/stores/logo-slots"),
  saveSettings: (data: Record<string, unknown>) =>
    request<Store>("/api/stores/settings", { method: "PATCH", ...body(data) }),

  clover: () => request<CloverStatus>("/api/stores/clover"),
  /** Saves only if Clover accepts the credentials, so connected means it works. */
  saveClover: (data: CloverForm) =>
    request<CloverStatus>("/api/stores/clover", { method: "PUT", ...body(data) }),
  disconnectClover: () => request<CloverStatus>("/api/stores/clover", { method: "DELETE" }),
};

/* ---------------------------- daily performance ---------------------------- */

export interface PerformanceEntry {
  id: string;
  /** The trading day, as YYYY-MM-DD — no time, so a day means one thing everywhere. */
  date: string;
  saleType: string;
  paymentType: string;
  amountCents: number;
  note?: string | null;
  user?: { id: string; name: string } | null;
  createdAt: string;
}

/**
 * One day's takings split by payment type, keyed by the payment type's value.
 * Every day in the range is present, so `hasEntries` is what separates a day
 * that took nothing from one nobody has filled in yet.
 */
export type PerformanceDay = { date: string; hasEntries: boolean } & Record<
  string,
  number | string | boolean
>;

export interface PerformanceReport {
  from: string;
  to: string;
  entries: PerformanceEntry[];
  /** Ascending by date, for the chart's x-axis. */
  byDay: PerformanceDay[];
  byPaymentType: Record<string, number>;
  bySaleType: Record<string, number>;
  totalCents: number;
  count: number;
}

export interface PerformanceOptions {
  saleTypes: { value: string; label: string }[];
  /** In the order the chart assigns its colour slots. */
  paymentTypes: { value: string; label: string }[];
}

export interface PerformanceInput {
  date: string;
  saleType: string;
  paymentType: string;
  /** Dollars as typed; the API stores cents. */
  amount: string;
  note?: string;
}

export const performance = {
  options: () => request<PerformanceOptions>("/api/performance/options"),
  report: (from: string, to: string) =>
    request<PerformanceReport>(`/api/performance?from=${from}&to=${to}`),
  add: (data: PerformanceInput) =>
    request<PerformanceEntry>("/api/performance", { method: "POST", ...body(data) }),
  remove: (id: string) =>
    request<{ ok: true }>(`/api/performance/${id}`, { method: "DELETE" }),
};

/* ------------------------ register sales (Clover) ------------------------ */

/** Where the automatic register-sale sync has got to. */
export interface CloverSyncStatus {
  connected: boolean;
  /** When the background pass last ran. Null means it has never run. */
  lastPolledAt: string | null;
  intervalSeconds: number;
  importedTotal: number;
}

/** What one manual sync pass saw. */
export interface CloverSyncReport {
  connected: boolean;
  since: string;
  hours: number;
  /** Orders Clover returned for the window. */
  scanned: number;
  imported: { order: string; matched: number; reviewed: boolean }[];
  /** Sales the register has since refunded — their serials went back on the shelf. */
  refunded: { order: string; restored: number }[];
  /** Orders passed over, each with the reason — the useful half when nothing lands. */
  skipped: { order: string; reason: string }[];
}

export const merchant = {

  syncStatus: () => request<CloverSyncStatus>("/api/clover/sync"),
  /** Pull register sales in now, looking back `hours` (default 24, max 168). */
  syncNow: (hours = 24) =>
    request<CloverSyncReport>("/api/clover/sync", { method: "POST", ...body({ hours }) }),
};

/* ----------------------------- sharing ----------------------------- */

/** Which fields can be shared, as the server defines them. */
export type ShareCatalogue = Record<
  string,
  { label: string; fields: Record<string, string> }
>;

/** Ticked fields, grouped: { inventory: { salePrice: true }, … } */
export type SharePermissions = Record<string, Record<string, boolean>>;

export interface Share {
  id: string;
  ownerStoreId: string;
  viewerStoreId: string;
  permissions: SharePermissions;
  createdAt: string;
  updatedAt: string;
  viewerStore?: { id: string; name: string };
  ownerStore?: { id: string; name: string; phone?: string | null; website?: string | null };
}

/** A store that has shared something with us, and what they opened up. */
export interface ReceivedShare {
  store: { id: string; name: string; phone?: string | null; website?: string | null };
  permissions: SharePermissions;
}

/** Rows come back with only the granted fields present — the rest are absent. */
export type SharedRow = Record<string, unknown> & { id: string };

export const sharing = {
  catalogue: () => request<ShareCatalogue>("/api/sharing/catalogue"),
  list: () => request<{ outgoing: Share[]; incoming: Share[] }>("/api/sharing"),
  /** Find a store by a staff email. 404 when there's no match. */
  lookup: (email: string) =>
    request<{
      store: { id: string; name: string };
      existing: { id: string; permissions: SharePermissions } | null;
    }>("/api/sharing/lookup", { method: "POST", ...body({ email }) }),
  save: (storeId: string, permissions: SharePermissions) =>
    request<Share>("/api/sharing", { method: "PUT", ...body({ storeId, permissions }) }),
  revoke: (id: string) => request<{ ok: true }>(`/api/sharing/${id}`, { method: "DELETE" }),

  received: () => request<ReceivedShare[]>("/api/sharing/received"),
  inventory: (storeId: string, q?: string) =>
    request<SharedRow[]>(
      `/api/sharing/${storeId}/inventory${q ? `?q=${encodeURIComponent(q)}` : ""}`
    ),
  customers: (storeId: string) => request<SharedRow[]>(`/api/sharing/${storeId}/customers`),
  service: (storeId: string) => request<SharedRow[]>(`/api/sharing/${storeId}/service`),
};

/* ------------------------------ master ------------------------------ */

export interface MasterStore extends Store {
  _count?: {
    users: number;
    products: number;
    customers: number;
    tickets: number;
    sales: number;
  };
}

export interface StoreCounts {
  users: number;
  products: number;
  customers: number;
  tickets: number;
  openTickets: number;
  sales: number;
}

export interface MasterProduct {
  id: string;
  name: string;
  sku: string;
  brand: string | null;
  category: string | null;
  vendor: string | null;
  costCents: number;
  salePriceCents: number;
  active: boolean;
  quantity: number;
  inStockSerials: number;
}

export interface MasterCustomer {
  id: string;
  firstName: string;
  lastName?: string | null;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  createdAt: string;
  _count?: { sales: number; tickets: number };
}

export interface MasterTicket {
  id: string;
  number: number;
  status: string;
  deviceMake?: string | null;
  deviceModel?: string | null;
  deviceImei?: string | null;
  issue: string;
  estimateCents: number;
  labourCents: number;
  createdAt: string;
  completedAt?: string | null;
  customer?: { firstName: string; lastName?: string | null; phone?: string | null } | null;
  technician?: { name: string } | null;
}

/**
 * System administration. Every read here is look-only — there are no update or
 * delete endpoints for a store's records, by design.
 */
export const master = {
  stores: () => request<MasterStore[]>("/api/master/stores"),
  store: (id: string) => request<{ store: Store; counts: StoreCounts }>(`/api/master/stores/${id}`),
  createStore: (data: { name: string; ownerName: string; ownerEmail: string; password: string }) =>
    request<{ store: Store; owner: User }>("/api/master/stores", { method: "POST", ...body(data) }),
  updateStore: (id: string, data: { name?: string; active?: boolean }) =>
    request<Store>(`/api/master/stores/${id}`, { method: "PATCH", ...body(data) }),

  inventory: (id: string, q?: string) =>
    request<MasterProduct[]>(
      `/api/master/stores/${id}/inventory${q ? `?q=${encodeURIComponent(q)}` : ""}`
    ),
  customers: (id: string, q?: string) =>
    request<MasterCustomer[]>(
      `/api/master/stores/${id}/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`
    ),
  tickets: (id: string, q?: string) =>
    request<MasterTicket[]>(
      `/api/master/stores/${id}/tickets${q ? `?q=${encodeURIComponent(q)}` : ""}`
    ),

  users: (id: string) => request<User[]>(`/api/master/stores/${id}/users`),
  createUser: (id: string, data: { name: string; email: string; password: string; role: Role }) =>
    request<User>(`/api/master/stores/${id}/users`, { method: "POST", ...body(data) }),
  updateUser: (userId: string, data: { active?: boolean; role?: Role; password?: string }) =>
    request<User>(`/api/master/users/${userId}`, { method: "PATCH", ...body(data) }),
};

/* ------------------------------ tools ------------------------------ */

/** What the bundled TAC database knows about the device. */
export interface ImeiDevice {
  brand: string | null;
  model: string | null;
  details: string | null;
  year: number | null;
  /** The network this variant was built for — not whether it's locked now. */
  carrierVariant: string | null;
  region: string | null;
  dualSim: boolean | null;
}

export interface ImeiInsights {
  carrier: { variant: string | null; region: string | null; dualSim: boolean | null } | null;
  warranty: {
    /** Our own warranty, when this is a unit we sold. */
    ours: {
      months: number;
      from: string;
      expires: string;
      expired: boolean;
      basis: string;
    } | null;
    manufacturer: { verdict: "expired" | "possible" | "unknown"; note: string };
  };
}

/** What we already know about this handset from our own books. */
export interface ImeiRecords {
  unit: {
    id: string;
    serial: string;
    status: string;
    condition: string;
    storage: string | null;
    color: string | null;
    warrantyMonths: number;
    stockedAt: string;
    updatedAt: string;
    product: { id: string; name: string; sku: string } | null;
    location: string | null;
    vendor: string | null;
  } | null;
  tickets: {
    id: string;
    number: number;
    status: string;
    issue: string;
    warranty: boolean;
    at: string;
    completedAt: string | null;
    customer: string | null;
  }[];
}

export interface ImeiCheck {
  input: string;
  imei: string;
  length: number;
  kind: string | null;
  valid: boolean | null;
  checkDigit: number | null;
  expectedCheckDigit: number | null;
  tac: string | null;
  serialNumber: string | null;
  softwareVersion: string | null;
  reportingBodyCode: string | null;
  reportingBody: string | null;
  full: string | null;
  device: ImeiDevice | null;
  insights: ImeiInsights;
  records: ImeiRecords;
}

export const tools = {
  /** How many devices the bundled TAC database knows about. */
  imeiConfig: () => request<{ tacEntries: number }>("/api/tools/imei/config"),
  checkImei: (imei: string) =>
    request<ImeiCheck>("/api/tools/imei", { method: "POST", ...body({ imei }) }),
};

export const service = {
  list: (params: { q?: string; status?: string; customerId?: string } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v) as [string, string][]
    ).toString();
    return request<Service[]>(`/api/service${qs ? `?${qs}` : ""}`);
  },
  get: (id: string) => request<Service>(`/api/service/${id}`),
  create: (data: Record<string, unknown>) => request<Service>("/api/service", { method: "POST", ...body(data) }),
  update: (id: string, data: Record<string, unknown>) => request<Service>(`/api/service/${id}`, { method: "PATCH", ...body(data) }),
  remove: (id: string) => request<{ ok: true }>(`/api/service/${id}`, { method: "DELETE" }),
  addLine: (id: string, data: Record<string, unknown>) => request<ServiceLine>(`/api/service/${id}/lines`, { method: "POST", ...body(data) }),
  updateLine: (lineId: string, data: Record<string, unknown>) => request<ServiceLine>(`/api/service/lines/${lineId}`, { method: "PATCH", ...body(data) }),
  removeLine: (lineId: string) => request<{ ok: true }>(`/api/service/lines/${lineId}`, { method: "DELETE" }),
};