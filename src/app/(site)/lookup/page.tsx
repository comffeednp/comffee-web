import type { Metadata } from "next";
import LookupClient from "./LookupClient";
import { Search } from "lucide-react";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Look up your order",
  description: "Retrieve your Comffee order or Playcation booking by ID and email.",
};

interface Props {
  searchParams: Promise<{ id?: string }>;
}

export default async function LookupPage({ searchParams }: Props) {
  const { id } = await searchParams;
  return (
    <>
      <section className="border-b border-line bg-bg-soft py-20">
        <div className="container-edge">
          <div className="flex items-center gap-2 mb-2">
            <Search className="h-4 w-4 text-amber" />
            <p className="terminal-label">/lookup</p>
          </div>
          <h1 className="font-display text-5xl md:text-7xl font-bold leading-[0.9] tracking-tight text-cream max-w-3xl">
            Find your reservation.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-cream-dim">
            Drop your reservation or order ID plus the email or phone you used at checkout. No login needed.
          </p>
        </div>
      </section>

      <section className="container-edge py-16 max-w-2xl">
        <LookupClient initialId={id ?? ""} />
      </section>
    </>
  );
}
