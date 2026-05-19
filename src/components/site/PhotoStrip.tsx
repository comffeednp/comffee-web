"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { BranchPhoto } from "@/lib/supabase/types";

/**
 * Cinematic horizontal photo strip — drag/swipe through a branch's photos
 * inside a monitor frame so visitors *feel* like they're walking through.
 */
export default function PhotoStrip({ photos }: { photos: BranchPhoto[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "center",
    loop: photos.length > 2,
    dragFree: false,
    containScroll: "trimSnaps",
  });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  if (photos.length === 0) return null;

  return (
    <div className="relative">
      {/* Monitor frame */}
      <div className="monitor-frame">
        <div className="monitor-screen crt-scanlines">
          <div className="overflow-hidden" ref={emblaRef}>
            <div className="flex">
              {photos.map((photo, i) => (
                <div
                  key={photo.id}
                  className="relative flex-[0_0_100%] md:flex-[0_0_85%] lg:flex-[0_0_70%] min-w-0 px-2"
                >
                  <div className="relative aspect-[16/9] w-full overflow-hidden rounded-md bg-bg">
                    {photo.public_url ? (
                      <Image
                        src={photo.public_url}
                        alt={photo.caption ?? ""}
                        fill
                        sizes="(min-width: 1024px) 70vw, 100vw"
                        className="object-contain"
                        priority={i === 0}
                      />
                    ) : (
                      <div className="absolute inset-0 bg-grid bg-bg" />
                    )}
                  </div>
                  {photo.caption && (
                    <div className="mt-3 flex items-center gap-3 px-1">
                      <span className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor">
                        // frame {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="text-sm text-cream-dim">{photo.caption}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-4 flex items-center justify-between gap-4">
          <div className="font-mono text-[0.7rem] uppercase tracking-widest text-mocha">
            // drag or use arrows to walk through
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => emblaApi?.scrollPrev()}
              className="flex h-9 w-9 items-center justify-center border border-line-bright rounded-md text-cream-dim hover:text-amber hover:border-amber/60 transition"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-mono text-xs text-cream w-12 text-center">
              {String(selectedIndex + 1).padStart(2, "0")}/
              {String(photos.length).padStart(2, "0")}
            </span>
            <button
              type="button"
              onClick={() => emblaApi?.scrollNext()}
              className="flex h-9 w-9 items-center justify-center border border-line-bright rounded-md text-cream-dim hover:text-amber hover:border-amber/60 transition"
              aria-label="Next photo"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
