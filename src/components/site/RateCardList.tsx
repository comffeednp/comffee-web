"use client";

import { useState } from "react";
import RateCard from "./RateCard";
import type { BranchRate } from "@/lib/supabase/types";

export default function RateCardList({ rates }: { rates: BranchRate[] }) {
  const [selectedId, setSelectedId] = useState<string>(rates[0]?.id ?? "");

  return (
    <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {rates.map((rate) => (
        <button
          key={rate.id}
          type="button"
          onClick={() => setSelectedId(rate.id)}
          className="text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber rounded-xl"
        >
          <RateCard rate={rate} highlight={selectedId === rate.id} />
        </button>
      ))}
    </div>
  );
}
