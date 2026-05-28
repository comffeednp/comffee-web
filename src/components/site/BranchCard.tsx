import Image from "next/image";
import Link from "next/link";
import type { Branch } from "@/lib/supabase/types";
import { ArrowUpRight, MapPin } from "lucide-react";

interface Props {
  branch: Branch;
  size?: "default" | "feature";
  // Override the URL prefix. Default "/branches" for franchises + Playcation; partner cafes pass
  // "/partners" since they live in their own section ([[comffee-saas-vision]]).
  hrefBase?: string;
}

export default function BranchCard({ branch, size = "default", hrefBase = "/branches" }: Props) {
  const isFeature = size === "feature";
  const isPlay = branch.type === "playcation";
  return (
    <Link
      href={`${hrefBase}/${branch.slug}`}
      className="group block relative overflow-hidden rounded-xl border border-line-bright bg-bg-card transition-all hover:border-amber/60 hover:-translate-y-0.5"
    >
      {/* Image */}
      <div
        className={`relative w-full overflow-hidden ${
          isFeature ? "aspect-[16/10]" : "aspect-[4/3]"
        }`}
      >
        {branch.hero_image_url ? (
          <Image
            src={branch.hero_image_url}
            alt={branch.name}
            fill
            sizes={isFeature ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 33vw, 100vw"}
            className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 bg-grid bg-bg" />
        )}
        {/* Top fade overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
        {/* Top status bar */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
          <span className={`status-chip ${isPlay ? "status-chip-amber" : ""}`}>
            {isPlay ? "Playcation" : "Internet Cafe"}
          </span>
          <span className="font-mono text-[0.65rem] uppercase tracking-widest text-cream-dim/80">
            #{String(branch.sort_order).padStart(2, "0")}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="relative p-6">
        <h3
          className={`font-display tracking-tight leading-tight text-cream group-hover:text-amber transition-colors ${
            isFeature ? "text-3xl md:text-4xl" : "text-2xl"
          }`}
        >
          {branch.name}
        </h3>
        {branch.tagline && (
          <p className="mt-2 text-sm text-cream-dim leading-relaxed line-clamp-2">
            {branch.tagline}
          </p>
        )}
        <div className="mt-5 flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-mocha font-mono">
            <MapPin className="h-3.5 w-3.5" />
            {branch.city ?? "—"}
          </span>
          <span className="flex items-center gap-1 text-amber font-mono uppercase tracking-widest">
            Enter
            <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>

      {/* Glow on hover */}
      <div className="pointer-events-none absolute inset-x-0 -bottom-1 h-1 bg-gradient-to-r from-transparent via-amber to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  );
}
