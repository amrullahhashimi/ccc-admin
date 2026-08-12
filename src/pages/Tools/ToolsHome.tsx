import { Link } from "react-router";

type Tile = {
  name: string;
  path: string;
  icon: React.ReactNode;
};

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const PhoneIcon = (
  <svg viewBox="0 0 24 24" {...stroke}>
    <rect x="6" y="2" width="12" height="20" rx="2" />
    <path d="M10 18h4" />
    <path d="M9 6h6" />
  </svg>
);

const tiles: Tile[] = [{ name: "IMEI Checker", path: "/tools/imei", icon: PhoneIcon }];

export default function ToolsHome() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Tools</h1>

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
