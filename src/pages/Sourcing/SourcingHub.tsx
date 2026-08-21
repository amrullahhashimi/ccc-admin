import { Link } from "react-router";

type Tile = {
  name: string;
  path: string;
  icon: React.ReactNode;
};

/* --------------------------------- icons --------------------------------- */
/* Inline, the same way the Inventory tiles are, so there's nothing to install. */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const OverviewIcon = (
  <svg viewBox="0 0 24 24" {...stroke}>
    <path d="M3 3v18h18" />
    <path d="M7 14l4-4 3 3 5-6" />
  </svg>
);

const ImportIcon = (
  <svg viewBox="0 0 24 24" {...stroke}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M12 3v12" />
    <path d="M8 11l4 4 4-4" />
  </svg>
);

const CompareIcon = (
  <svg viewBox="0 0 24 24" {...stroke}>
    <path d="M3 6h13" />
    <path d="M3 12h9" />
    <path d="M3 18h11" />
    <path d="m18 9 3 3-3 3" />
  </svg>
);

const HistoryIcon = (
  <svg viewBox="0 0 24 24" {...stroke}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
    <path d="M12 8v4l3 2" />
  </svg>
);

/* --------------------------------- tiles --------------------------------- */

const tiles: Tile[] = [
  { name: "Overview", path: "/sourcing/overview", icon: OverviewIcon },
  { name: "Import message", path: "/sourcing/import", icon: ImportIcon },
  { name: "Price comparison", path: "/sourcing/comparison", icon: CompareIcon },
  { name: "Import history", path: "/sourcing/history", icon: HistoryIcon },
];

/* ---------------------------------- page ---------------------------------- */

/**
 * The way in to vendor pricing, laid out the same way Inventory is.
 *
 * The sidebar carries one item rather than a menu that unfolds: the four jobs
 * are here, in the order they are usually done, and each is one click from the
 * shop's front door.
 */
export default function SourcingHub() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6">
        {tiles.map((tile) => (
          <Link
            key={tile.name}
            to={tile.path}
            className="group flex aspect-square flex-col items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white p-4 transition hover:border-brand-500 hover:shadow-theme-md dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-brand-500"
          >
            <span className="h-10 w-10 text-gray-700 transition group-hover:text-brand-500 dark:text-gray-300">
              {tile.icon}
            </span>
            <span className="text-center text-sm font-medium text-gray-700 dark:text-gray-300">{tile.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
