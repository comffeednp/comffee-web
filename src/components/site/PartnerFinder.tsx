"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowUpRight,
  ChevronRight,
  Loader2,
  LocateFixed,
  MapPin,
  Search,
  Store,
  X,
} from "lucide-react";
import type { Branch } from "@/lib/supabase/types";
import { haversineMeters } from "@/lib/geo";
import BranchCard from "@/components/site/BranchCard";

// Interactive finder for the Partner Cafes page. Two search modes:
//   • "By name"  — live client-side filter over name / brand / city / address.
//   • "Near me"  — one browser geolocation request, then sort by great-circle distance.
// Partners that operate MULTIPLE branches under one `brand` collapse into a single brand card; the
// brand name shows first and a hover (or tap) reveals a per-brand branch picker with its OWN search.
// `brand` is optional — if it's absent/NULL (the current state of every row until migration 0051 is
// applied), every partner is just a standalone card. So this degrades cleanly with no DB change.

type Mode = "name" | "near";
type GeoState = "idle" | "loading" | "ready" | "denied" | "unavailable" | "unsupported";

interface BranchWithDistance extends Branch {
  distanceM: number | null;
}

interface BrandGroup {
  key: string;
  isBrand: boolean; // true only when >1 branch share a non-null brand
  name: string; // brand name, or the single branch's name
  branches: BranchWithDistance[];
  nearestM: number | null; // min distance across branches — drives "nearest first" ordering
}

function fmtDistance(m: number | null): string | undefined {
  if (m == null) return undefined;
  if (m < 950) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 9500 ? 1 : 0)} km`;
}

function matches(b: Branch, q: string): boolean {
  if (!q) return true;
  return [b.name, b.brand, b.city, b.address].some((s) =>
    (s ?? "").toLowerCase().includes(q)
  );
}

// Within a brand, and within the whole list, prefer nearest when we have coords, else sort_order.
function byDistanceThenOrder(a: BranchWithDistance, b: BranchWithDistance): number {
  if (a.distanceM != null && b.distanceM != null) return a.distanceM - b.distanceM;
  if (a.distanceM != null) return -1;
  if (b.distanceM != null) return 1;
  return (a.sort_order ?? 0) - (b.sort_order ?? 0);
}

export default function PartnerFinder({ partners }: { partners: Branch[] }) {
  const [mode, setMode] = useState<Mode>("name");
  const [query, setQuery] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geo, setGeo] = useState<GeoState>("idle");

  const located = geo === "ready" && coords != null;
  // Distance only drives ordering/labels in "Near me" mode. Keep coords cached so toggling back to
  // "Near me" is instant, but DON'T let distance influence "By name" — that mode must be
  // deterministic regardless of any prior geolocation.
  const distanceActive = mode === "near" && located;

  const withDistance = useMemo<BranchWithDistance[]>(() => {
    const origin = distanceActive ? coords : null;
    return partners.map((b) => ({
      ...b,
      distanceM:
        origin && b.lat != null && b.lng != null
          ? haversineMeters(origin.lat, origin.lng, b.lat, b.lng)
          : null,
    }));
  }, [partners, coords, distanceActive]);

  const q = mode === "name" ? query.trim().toLowerCase() : "";

  const groups = useMemo<BrandGroup[]>(() => {
    const visible = withDistance.filter((b) => matches(b, q));

    // Bucket by brand (case-insensitive). NULL/blank brand → its own solo bucket.
    const buckets = new Map<string, BranchWithDistance[]>();
    for (const b of visible) {
      const brand = b.brand?.trim();
      const key = brand ? `brand:${brand.toLowerCase()}` : `solo:${b.id}`;
      const arr = buckets.get(key);
      if (arr) arr.push(b);
      else buckets.set(key, [b]);
    }

    const out: BrandGroup[] = [];
    for (const [key, branches] of buckets) {
      const sorted = [...branches].sort(byDistanceThenOrder);
      const dists = sorted.map((b) => b.distanceM).filter((d): d is number => d != null);
      const brand = sorted[0].brand?.trim();
      const isBrand = sorted.length > 1 && !!brand;
      out.push({
        key,
        isBrand,
        name: isBrand ? brand! : sorted[0].name,
        branches: sorted,
        nearestM: dists.length ? Math.min(...dists) : null,
      });
    }

    out.sort((a, b) =>
      distanceActive
        ? (a.nearestM ?? Infinity) - (b.nearestM ?? Infinity)
        : (a.branches[0].sort_order ?? 0) - (b.branches[0].sort_order ?? 0)
    );
    return out;
  }, [withDistance, q, distanceActive]);

  function locate() {
    setMode("near");
    if (coords) {
      setGeo("ready");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeo("unsupported");
      return;
    }
    setGeo("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeo("ready");
      },
      (err) =>
        setGeo(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  }

  const total = groups.reduce((n, g) => n + g.branches.length, 0);

  return (
    <div>
      {/* ── Search toolbar: the two modes ─────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
        <div className="inline-flex self-start rounded-lg border border-line-bright bg-bg-card p-1">
          <button
            type="button"
            onClick={() => setMode("name")}
            aria-pressed={mode === "name"}
            title="Search partner cafes by name"
            className={tabClass(mode === "name")}
          >
            <Search className="h-3.5 w-3.5" /> By name
          </button>
          <button
            type="button"
            onClick={locate}
            aria-pressed={mode === "near"}
            title="Find partner cafes nearest to you"
            className={tabClass(mode === "near")}
          >
            <LocateFixed className="h-3.5 w-3.5" /> Near me
          </button>
        </div>

        <div className="flex-1">
          {mode === "name" ? (
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mocha" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by cafe or brand name, city…"
                aria-label="Search partner cafes by name"
                className="w-full rounded-lg border border-line-bright bg-bg py-3 pl-10 pr-4 font-mono text-sm text-cream placeholder:text-mocha focus:border-amber focus:outline-none"
              />
            </label>
          ) : (
            <NearStatus geo={geo} onLocate={locate} />
          )}
        </div>
      </div>

      {/* ── Result count (live region so SR users hear filter/sort changes) ── */}
      <p
        role="status"
        aria-live="polite"
        className="mt-4 font-mono text-[0.7rem] uppercase tracking-widest text-mocha"
      >
        {total === 0
          ? "// no matches"
          : `// ${total} partner ${total === 1 ? "cafe" : "cafes"}${
              distanceActive ? " · nearest first" : ""
            }`}
      </p>

      {/* ── Results ───────────────────────────────────────────────────── */}
      {groups.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-line-bright bg-bg-card p-10 text-center">
          <Store className="mx-auto h-8 w-8 text-mocha" />
          <p className="mt-4 text-cream-dim">
            No partner cafes match your search{mode === "name" && query ? ` for “${query}”` : ""}.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 md:gap-8 lg:grid-cols-3">
          {groups.map((g) =>
            g.isBrand ? (
              <PartnerBrandCard key={g.key} group={g} showDistance={distanceActive} />
            ) : (
              <BranchCard
                key={g.key}
                branch={g.branches[0]}
                hrefBase="/partners"
                distanceLabel={distanceActive ? fmtDistance(g.branches[0].distanceM) : undefined}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

// Active mode is signalled by fill AND weight (not colour alone — WCAG 1.4.1).
function tabClass(active: boolean): string {
  return `flex items-center gap-1.5 rounded-md px-3 py-2 font-mono text-xs uppercase tracking-[0.14em] transition ${
    active ? "bg-amber font-semibold text-bg" : "text-cream-dim hover:text-cream"
  }`;
}

function NearStatus({ geo, onLocate }: { geo: GeoState; onLocate: () => void }) {
  if (geo === "loading")
    return (
      <p
        role="status"
        aria-live="polite"
        className="flex h-full items-center gap-2 py-3 font-mono text-xs text-cream-dim"
      >
        <Loader2 className="h-4 w-4 animate-spin" /> Getting your location…
      </p>
    );
  if (geo === "ready")
    return (
      <p
        role="status"
        aria-live="polite"
        className="flex h-full items-center py-3 font-mono text-xs text-phosphor"
      >
        {"// located — showing the closest partner cafes first"}
      </p>
    );
  if (geo === "idle")
    return (
      <button
        type="button"
        onClick={onLocate}
        title="Allow location access to sort by distance"
        className="key-cap !px-4 !py-2.5"
      >
        <LocateFixed className="h-4 w-4" /> Use my location
      </button>
    );

  const msg =
    geo === "denied"
      ? "Location is blocked. Allow it in your browser, or search by name instead."
      : geo === "unsupported"
        ? "This browser can't share location — try searching by name."
        : "Couldn't get your location. Try again, or search by name.";
  return (
    <div role="alert" className="flex h-full flex-wrap items-center gap-3 py-1">
      <span className="font-mono text-xs text-amber">{msg}</span>
      <button
        type="button"
        onClick={onLocate}
        title="Try getting your location again"
        className="font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber"
      >
        Retry
      </button>
    </div>
  );
}

// A partner that runs several branches under one brand. Shows the brand name; hovering (desktop) or
// tapping (touch) reveals an overlay with the per-brand search ("another search button") + the
// branch list to pick from. Built as an accessible disclosure: click/Enter opens it, focus moves
// into the panel, Escape or a tap/click outside closes it and returns focus to the trigger.
function PartnerBrandCard({
  group,
  showDistance,
}: {
  group: BrandGroup;
  showDistance: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [inner, setInner] = useState("");
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const branches = useMemo(() => {
    const qq = inner.trim().toLowerCase();
    return qq ? group.branches.filter((b) => matches(b, qq)) : group.branches;
  }, [group.branches, inner]);

  const cities = Array.from(new Set(group.branches.map((b) => b.city).filter(Boolean)));
  const hero = group.branches.find((b) => b.hero_image_url)?.hero_image_url ?? null;

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };
  // Desktop hover-out closes after a grace period — but never yank focus from a keyboard user who
  // is interacting inside the panel.
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      if (cardRef.current?.contains(document.activeElement)) return;
      setOpen(false);
    }, 140);
  };
  const close = (refocus: boolean) => {
    cancelClose();
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };
  // Hover-open (mouse): don't steal focus across cards. Click/tap/Enter-open: move focus to the
  // close button (not the search input — that would summon the mobile soft-keyboard).
  const openViaHover = () => {
    cancelClose();
    setOpen(true);
  };
  const openViaClick = () => {
    cancelClose();
    setOpen(true);
    requestAnimationFrame(() => closeBtnRef.current?.focus());
  };

  // While open: Escape closes (restoring focus); a pointer-down outside the card closes it (the
  // touch equivalent of mouse-leave). Inlined handlers keep deps to [open] (setOpen is stable).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (closeTimer.current) clearTimeout(closeTimer.current);
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onDown = (e: Event) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        if (closeTimer.current) clearTimeout(closeTimer.current);
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  // Don't fire a pending close timer onto an unmounted card (e.g. after a search re-filters it out).
  useEffect(() => cancelClose, []);

  return (
    <div
      ref={cardRef}
      className="group relative overflow-hidden rounded-xl border border-line-bright bg-bg-card"
      onMouseEnter={openViaHover}
      onMouseLeave={scheduleClose}
    >
      {/* Front face — brand identity. Click/tap/Enter opens the picker; while open it leaves the tab
          order because the overlay covers it. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={openViaClick}
        aria-label={`Select a ${group.name} branch`}
        aria-expanded={open}
        tabIndex={open ? -1 : 0}
        className="block w-full text-left"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden">
          {hero ? (
            <Image
              src={hero}
              alt=""
              fill
              sizes="(min-width: 1024px) 33vw, 100vw"
              className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 bg-grid bg-bg" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
          <div className="absolute left-3 right-3 top-3 flex items-center justify-between">
            <span className="status-chip">Internet Cafe</span>
            <span className="status-chip status-chip-amber">
              {group.branches.length} branches
            </span>
          </div>
        </div>
        <div className="p-6">
          {/* Brand title is a span, not a heading — it lives inside an interactive control. */}
          <span className="block font-display text-2xl tracking-tight text-cream transition-colors group-hover:text-amber">
            {group.name}
          </span>
          <span className="mt-2 block line-clamp-2 text-sm text-cream-dim">
            {cities.length ? cities.join(" · ") : "Multiple locations"}
          </span>
          <span className="mt-5 inline-flex items-center gap-1 font-mono text-[0.65rem] uppercase tracking-widest text-amber">
            Select a branch <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </button>

      {/* Overlay: per-brand search + branch picker, shown on hover/tap. */}
      {open && (
        <div
          className="absolute inset-0 z-10 flex flex-col rounded-xl border border-amber/30 bg-bg/97 backdrop-blur-sm"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <span className="truncate font-display text-lg text-cream">{group.name}</span>
            <button
              ref={closeBtnRef}
              type="button"
              onClick={() => close(true)}
              aria-label={`Close ${group.name} branch list`}
              className="-my-2 -mr-2 grid h-11 w-11 shrink-0 place-items-center text-cream-dim hover:text-amber"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* The per-brand search that "appears again". */}
          <label className="relative block px-4 pt-3">
            <Search className="pointer-events-none absolute left-7 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mocha" />
            <input
              type="search"
              value={inner}
              onChange={(e) => setInner(e.target.value)}
              placeholder={`Search ${group.name} branches…`}
              aria-label={`Search ${group.name} branches`}
              className="w-full rounded-md border border-line-bright bg-bg-card py-2 pl-8 pr-3 font-mono text-xs text-cream placeholder:text-mocha focus:border-amber focus:outline-none"
            />
          </label>

          <div className="flex-1 overflow-y-auto px-2 py-2">
            {branches.length === 0 ? (
              <p className="px-2 py-3 font-mono text-xs text-mocha">{"// no branch matches"}</p>
            ) : (
              <ul className="space-y-1">
                {branches.map((b) => {
                  const dist = showDistance ? fmtDistance(b.distanceM) : undefined;
                  return (
                    <li key={b.id}>
                      <Link
                        href={`/partners/${b.slug}`}
                        title={`Visit ${b.name}`}
                        className="flex items-center justify-between gap-2 rounded-md px-3 py-2.5 transition hover:bg-bg-card"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-cream">{b.name}</span>
                          <span className="flex items-center gap-1 font-mono text-[0.65rem] text-mocha">
                            <MapPin className="h-3 w-3" /> {b.city ?? "—"}
                            {dist && <span className="text-amber">· {dist}</span>}
                          </span>
                        </span>
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-amber" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
