import { requireFullAdmin } from "@/lib/auth/require-admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  addCategoryAction,
  deleteCategoryAction,
  addItemAction,
  deleteItemAction,
  toggleItemAvailableAction,
} from "../_actions/menu";
import type { MenuCategory, MenuItem } from "@/lib/supabase/types";
import { Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { formatPHP } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminMenuPage() {
  await requireFullAdmin();
  const supabase = await getSupabaseServer();
  const [catsRes, itemsRes] = await Promise.all([
    supabase.from("menu_categories").select("*").order("sort_order"),
    supabase.from("menu_items").select("*").order("sort_order"),
  ]);
  const cats = (catsRes.data ?? []) as MenuCategory[];
  const items = (itemsRes.data ?? []) as MenuItem[];

  return (
    <section className="container-edge py-12 max-w-5xl">
      <p className="terminal-label">/menu</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">Menu</h1>
      <p className="mt-2 text-sm text-cream-dim">
        Manage menu categories and items. Items shown here are global and available at every branch unless you mark them unavailable.
      </p>

      {/* Add category */}
      <div className="mt-10 p-5 border border-line-bright rounded-xl bg-bg-card">
        <p className="terminal-label">add_category</p>
        <form action={addCategoryAction} className="mt-3 grid gap-3 md:grid-cols-[2fr_1fr_auto]">
          <input name="name" required placeholder="Category name *" className="admin-input" />
          <input name="sort_order" type="number" placeholder="order" defaultValue={cats.length} className="admin-input" />
          <button type="submit" title="Add this menu category" className="key-cap !py-2 !px-3">
            <Plus className="h-4 w-4" />
            Add
          </button>
        </form>
      </div>

      {/* Categories + items */}
      <div className="mt-10 space-y-10">
        {cats.map((c) => {
          const catItems = items.filter((i) => i.category_id === c.id);
          return (
            <div key={c.id} className="border border-line-bright rounded-xl bg-bg-card overflow-hidden">
              <div className="px-5 py-4 bg-bg-soft border-b border-line flex items-center justify-between">
                <div>
                  <h2 className="font-display text-xl font-bold text-cream">{c.name}</h2>
                  <p className="font-mono text-[0.65rem] text-mocha mt-0.5">/{c.slug}</p>
                </div>
                <form action={deleteCategoryAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="text-red-400 hover:text-red-300 p-2" aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </form>
              </div>

              <ul className="divide-y divide-line">
                {catItems.map((item) => (
                  <li key={item.id} className="px-5 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-cream font-medium">{item.name}</div>
                      {item.description && (
                        <div className="text-xs text-cream-dim truncate">{item.description}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-amber font-semibold whitespace-nowrap">
                        {formatPHP(item.base_price_php)}
                      </span>
                      <form action={toggleItemAvailableAction}>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="next" value={item.available ? "false" : "true"} />
                        <button
                          className={`p-2 ${item.available ? "text-phosphor" : "text-mocha"}`}
                          aria-label={item.available ? "Hide" : "Show"}
                          title={item.available ? "Available — click to hide" : "Hidden — click to show"}
                        >
                          {item.available ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </button>
                      </form>
                      <form action={deleteItemAction}>
                        <input type="hidden" name="id" value={item.id} />
                        <button className="text-red-400 hover:text-red-300 p-2" aria-label="Delete">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
                {catItems.length === 0 && (
                  <li className="px-5 py-4 font-mono text-xs text-mocha">// no items in this category</li>
                )}
              </ul>

              <form action={addItemAction} className="px-5 py-4 border-t border-line bg-bg/40 grid gap-3 md:grid-cols-[2fr_1fr_3fr_auto]">
                <input type="hidden" name="category_id" value={c.id} />
                <input name="name" required placeholder="Item name *" className="admin-input" />
                <input name="base_price_php" type="number" step="0.01" required placeholder="Price *" className="admin-input" />
                <input name="description" placeholder="Description (optional)" className="admin-input" />
                <button type="submit" title="Add this item to the category" className="key-cap !py-2 !px-3">
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </form>
            </div>
          );
        })}
        {cats.length === 0 && (
          <p className="font-mono text-sm text-mocha">// add a category above to get started</p>
        )}
      </div>

      <style>{`
        .admin-input {
          width: 100%;
          background: var(--color-bg);
          border: 1px solid var(--color-line-bright);
          border-radius: 0.5rem;
          padding: 0.625rem 0.875rem;
          color: var(--color-cream);
          font-family: var(--font-sans);
          font-size: 0.9rem;
        }
        .admin-input:focus {
          outline: none;
          border-color: var(--color-amber);
          box-shadow: 0 0 0 1px rgba(255,181,71,0.4);
        }
      `}</style>
    </section>
  );
}
