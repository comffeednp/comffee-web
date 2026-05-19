import { getPublishedBranches } from "@/lib/branches";
import CheckoutClient from "./CheckoutClient";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
};

export default async function CheckoutPage() {
  const branches = await getPublishedBranches();
  // Order pickup branches: cafes only (Playcations don't have onsite menu service)
  const pickupBranches = branches
    .filter((b) => b.type === "cafe")
    .map((b) => ({ id: b.id, name: b.name, city: b.city }));

  return (
    <>
      <section className="border-b border-line bg-bg-soft">
        <div className="container-edge py-8">
          <Link
            href="/menu"
            className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to menu
          </Link>
          <div className="mt-6">
            <p className="terminal-label">/order/checkout</p>
            <h1 className="mt-3 font-display text-4xl md:text-6xl font-bold leading-[0.95] tracking-tight text-cream">
              Checkout your order.
            </h1>
            <p className="mt-3 text-cream-dim text-lg max-w-2xl">
              Pick a branch for pickup, drop your details, hit pay. We&apos;ll have it ready when you arrive.
            </p>
          </div>
        </div>
      </section>

      <section className="container-edge py-12 md:py-16">
        <CheckoutClient pickupBranches={pickupBranches} />
      </section>
    </>
  );
}
