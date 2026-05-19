"use client";

import { useEffect, useRef, useState } from "react";
import AmenityIcon from "@/components/site/AmenityIcon";

const ALL_ICONS = [
  "aircon", "bed", "building", "city", "coffee", "fan", "flame", "gamepad",
  "guitar", "headphones", "heater", "karaoke", "keyboard", "mic", "mikrotik",
  "monitor", "moon", "mountain", "mouse", "music", "network", "parking",
  "piano", "playstation", "plug", "pool", "ps", "router", "shower", "snowflake",
  "sofa", "sparkles", "speaker", "tree", "tv", "utensils", "video", "wifi",
];

export default function AmenityIconPicker({ defaultValue = "sparkles" }: { defaultValue?: string }) {
  const [selected, setSelected] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <input type="hidden" name="icon" value={selected} />

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-2 border border-line-bright rounded-lg bg-bg hover:border-amber/60 transition"
      >
        <AmenityIcon name={selected} className="h-4 w-4 text-amber shrink-0" />
        <span className="font-mono text-xs text-cream flex-1 text-left">{selected}</span>
        <span className="font-mono text-[0.65rem] text-mocha">{open ? "▴" : "▾"}</span>
      </button>

      {/* Dropdown list */}
      {open && (
        <ul className="absolute z-[9999] top-full left-0 mt-1 w-56 bg-bg-elev border border-line-bright rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.7)] overflow-y-scroll" style={{ maxHeight: "320px", scrollbarWidth: "auto", scrollbarColor: "#5a4a3a transparent" }}>
          {ALL_ICONS.map((icon) => (
            <li key={icon}>
              <button
                type="button"
                onMouseDown={() => { setSelected(icon); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-bg-soft transition text-left border-b border-line last:border-0 ${
                  selected === icon ? "bg-amber/10 text-amber" : ""
                }`}
              >
                <AmenityIcon name={icon} className="h-4 w-4 shrink-0 text-amber" />
                <span className="font-mono text-xs text-cream">{icon}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
