"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export default function NavScroller({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    ref.current?.scrollTo({ left: 0 });
  }, [pathname]);

  return (
    <div ref={ref} className="border-t border-line overflow-x-auto scrollbar-none bg-bg">
      {children}
    </div>
  );
}
