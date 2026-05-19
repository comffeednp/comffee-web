import type { Metadata } from "next";
import Link from "next/link";
import { getPublishedBranches } from "@/lib/branches";
import TopupClient from "./TopupClient";
import { ArrowLeft, Wallet } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Top up your member account",
  description: "Load your Comffee member account from your phone. Pay with GCash, Maya, or card.",
};

export default async function TopupPage() {
  const branches = await getPublishedBranches("cafe");

  return (
    <>
      <section className="border-b border-line bg-bg-soft">
        <div className="container-edge py-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber"
          >
            <ArrowLeft className="h-3 w-3" />
            Home
          </Link>
          <div className="mt-6 flex items-start gap-3">
            <Wallet className="h-6 w-6 text-amber mt-2 hidden md:block" />
            <div>
              <p className="terminal-label">/topup</p>
              <h1 className="mt-3 font-display text-4xl md:text-6xl font-bold leading-[0.95] tracking-tight text-cream">
                Top up your member account.
              </h1>
              <p className="mt-3 text-cream-dim text-lg max-w-2xl">
                Load credit from your phone. Pay with GCash, Maya, or card. The cashier credits your member account within a few minutes.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="container-edge py-12 md:py-16">
        <TopupClient
          branches={branches.map((b) => ({
            id: b.id,
            name: b.name,
            city: b.city,
          }))}
        />
      </section>
    </>
  );
}
