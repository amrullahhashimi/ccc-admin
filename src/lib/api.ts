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
  labelCostCents?: number | null;
  note?: string | null;
  vendorId?: string | null;
  vendor?: { id: string; name: string } | null;
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
}

export const products = {
  list: (filters: ProductFilters = {}) => {
    const p = new URLSearchParams();
    if (filters.q) p.set("q", filters.q);
    if (filters.location) p.set("location", filters.location);
    if (filters.condition) p.set("condition", filters.condition);
    if (filters.lowStock) p.set("lowStock", "1");
    const qs = p.toString();
    return request<Product[]>("/api/products" + (qs ? `?${qs}` : ""));
  },
  get: (id: string) => request<Product>(`/api/products/${id}`),
  // Money goes out as dollars (cost, onlinePrice, salePrice); the API stores cents.
  create: (data: Record<string, unknown> & { units?: UnitInput[] }) =>
    request<Product>("/api/products", { method: "POST", ...body(data) }),
  update: (id: string, data: Record<string, unknown>) =>
    request<Product>(`/api/products/${id}`, { method: "PATCH", ...body(data) }),
  archive: (id: string) => request<{ ok: true }>(`/api/products/${id}`, { method: "DELETE" }),

  addUnits: (productId: string, units: UnitInput[]) =>
    request<ProductUnit[]>(`/api/products/${productId}/units`, { method: "POST", ...body({ units }) }),
  updateUnit: (unitId: string, data: Partial<UnitInput> & { status?: string }) =>
    request<ProductUnit>(`/api/products/units/${unitId}`, { method: "PATCH", ...body(data) }),
  removeUnit: (unitId: string) =>
    request<{ ok: true }>(`/api/products/units/${unitId}`, { method: "DELETE" }),
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