"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function TopLoadingBar() {
  const pathname = usePathname();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  useEffect(() => {
    setState("loading");
    const done = setTimeout(() => setState("done"), 350);
    const idle = setTimeout(() => setState("idle"), 650);
    return () => {
      clearTimeout(done);
      clearTimeout(idle);
    };
  }, [pathname]);

  if (state === "idle") return null;

  return (
    <div
      className="fixed top-0 left-0 z-[999] h-[2px] bg-amber transition-all duration-300 ease-out"
      style={{
        width: state === "done" ? "100%" : "80%",
        opacity: state === "done" ? 0 : 1,
        transitionProperty: "width, opacity",
        transitionDuration: state === "done" ? "150ms, 200ms" : "350ms, 0ms",
      }}
    />
  );
}
