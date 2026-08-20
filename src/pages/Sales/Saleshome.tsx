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

const PlusIcon = (
  <svg viewBox="0 0 24 24" {...stroke}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const ReceiptIcon = (
  <svg viewBox="0 0 24 24" {...stroke}>
    <path d="M5 3v18l2-1.5L9 21l2-1.5L13 21l2-1.5L17 21l2-1.5V3l-2 1.5L15 3l-2 1.5L11 3 9 4.5 7 3 5 4.5z" />
    <path d="M8 8h8M8 12h8" />
  </svg>
);

const UnpaidIcon = (
  <svg viewBox="0 0 24 24" {...stroke}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

/* --------------------------------- tiles --------------------------------- */

const tiles: Tile[] = [
  { name: "New Sale", path: "/sales/new", icon: PlusIcon },
  { name: "All Sales", path: "/sales/orders", icon: ReceiptIcon },
  { name: "Unpaid", path: "/sales/orders?status=OPEN", icon: UnpaidIcon },
];

/* ---------------------------------- page ---------------------------------- */

export default function SalesHome() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
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