"use client";

import { useEffect, useState } from "react";

interface Photo {
  label: string;
  url: string;
}

/**
 * Shows a branch's check-in / house-rules / FAQ sheets — but only renders if
 * the API returns photos, which it does only for an admin or a guest with a
 * confirmed booking. For everyone else it stays invisible.
 */
export default function StayInstructions({ slug }: { slug: string }) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/branches/${slug}/instructions`)
      .then((r) => r.json())
      .then((d) => {
        if (active) setPhotos(Array.isArray(d.photos) ? d.photos : []);
      })
      .catch(() => {
        if (active) setPhotos([]);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  if (!photos || photos.length === 0) return null;

  return (
    <section className="container-edge py-16 md:py-24 max-w-3xl">
      <p className="terminal-label">your stay</p>
      <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tight text-cream">
        Check-in &amp; house rules
      </h2>
      <p className="mt-3 text-cream-dim max-w-xl">
        You can see these because you have a confirmed booking. They include door PINs —
        please keep them to yourself.
      </p>
      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {photos.map((p) => (
          <a
            key={p.url}
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open ${p.label} full size`}
            className="block border border-line-bright bg-bg-card rounded-xl overflow-hidden hover:border-amber transition"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.label} className="w-full h-auto block" loading="lazy" />
            <span className="block px-4 py-3 font-mono text-xs uppercase tracking-widest text-cream-dim">
              {p.label}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
