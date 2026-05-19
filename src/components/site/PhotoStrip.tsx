"use client";

import Image from "next/image";
import { useEffect, useState, useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { BranchPhoto } from "@/lib/supabase/types";

export default function PhotoStrip({ photos }: { photos: BranchPhoto[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    loop: photos.length > 3,
    dragFree: true,
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
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex gap-3 px-4 md:px-8">
          {photos.map((photo, i) => (
            <div
              key={photo.id}
              className="relative flex-[0_0_auto] h-[65vh] aspect-[3/4] overflow-hidden rounded-xl"
            >
              {photo.public_url ? (
                <Image
                  src={photo.public_url}
                  alt={photo.caption ?? ""}
                  fill
                  sizes="(min-width: 1024px) 30vw, 70vw"
                  className="object-cover"
                  priority={i === 0}
                />
              ) : (
                <div className="absolute inset-0 bg-bg-card" />
              )}
              {photo.caption && (
                <div className="absolute bottom-0 left-0 right-0 px-4 py-3 bg-gradient-to-t from-black/80 to-transparent">
                  <p className="text-sm text-cream">{photo.caption}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 md:px-8 mt-5 flex items-center justify-between gap-4">
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
  );
}
