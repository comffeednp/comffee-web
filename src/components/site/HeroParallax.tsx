"use client";

import Image from "next/image";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

interface Props {
  src: string | null | undefined;
  alt: string;
  children?: React.ReactNode;
  height?: "screen" | "tall" | "medium";
}

export default function HeroParallax({
  src,
  alt,
  children,
  height = "screen",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);

  const heightClass =
    height === "screen"
      ? "min-h-[100svh]"
      : height === "tall"
      ? "min-h-[80svh]"
      : "min-h-[60svh]";

  return (
    <section
      ref={containerRef}
      className={`relative ${heightClass} overflow-hidden flex items-end bg-bg`}
    >
      {/* Parallax background image — desaturated slightly + overlaid with white
          so black text remains legible on any hero photo */}
      <motion.div style={{ y }} className="absolute inset-0">
        {src ? (
          <Image
            src={src}
            alt={alt}
            fill
            sizes="100vw"
            priority
            className="object-cover scale-110"
            style={{ filter: "saturate(0.85)" }}
          />
        ) : (
          <div className="absolute inset-0 bg-grid bg-bg" />
        )}
      </motion.div>

      {/* Dark-to-transparent overlay: strong at bottom where text lives,
          fades to clear at the top so the photo still breathes */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/20 pointer-events-none" />
      <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />

      <div className="relative z-10 container-edge w-full pb-16 md:pb-24">
        {children}
      </div>
    </section>
  );
}
