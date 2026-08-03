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

const CheckIcon = (
  <svg viewBox="0 0 24 24" {...stroke}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

/* --------------------------------- tiles --------------------------------- */

const tiles: Tile[] = [
  { name: "Services", path: "/service/orders", icon: SearchIcon },
  { name: "New Service", path: "/service/new", icon: PlusIcon },
  { name: "Finished", path: "/service/orders?status=COLLECTED", icon: CheckIcon },
];

/* ---------------------------------- page ---------------------------------- */

export default function ServiceHome() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Service</h1>

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