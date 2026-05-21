import { getMenu } from "@/lib/menu";
import MenuItemCard from "@/components/site/MenuItemCard";
import Reveal from "@/components/site/Reveal";
import type { Metadata } from "next";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Menu",
  description: "Lattes, mocktails, rice meals, and snacks at every Comffee branch.",
};

export default async function MenuPage() {
  const menu = await getMenu();

  return (
    <>
      <section className="relative py-20 md:py-28 border-b border-line bg-bg-soft overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
        <div className="container-edge relative">
          <p className="terminal-label">/menu</p>
          <h1 className="mt-4 font-display text-5xl md:text-7xl lg:text-8xl font-bold leading-[0.9] tracking-tight text-cream">
            The menu.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-cream-dim">
            Iced and hot lattes, mocktails, rice meals, and snacks. Available at all branches — Matcha Espresso at cafe locations only.
          </p>
        </div>
      </section>

      {/* Menu board photos */}
      <section className="container-edge py-20 md:py-24">
        <Reveal>
          <p className="terminal-label">menu_boards</p>
          <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tight text-cream">
            The boards.
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { src: "https://uioeefxnugnqhvthaxjf.supabase.co/storage/v1/object/public/branch-photos/menu/drink-menu.png", alt: "Drinks menu" },
            { src: "https://uioeefxnugnqhvthaxjf.supabase.co/storage/v1/object/public/branch-photos/menu/barista-faves.jpg", alt: "Barista Faves" },
            { src: "https://uioeefxnugnqhvthaxjf.supabase.co/storage/v1/object/public/branch-photos/menu/food-menu.png", alt: "Food menu" },
          ].map((m, i) => (
            <Reveal key={m.alt} delay={i * 0.06}>
              <div className="overflow-hidden rounded-xl border border-line-bright bg-bg-card">
                <img src={m.src} alt={m.alt} className="w-full h-auto object-contain" />
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="container-edge pb-20 md:pb-28">
        {menu.length === 0 && (
          <p className="text-cream-dim font-mono">// menu loading… check back soon</p>
        )}
        <div className="space-y-20">
          {menu.map((group, gi) => (
            <div key={group.category.id}>
              <Reveal>
                <div className="flex items-end justify-between gap-6 mb-10">
                  <div>
                    <p className="terminal-label">menu.{group.category.slug}</p>
                    <h2 className="mt-3 font-display text-3xl md:text-5xl font-bold tracking-tight text-cream">
                      {group.category.name}
                    </h2>
                  </div>
                  <span className="font-mono text-[0.7rem] uppercase tracking-widest text-mocha">
                    {String(group.items.length).padStart(2, "0")} items
                  </span>
                </div>
              </Reveal>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item, i) => (
                  <Reveal key={item.id} delay={i * 0.03 + gi * 0.05}>
                    <MenuItemCard item={item} />
                  </Reveal>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
