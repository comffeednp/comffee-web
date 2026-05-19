import Link from "next/link";
import Image from "next/image";
import type { SiteSettings } from "@/lib/settings";
import { Mail, MapPin, Phone } from "lucide-react";

export default function Footer({ settings }: { settings: SiteSettings }) {
  const year = new Date().getFullYear();
  return (
    <footer className="relative border-t border-line bg-bg-soft mt-32">
      <div className="container-edge py-16 grid gap-12 md:grid-cols-4">
        {/* Brand */}
        <div className="md:col-span-2">
          <div className="flex items-center gap-3">
            <Image
              src="/comffee-logo.png"
              alt={settings.company_name}
              width={44}
              height={44}
              className="h-11 w-11 object-contain"
            />
            <span className="font-display text-base font-bold tracking-tight text-cream">
              {settings.company_name}
            </span>
          </div>
          <p className="mt-5 max-w-md text-cream-dim text-sm leading-relaxed">
            {settings.footer_blurb}
          </p>
          <div className="mt-6 flex items-center gap-2">
            {settings.social_facebook && (
              <a
                href={settings.social_facebook}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[0.7rem] uppercase tracking-[0.18em] border border-line-bright rounded-md px-3 py-1.5 text-cream-dim hover:text-cream hover:border-cream transition-colors"
                aria-label="Facebook"
              >
                /FB
              </a>
            )}
            {settings.social_instagram && (
              <a
                href={settings.social_instagram}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[0.7rem] uppercase tracking-[0.18em] border border-line-bright rounded-md px-3 py-1.5 text-cream-dim hover:text-cream hover:border-cream transition-colors"
                aria-label="Instagram"
              >
                /IG
              </a>
            )}
            {settings.social_tiktok && (
              <a
                href={settings.social_tiktok}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[0.7rem] uppercase tracking-[0.18em] border border-line-bright rounded-md px-3 py-1.5 text-cream-dim hover:text-cream hover:border-cream transition-colors"
                aria-label="TikTok"
              >
                /TT
              </a>
            )}
          </div>
        </div>

        {/* Navigate */}
        <div>
          <p className="terminal-label">Navigate</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link href="/" className="text-cream hover:underline">Home</Link></li>
            <li><Link href="/branches" className="text-cream hover:underline">All Branches</Link></li>
            <li><Link href="/playcation" className="text-cream hover:underline">Playcation Stays</Link></li>
            <li><Link href="/menu" className="text-cream hover:underline">Menu</Link></li>
            <li><Link href="/about" className="text-cream hover:underline">About Us</Link></li>
            <li><Link href="/contact" className="text-cream hover:underline">Contact</Link></li>
            <li><Link href="/lookup" className="text-cream hover:underline">Look up an order</Link></li>
          </ul>
        </div>

        {/* Contact */}
        <div>
          <p className="terminal-label">Reach us</p>
          <ul className="mt-4 space-y-3 text-sm text-cream-dim">
            {settings.contact_phone && (
              <li className="flex items-start gap-2">
                <Phone className="h-4 w-4 mt-0.5 text-cream" />
                <span>{settings.contact_phone}</span>
              </li>
            )}
            {settings.contact_email && (
              <li className="flex items-start gap-2">
                <Mail className="h-4 w-4 mt-0.5 text-cream" />
                <span>{settings.contact_email}</span>
              </li>
            )}
            {settings.address && (
              <li className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 text-cream" />
                <span>{settings.address}</span>
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="container-edge py-5 flex flex-col md:flex-row gap-2 items-center justify-between font-mono text-[0.7rem] uppercase tracking-[0.18em] text-mocha">
          <span>// © {year} {settings.company_name} — all rights reserved</span>
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-phosphor animate-pulse" />
            System online
          </span>
        </div>
      </div>
    </footer>
  );
}
