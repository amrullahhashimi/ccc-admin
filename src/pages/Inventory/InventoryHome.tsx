import { Link } from "react-router";

type Tile = {
  name: string;
  path: string;
  icon: React.ReactNode;
};

/* --------------------------------- icons --------------------------------- */
/* Inline so there's nothing else to install. */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const SearchIcon = (
  <svg viewBox="0 0 24 24" {...stroke}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

const PlusIcon = (
  <svg viewBox="0 0 24 24" {...stroke}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const VendorIcon = (
  <svg viewBox="0 0 24 24" {...stroke}>
    <path d="M3 9l1.5-4h15L21 9" />
    <path d="M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9z" />
    <path d="M9 13h6" />
  </svg>
);

const CategoryIcon = (
  <svg viewBox="0 0 24 24" {...stroke}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

const BrandIcon = (
  <svg viewBox="0 0 24 24" {...stroke}>
    <path d="M12 3l2.4 5.5 6 .5-4.5 3.9 1.4 5.9L12 15.7 6.7 18.8l1.4-5.9L3.6 9l6-.5L12 3z" />
  </svg>
);

/* --------------------------------- tiles --------------------------------- */

const tiles: Tile[] = [
  { name: "Item Search", path: "/inventory/search", icon: SearchIcon },
  { name: "New Item", path: "/inventory/new", icon: PlusIcon },
  { name: "Vendors", path: "/inventory/vendors", icon: VendorIcon },
  { name: "Categories", path: "/inventory/categories", icon: CategoryIcon },
  { name: "Brands", path: "/inventory/brands", icon: BrandIcon },
];

/* ---------------------------------- page ---------------------------------- */

export default function InventoryHome() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Inventory</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
        {tiles.map((tile) => (
          <Link
            key={tile.name}
            to={tile.path}
            className="group flex aspect-square flex-col items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white p-4 transition hover:border-brand-500 hover:shadow-theme-md dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-brand-500"
          >
            <span className="h-10 w-10 text-gray-700 transition group-hover:text-brand-500 dark:text-gray-300">
              {tile.icon}
            </span>
            <span className="text-center text-sm font-medium text-gray-700 dark:text-gray-300">
              {tile.name}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}