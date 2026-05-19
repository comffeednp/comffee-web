import type { Metadata } from "next";
import Link from "next/link";
import { getSiteSettings } from "@/lib/settings";
import Reveal from "@/components/site/Reveal";
import { Coffee, Cpu, Gamepad2, Heart } from "lucide-react";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "About",
  description: "Comffee Drink and Play — the story of a Filipino internet cafe and Playcation network.",
};

export default async function AboutPage() {
  const settings = await getSiteSettings();
  return (
    <>
      <section className="relative py-20 md:py-32 border-b border-line bg-bg-soft overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
        <div className="container-edge relative">
          <p className="terminal-label">/about</p>
          <h1 className="mt-4 font-display text-5xl md:text-7xl lg:text-8xl font-bold leading-[0.9] tracking-tight text-cream max-w-4xl">
            We built the place we wanted to hang out at.
          </h1>
        </div>
      </section>

      <section className="container-edge py-20 md:py-28 grid gap-16 lg:grid-cols-[1fr_2fr]">
        <Reveal>
          <p className="terminal-label">// story</p>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="space-y-6 text-lg text-cream-dim leading-relaxed">
            <p>
              {settings.company_name} started as a single internet cafe with twelve PCs, an espresso machine, and a couch in the back. People kept asking if they could stay overnight. So we built a Playcation.
            </p>
            <p>
              Today we run cafes and gaming staycations across the Philippines. Every branch has its own personality, its own coffee blend, and its own controller wall. The one thing we don&apos;t change: fast hardware, hotter coffee, and a place where it&apos;s OK to lose six hours to a single match.
            </p>
            <p>
              We&apos;re cafe people who happen to love gaming. Or gamers who happen to love coffee. Either way: come hang out.
            </p>
          </div>
        </Reveal>
      </section>

      <section className="bg-bg-soft border-y border-line py-20 md:py-28">
        <div className="container-edge">
          <Reveal>
            <p className="terminal-label">values.json</p>
            <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tight text-cream max-w-2xl">
              What we&apos;re about.
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Cpu, title: "Real hardware", body: "We build our own rigs and replace them often. No cutting corners." },
              { icon: Coffee, title: "Real coffee", body: "Beans roasted weekly, machines maintained daily. Yes, even at 3am." },
              { icon: Gamepad2, title: "Real gaming", body: "Premium controllers, low latency, no jank. We game here too." },
              { icon: Heart, title: "Real people", body: "Staff who actually know the games and the coffee. Ask anything." },
            ].map((v, i) => {
              const Icon = v.icon;
              return (
                <Reveal key={v.title} delay={i * 0.06}>
                  <div className="h-full p-6 border border-line-bright bg-bg-card rounded-xl">
                    <Icon className="h-7 w-7 text-amber" strokeWidth={1.5} />
                    <h3 className="mt-4 text-lg font-semibold text-cream">{v.title}</h3>
                    <p className="mt-2 text-sm text-cream-dim leading-relaxed">{v.body}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="container-edge py-24 md:py-32 text-center">
        <Reveal>
          <p className="terminal-label">connect</p>
          <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tight text-cream">
            Come find us.
          </h2>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link href="/branches" className="key-cap key-cap-primary">
              See branches
            </Link>
            <Link href="/contact" className="key-cap">
              Send us a message
            </Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}
