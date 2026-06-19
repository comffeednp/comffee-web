import Link from "next/link";
import Image from "next/image";
import type { SiteSettings } from "@/lib/settings";
import { User } from "lucide-react";
import CartButton from "@/components/cart/CartButton";
import MobileNav from "@/components/site/MobileNav";
import NavDropdown from "@/components/site/NavDropdown";
import { navLinks } from "@/lib/nav";
import { getMemberOptional } from "@/lib/auth/require-member";

export default async function Header({ settings }: { settings: SiteSettings }) {
  const name = settings?.company_name ?? "Comffee Drink and Play";
  const member = await getMemberOptional();
  const memberHref = member ? "/account" : "/account/login";
  const memberLabel = member ? `Account · ${member.full_name.split(" ")[0]}` : "Sign in";

  return (
    <header className="sticky top-0 z-50 border-b border-line/80 bg-bg backdrop-blur supports-[backdrop-filter]:bg-[rgba(10,8,7,0.88)]">
      <div className="container-edge flex items-center justify-between h-16 gap-3">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group shrink-0" aria-label={name}>
          <Image
            src="/comffee-logo-trimmed.png"
            alt={name}
            width={506}
            height={642}
            priority
            style={{ height: 28, width: "auto", filter: "invert(1) sepia(1) saturate(3) hue-rotate(350deg) brightness(1.1)" }}
            className="shrink-0"
          />
          <div className="leading-none hidden sm:block">
            <div className="font-display text-[1.05rem] font-bold tracking-tight text-cream">Comffee</div>
            <div className="font-mono text-[0.58rem] uppercase tracking-[0.2em] text-mocha">Drink and Play</div>
          </div>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) =>
            link.children ? (
              <NavDropdown key={link.label} label={link.label} items={link.children} />
            ) : link.highlight ? (
              <Link
                key={link.href}
                href={link.href!}
                title={`Go to ${link.label}`}
                className="nav-shine font-mono text-xs uppercase tracking-[0.18em] px-3 py-2 ml-1 focus-visible:outline-none"
              >
                {link.label}
              </Link>
            ) : (
              <Link
                key={link.href}
                href={link.href!}
                title={`Go to ${link.label}`}
                className="font-mono text-xs uppercase tracking-[0.18em] text-cream-dim hover:text-cream px-3 py-2 transition-colors focus-visible:outline-none rounded"
              >
                {link.label}
              </Link>
            )
          )}
        </nav>

        {/* Right cluster */}
        <div className="flex items-center gap-3">
          <CartButton />
          <Link
            href={memberHref}
            className="hidden sm:flex h-10 px-3 items-center gap-2 border border-line-bright bg-bg rounded-md font-mono text-[0.7rem] uppercase tracking-widest text-cream-dim hover:text-cream hover:border-cream transition"
            aria-label={memberLabel}
          >
            <User className="h-3.5 w-3.5" />
            {member ? member.full_name.split(" ")[0] : "Sign in"}
          </Link>
          <Link
            href="/playcation"
            title="Book a Playcation stay"
            className="key-cap key-cap-primary !py-2 !px-4 hidden md:inline-flex"
          >
            Book Playcation
          </Link>
          <MobileNav links={navLinks} memberHref={memberHref} memberLabel={memberLabel} />
        </div>
      </div>
    </header>
  );
}
