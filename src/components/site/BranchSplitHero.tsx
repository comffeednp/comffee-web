"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { MapPin, ArrowUpRight } from "lucide-react";
import type { Branch } from "@/lib/supabase/types";

interface Props {
  branches: Branch[];
  /** Height of the panel strip */
  height?: string;
}

export default function BranchSplitHero({
  branches,
  height = "65svh",
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);

  if (branches.length === 0) return null;

  return (
    <div
      className="flex flex-col sm:flex-row w-full overflow-hidden"
      style={{ height, minHeight: 320 }}
    >
      {branches.map((b) => {
        const isActive = activeId === b.id;
        const hasActive = activeId !== null;
        const href =
          b.type === "playcation"
            ? `/playcation/${b.slug}`
            : `/branches/${b.slug}`;

        return (
          <Link
            key={b.id}
            href={href}
            onMouseEnter={() => setActiveId(b.id)}
            onMouseLeave={() => setActiveId(null)}
            className="relative overflow-hidden group block border-b sm:border-b-0 sm:border-r border-line/30 last:border-0"
            style={{
              flex: isActive
                ? "2.5 2.5 0%"
                : hasActive
                ? "0.6 0.6 0%"
                : "1 1 0%",
              transition: "flex 480ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
              minHeight: 180,
            }}
          >
            {/* Photo */}
            {b.hero_image_url ? (
              <Image
                src={b.hero_image_url}
                alt={b.name}
                fill
                sizes="(max-width: 640px) 100vw, 50vw"
                className="object-cover scale-[1.06] group-hover:scale-100 transition-transform duration-700 ease-out"
                priority
              />
            ) : (
              <div className="absolute inset-0 bg-bg-soft bg-grid" />
            )}

            {/* Gradient — stronger at bottom for legibility */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/20" />
            {/* Subtle left-side vignette so adjacent panel text doesn't bleed */}
            <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-black/30 to-transparent sm:block hidden" />

            {/* Branch info */}
            <div className="absolute inset-x-0 bottom-0 p-5 md:p-7">
              <p className="font-mono text-[0.54rem] uppercase tracking-widest text-cream/50 flex items-center gap-1 mb-1.5">
                <MapPin className="h-2.5 w-2.5 shrink-0" />
                {b.city ?? "—"}
              </p>
              <h3 className="font-display font-bold text-cream leading-tight text-lg md:text-xl lg:text-2xl">
                {b.name}
              </h3>
              {/* Slide-in CTA on hover */}
              <div
                className="flex items-center gap-1.5 font-mono text-[0.6rem] uppercase tracking-widest text-amber mt-2 overflow-hidden"
                style={{
                  maxHeight: isActive ? "1.5rem" : 0,
                  opacity: isActive ? 1 : 0,
                  transition: "max-height 320ms ease, opacity 280ms ease",
                }}
              >
                {b.type === "playcation" ? "View & book" : "View location"}
                <ArrowUpRight className="h-3 w-3" />
              </div>
            </div>

            {/* Thin amber top-border on hover */}
            <div className="absolute inset-x-0 top-0 h-0.5 bg-amber scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />
          </Link>
        );
      })}
    </div>
  );
}
