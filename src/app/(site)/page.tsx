import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Cpu, Gamepad2, Coffee, Zap } from "lucide-react";
import { getPublishedBranches } from "@/lib/branches";
import { getMenu } from "@/lib/menu";
import { getSiteSettings } from "@/lib/settings";
import HeroParallax from "@/components/site/HeroParallax";
import BranchCard from "@/components/site/BranchCard";
import Reveal from "@/components/site/Reveal";

export const revalidate = 300;

export default async function HomePage() {
  const [branches, menu, settings] = await Promise.all([
    getPublishedBranches(),
    getMenu(),
    getSiteSettings(),
  ]);

  const cafes = branches.filter((b) => b.type === "cafe");
  const playcations = branches.filter((b) => b.type === "playcation");
  const featuredCafe = cafes[0];
  const featuredPlay = playcations[0];

  const featuredMenu = menu.flatMap((c) => c.items).slice(0, 8);
  const brandName = settings.company_name;

  return (
    <>
      {/* ============================================================
          HERO
          ============================================================ */}
      <HeroParallax
        src={featuredCafe?.hero_image_url ?? branches[0]?.hero_image_url}
        alt={brandName}
        height="screen"
      >
        <div className="max-w-4xl">
          <div className="flex items-center gap-3 mb-8">
            <span className="status-chip">System online</span>
            {branches.length > 0 && (
              <span className="status-chip status-chip-amber">
                {branches.length.toString().padStart(2, "0")} branches live
              </span>
            )}
          </div>

          <div className="flex items-center gap-6 md:gap-10">
            <Image
              src="/comffee-logo-white-trimmed.png"
              alt="Comffee"
              width={506}
              height={642}
              style={{ height: "calc(clamp(2.75rem, 8vw, 6rem) * 1.8)", width: "auto", filter: "brightness(0.875) sepia(0.25)" }}
              className="flex-shrink-0"
            />
            <h1 className="font-display text-[clamp(2.75rem,8vw,6rem)] leading-[0.9] font-bold tracking-tight text-cream">
              {brandName}
            </h1>
          </div>

          <p className="mt-8 max-w-xl text-base md:text-lg text-cream-dim leading-relaxed">
            {settings.tagline}
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link href="/branches" className="key-cap key-cap-primary">
              <Cpu className="h-4 w-4" />
              Browse branches
            </Link>
            <Link href="/playcation" className="key-cap">
              <Gamepad2 className="h-4 w-4" />
              Book Playcation
            </Link>
          </div>
        </div>

        {/* scroll cue */}
        <div className="absolute bottom-6 right-6 hidden md:flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-cream-dim/70">
          <span className="block h-px w-12 bg-cream-dim/40" />
          scroll
        </div>
      </HeroParallax>

      {/* ============================================================
          TWO NETWORKS
          ============================================================ */}
      <section className="relative py-24 md:py-40 bg-bg overflow-hidden">
        <div className="absolute inset-0 bg-grid pointer-events-none opacity-60" />
        <div className="container-edge relative">
          <Reveal>
            <p className="terminal-label">what_we_run</p>
            <h2 className="mt-4 font-display text-4xl md:text-6xl font-bold tracking-tight text-cream max-w-3xl">
              Two ways to play.
            </h2>
            <p className="mt-5 max-w-2xl text-cream-dim text-lg">
              Drop in for an hourly session at one of our internet cafes, or check into a Playcation stay where the PlayStation, fiber internet, and coffee are all included.
            </p>
          </Reveal>

          <div className="mt-16 grid gap-6 lg:grid-cols-2">
            {featuredCafe && (
              <Reveal>
                <FeaturedNetwork
                  kind="cafe"
                  title="Internet Cafes"
                  caption="Hourly stations · drop in · stay all night"
                  branchName={featuredCafe.name}
                  image={featuredCafe.hero_image_url}
                  cta="See all cafes"
                  href="/branches?type=cafe"
                />
              </Reveal>
            )}
            {featuredPlay && (
              <Reveal delay={0.1}>
                <FeaturedNetwork
                  kind="playcation"
                  title="Playcation Stays"
                  caption="Overnight rooms · console + coffee included"
                  branchName={featuredPlay.name}
                  image={featuredPlay.hero_image_url}
                  cta="Book a stay"
                  href="/playcation"
                />
              </Reveal>
            )}
          </div>
        </div>
      </section>

      {/* ============================================================
          ALL BRANCHES
          ============================================================ */}
      <section className="relative py-24 md:py-32">
        <div className="container-edge">
          <div className="flex flex-wrap items-end justify-between gap-6 mb-12">
            <Reveal>
              <p className="terminal-label">branches</p>
              <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tight text-cream">
                Every location.
              </h2>
            </Reveal>
            <Link
              href="/branches"
              className="font-mono text-xs uppercase tracking-widest text-cream hover:underline flex items-center gap-1"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {branches.map((b, i) => (
              <Reveal key={b.id} delay={i * 0.05}>
                <BranchCard branch={b} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          MENU STRIP
          ============================================================ */}
      {featuredMenu.length > 0 && (
        <section className="relative py-24 md:py-32 bg-bg-soft border-y border-line">
          <div className="container-edge">
            <Reveal>
              <p className="terminal-label">menu</p>
              <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tight text-cream max-w-2xl">
                Coffee. Food. Snacks.
              </h2>
              <p className="mt-4 text-cream-dim max-w-xl">
                A working barista bar, rice meals, ramen, and snacks. Order from the counter or skip the line with advance order.
              </p>
            </Reveal>

            <div className="mt-12 -mx-6 px-6 md:mx-0 md:px-0 flex gap-4 overflow-x-auto snap-strip">
              {featuredMenu.map((item) => (
                <div
                  key={item.id}
                  className="min-w-[260px] max-w-[280px] flex-shrink-0 p-5 border border-line-bright bg-bg-card rounded-xl hover:border-cream transition"
                >
                  <h4 className="text-lg font-semibold text-cream">{item.name}</h4>
                  {item.description && (
                    <p className="mt-1 text-xs text-cream-dim line-clamp-2">{item.description}</p>
                  )}
                  <p className="mt-4 font-mono text-cream font-semibold">
                    ₱{Number(item.base_price_php).toFixed(0)}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-10 flex justify-center">
              <Link href="/menu" className="key-cap">
                <Coffee className="h-4 w-4" />
                See full menu
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ============================================================
          HOW IT WORKS
          ============================================================ */}
      <section className="relative py-24 md:py-32">
        <div className="container-edge">
          <Reveal>
            <p className="terminal-label">how_it_works</p>
            <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tight text-cream max-w-2xl">
              Three simple steps.
            </h2>
          </Reveal>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {[
              {
                num: "01",
                icon: Cpu,
                title: "Pick your branch",
                body: "Browse cafes and Playcation stays. See real photos of every room and rig before you commit.",
              },
              {
                num: "02",
                icon: Zap,
                title: "Reserve your slot",
                body: "Book a Playcation, reserve a PC as a walk-in or member, or just drop by. Live availability, no surprises.",
              },
              {
                num: "03",
                icon: Coffee,
                title: "Arrive and enjoy",
                body: "We'll have it ready. Coffee in hand, controllers in lap, fast internet, comfortable seats.",
              },
            ].map((step, i) => {
              const Icon = step.icon;
              return (
                <Reveal key={step.num} delay={i * 0.08}>
                  <div className="relative h-full p-8 border border-line-bright bg-bg-card rounded-xl group hover:border-cream transition">
                    <div className="flex items-start justify-between">
                      <span className="font-mono text-xs uppercase tracking-widest text-mocha">
                        STEP // {step.num}
                      </span>
                      <Icon className="h-6 w-6 text-cream" strokeWidth={1.5} />
                    </div>
                    <h3 className="mt-8 text-2xl font-display font-semibold text-cream">
                      {step.title}
                    </h3>
                    <p className="mt-3 text-cream-dim text-sm leading-relaxed">{step.body}</p>
                    <div className="mt-6 h-px bg-line group-hover:bg-cream transition-colors" />
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============================================================
          FINAL CTA
          ============================================================ */}
      <section className="relative py-24 md:py-40">
        <div className="container-edge">
          <div className="relative max-w-4xl mx-auto text-center p-12 md:p-20 border border-line-bright bg-bg-card rounded-2xl overflow-hidden">
            <p className="terminal-label">visit_us</p>
            <h2 className="mt-4 font-display text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-cream">
              Come hang out.
            </h2>
            <p className="mt-5 text-cream-dim text-lg max-w-xl mx-auto">
              Pick a branch, pick a date, book it. We&apos;ll keep the espresso machine warm.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link href="/playcation" className="key-cap key-cap-primary">
                Book a Playcation
              </Link>
              <Link href="/branches" className="key-cap">
                Browse cafes
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/* ----------------------------------------------------------------
   Featured network card
   ---------------------------------------------------------------- */
function FeaturedNetwork({
  kind,
  title,
  caption,
  branchName,
  image,
  cta,
  href,
}: {
  kind: "cafe" | "playcation";
  title: string;
  caption: string;
  branchName: string;
  image: string | null;
  cta: string;
  href: string;
}) {
  const Icon = kind === "cafe" ? Cpu : Gamepad2;
  return (
    <Link
      href={href}
      className="group relative block aspect-[4/5] md:aspect-[5/6] overflow-hidden rounded-2xl border border-line-bright bg-bg-card hover:border-cream transition"
    >
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={title}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1500ms] ease-out group-hover:scale-105"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      <div className="relative h-full flex flex-col justify-between p-8 md:p-10">
        <div className="flex items-start justify-between">
          <span className={`status-chip ${kind === "playcation" ? "status-chip-amber" : ""}`}>
            <Icon className="h-3 w-3" />
            {kind === "cafe" ? "Internet Cafe" : "Playcation Stay"}
          </span>
        </div>

        <div>
          <p className="font-mono text-[0.7rem] uppercase tracking-widest text-mocha">
            // featured: {branchName}
          </p>
          <h3 className="mt-3 font-display text-4xl md:text-5xl lg:text-6xl font-bold leading-[0.9] tracking-tight text-cream">
            {title}
          </h3>
          <p className="mt-4 text-cream-dim text-sm">{caption}</p>
          <div className="mt-8 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cream">
            {cta}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
          </div>
        </div>
      </div>
    </Link>
  );
}
