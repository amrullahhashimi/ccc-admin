import { Link, useLocation } from "react-router";

/* The label for each path segment. Anything missing here is a record id, which
   we can't name from the URL alone — those read as "Details". */
const LABEL: Record<string, string> = {
  inventory: "Inventory",
  vendors: "Vendors",
  categories: "Categories",
  brands: "Brands",
  search: "Item search",
  archive: "Archive",
  items: "Items",
  customers: "Customers",
  service: "Service",
  orders: "Orders",
  sales: "Sales",
  tools: "Tools",
  imei: "IMEI check",
  performance: "Performance",
  cash: "Cash counter",
  store: "Store",
  sharing: "Sharing",
  master: "Stores",
  settings: "Settings",
  new: "New",
  sourcing: "Vendor pricing",
  import: "Import message",
  comparison: "Price comparison",
  overview: "Overview",
  history: "Import history",
  products: "Products",
};

/* Only these are real destinations. A segment that isn't one — "items" in
   /inventory/items/123, say — stays plain text rather than a dead link. */
const ROUTES = new Set([
  "/inventory",
  "/inventory/vendors",
  "/inventory/categories",
  "/inventory/brands",
  "/inventory/new",
  "/inventory/search",
  "/inventory/archive",
  "/customers",
  "/service",
  "/service/orders",
  "/service/new",
  "/sales",
  "/sales/new",
  "/tools",
  "/tools/imei",
  "/tools/performance",
  "/tools/cash",
  "/store",
  "/store/sharing",
  "/master",
  "/settings",
  "/sourcing",
  "/sourcing/overview",
  "/sourcing/import",
  "/sourcing/comparison",
  "/sourcing/history",
]);

/* A crumb that isn't a page of its own but has an obvious home: "Items", in
   /inventory/items/123, belongs to the item search. */
const ALIAS: Record<string, string> = {
  "/inventory/items": "/inventory/search",
  // A sourcing product belongs to the comparison it was reached from.
  "/sourcing/products": "/sourcing/comparison",
};

const linkClass = "text-gray-500 hover:text-brand-500 dark:text-gray-400";

export default function HeaderBreadcrumb() {
  const { pathname } = useLocation();
  const segments = pathname.split("/").filter(Boolean);

  const crumbs = segments.map((segment, i) => {
    const path = `/${segments.slice(0, i + 1).join("/")}`;
    const to = ALIAS[path] ?? path;
    return { label: LABEL[segment] ?? "Details", to: ROUTES.has(to) ? to : null };
  });

  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        <li className="shrink-0">
          {crumbs.length === 0 ? (
            <span className="font-medium text-gray-800 dark:text-white/90">Home</span>
          ) : (
            <Link to="/" className={linkClass}>
              Home
            </Link>
          )}
        </li>
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 text-gray-300 dark:text-gray-600">/</span>
              {last || !crumb.to ? (
                <span
                  className={`truncate ${
                    last ? "font-medium text-gray-800 dark:text-white/90" : "text-gray-500 dark:text-gray-400"
                  }`}
                  aria-current={last ? "page" : undefined}
                >
                  {crumb.label}
                </span>
              ) : (
                <Link to={crumb.to} className={`truncate ${linkClass}`}>
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
