import { formatPHP } from "@/lib/utils";
import type { MenuItem } from "@/lib/supabase/types";
import AddToCartButton from "@/components/cart/AddToCartButton";

export default function MenuItemCard({ item }: { item: MenuItem }) {
  return (
    <div className="group relative p-5 border border-line-bright rounded-lg bg-bg-card hover:border-amber/40 transition">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h4 className="text-base font-semibold text-cream group-hover:text-amber transition-colors">
            {item.name}
          </h4>
          {item.description && (
            <p className="mt-1 text-xs text-cream-dim leading-relaxed">{item.description}</p>
          )}
        </div>
        <span className="font-mono text-sm font-semibold text-amber whitespace-nowrap">
          {formatPHP(item.base_price_php)}
        </span>
      </div>
      <div className="mt-4 flex justify-end">
        <AddToCartButton
          item={{
            menuItemId: item.id,
            name: item.name,
            price: Number(item.base_price_php),
          }}
        />
      </div>
    </div>
  );
}
