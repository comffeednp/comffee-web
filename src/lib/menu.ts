import { getSupabaseServer } from "@/lib/supabase/server";
import type { MenuCategory, MenuItem } from "@/lib/supabase/types";

export interface MenuByCategory {
  category: MenuCategory;
  items: MenuItem[];
}

export async function getMenu(): Promise<MenuByCategory[]> {
  try {
    const supabase = await getSupabaseServer();
    const [catsRes, itemsRes] = await Promise.all([
      supabase
        .from("menu_categories")
        .select("*")
        .order("sort_order", { ascending: true }),
      supabase
        .from("menu_items")
        .select("*")
        .eq("available", true)
        .order("sort_order", { ascending: true }),
    ]);
    const cats = (catsRes.data ?? []) as MenuCategory[];
    const items = (itemsRes.data ?? []) as MenuItem[];
    return cats.map((c) => ({
      category: c,
      items: items.filter((i) => i.category_id === c.id),
    }));
  } catch {
    return [];
  }
}
