import { useCallback, useEffect, useState } from "react";
import { categories as categoriesApi, type Category } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useNotify } from "../../components/ui/notify";

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800";

const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

/* -------------------------------- the form -------------------------------- */

function CategoryForm({
  category,
  parents,
  onCancel,
  onSaved,
}: {
  category: Category | null; // null = adding a new one
  parents: Category[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [parentId, setParentId] = useState(category?.parentId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // A category that already has sub-categories can't be moved under another.
  const hasChildren = !!category?.children?.length;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Category name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = { name: name.trim(), parentId: parentId || null };
      if (category) await categoriesApi.update(category.id, payload);
      else await categoriesApi.create(payload);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={onCancel}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
          aria-label="Back to categories"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
          {category ? category.name : "New category"}
        </h1>
      </div>

      <form
        onSubmit={save}
        className="max-w-xl space-y-5 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <div>
          <label className={labelClass}>
            Name <span className="text-error-500">*</span>
          </label>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <label className={labelClass}>Sits under</label>
          <select
            className={inputClass}
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            disabled={hasChildren}
          >
            <option value="">Nothing — this is a top-level category</option>
            {parents
              .filter((p) => p.id !== category?.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-500">
            {hasChildren
              ? "This one already has sub-categories, so it has to stay top-level."
              : "Sub-categories go one level deep — a sub-category can't have its own."}
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/15">
            {error}
          </p>
        )}

        <div className="flex gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {saving ? "Saving…" : category ? "Save changes" : "Add category"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* -------------------------------- the list -------------------------------- */

export default function CategoriesPage() {
  const { can } = useAuth();
  const notify = useNotify();
  const [tree, setTree] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [view, setView] = useState<
    { mode: "list" } | { mode: "form"; category: Category | null }
  >({ mode: "list" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setTree(await categoriesApi.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load categories.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (view.mode === "list") load();
  }, [load, view.mode]);

  const remove = async (category: Category) => {
    const ok = await notify.confirm({
      title: `Remove ${category.name}?`,
      message: "The category is taken off the list.",
      confirmText: "Remove",
      variant: "error",
    });
    if (!ok) return;
    try {
      const res = await categoriesApi.remove(category.id);
      if (res.message) notify.info(res.message);
      else notify.success(`${category.name} removed.`);
      load();
    } catch (err) {
      notify.error("Could not remove.", {
        message: err instanceof Error ? err.message : undefined,
      });
    }
  };

  if (view.mode === "form") {
    return (
      <CategoryForm
        category={view.category}
        parents={tree}
        onCancel={() => setView({ mode: "list" })}
        onSaved={() => setView({ mode: "list" })}
      />
    );
  }

  const totalCategories = tree.reduce((sum, p) => sum + 1 + (p.children?.length ?? 0), 0);

  const RemoveButton = ({ category }: { category: Category }) =>
    can("OWNER", "MANAGER") ? (
      <button
        onClick={(e) => {
          e.stopPropagation();
          remove(category);
        }}
        className="text-xs font-medium text-gray-400 hover:text-error-500"
      >
        Remove
      </button>
    ) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Categories</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {totalCategories} {totalCategories === 1 ? "category" : "categories"}
          </p>
        </div>
        <button
          onClick={() => setView({ mode: "form", category: null })}
          className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          New category
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        {loading ? (
          <p className="p-10 text-center text-sm text-gray-500">Loading…</p>
        ) : error ? (
          <p className="p-10 text-center text-sm text-error-500">{error}</p>
        ) : tree.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-medium text-gray-800 dark:text-white/90">No categories yet</p>
            <p className="mt-1 text-sm text-gray-500">
              Add a top-level category like Phones, then sub-categories underneath it.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 dark:border-gray-800">
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3 text-right">Items</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {tree.map((parent) => (
                  <>
                    <tr
                      key={parent.id}
                      onClick={() => setView({ mode: "form", category: parent })}
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                    >
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-gray-800 dark:text-white/90">{parent.name}</p>
                        {!!parent.children?.length && (
                          <p className="mt-0.5 text-xs text-gray-500">
                            {parent.children.length} sub-{parent.children.length === 1 ? "category" : "categories"}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right text-sm tabular-nums">
                        <span className="font-medium text-gray-800 dark:text-white/90">
                          {parent.totalItems}
                        </span>
                        {parent.totalItems !== parent.ownItems && (
                          <span className="ml-1 text-xs text-gray-500">
                            ({parent.ownItems} direct)
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <RemoveButton category={parent} />
                      </td>
                    </tr>

                    {parent.children?.map((child) => (
                      <tr
                        key={child.id}
                        onClick={() => setView({ mode: "form", category: child })}
                        className="cursor-pointer bg-gray-50/50 hover:bg-gray-50 dark:bg-white/[0.01] dark:hover:bg-white/[0.03]"
                      >
                        <td className="px-5 py-3 pl-10">
                          <span className="mr-2 text-gray-300 dark:text-gray-700">└</span>
                          <span className="text-sm text-gray-700 dark:text-gray-300">{child.name}</span>
                        </td>
                        <td className="px-5 py-3 text-right text-sm tabular-nums text-gray-600 dark:text-gray-400">
                          {child.ownItems}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <RemoveButton category={child} />
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}