import { getPublishedBranches } from "@/lib/branches";
import BranchCard from "@/components/site/BranchCard";
import BranchSplitHero from "@/components/site/BranchSplitHero";
import HeroParallax from "@/components/site/HeroParallax";
import Reveal from "@/components/site/Reveal";
import type { Metadata } from "next";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Branches",
  description: "Every Comffee internet cafe and Playcation stay across the Philippines.",
};

interface PageProps {
  searchParams: Promise<{ type?: string }>;
}

export default async function BranchesPage({ searchParams }: PageProps) {
  const { type } = await searchParams;
  const branches = await getPublishedBranches();

  const cafes = branches.filter((b) => b.type === "cafe");
  const plays = branches.filter((b) => b.type === "playcation");

  const filtered =
    type === "cafe" || type === "playcation"
      ? branches.filter((b) => b.type === type)
      : branches;

  const heroBranches = filtered.length > 0 ? filtered : branches;
  const heroSrc = branches[0]?.hero_image_url ?? null;

  return (
    <>
      {/* ============================================================
          HERO — full-bleed photo + title + filter chips
          ============================================================ */}
      <HeroParallax src={heroSrc} alt="Comffee Branches" height="medium">
        <div className="max-w-4xl">
          <p className="terminal-label">/branches</p>
          <h1 className="mt-4 font-display text-5xl md:text-7xl lg:text-8xl font-bold leading-[0.9] tracking-tight text-cream max-w-4xl">
            Every Comffee location.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-cream-dim">
            {cafes.length} internet {cafes.length === 1 ? "cafe" : "cafes"} and {plays.length} Playcation {plays.length === 1 ? "stay" : "stays"}.
            Each one with its own personality, hardware, and coffee blend.
          </p>

          {/* Filter chips */}
          <div className="mt-8 flex items-center gap-2 flex-wrap">
            <FilterChip href="/branches" active={!type}>All</FilterChip>
            <FilterChip href="/branches?type=cafe" active={type === "cafe"}>Internet Cafes</FilterChip>
            <FilterChip href="/branches?type=playcation" active={type === "playcation"}>Playcation</FilterChip>
          </div>
        </div>
      </HeroParallax>

      {/* ============================================================
          SPLIT-PANEL PHOTO SHOWCASE
          ============================================================ */}
      <section className="border-b border-line">
        <BranchSplitHero branches={heroBranches} height="58svh" />
      </section>

      {/* ============================================================
          BRANCH CARDS GRID
          ============================================================ */}
      <section className="container-edge py-20">
        {filtered.length === 0 ? (
          <p className="text-cream-dim font-mono">// no branches in this category yet</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((b, i) => (
              <Reveal key={b.id} delay={i * 0.05}>
                <BranchCard branch={b} />
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={`font-mono text-[0.7rem] uppercase tracking-[0.18em] px-4 py-2 rounded-md border transition ${
        active
          ? "bg-amber text-bg border-amber"
          : "border-line-bright text-cream-dim hover:text-amber hover:border-amber/60"
      }`}
    >
      {children}
    </a>
  );
}
