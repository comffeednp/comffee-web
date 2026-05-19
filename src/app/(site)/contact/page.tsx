import type { Metadata } from "next";
import { getPublishedBranches } from "@/lib/branches";
import { getSiteSettings } from "@/lib/settings";
import ContactForm from "@/components/site/ContactForm";
import Reveal from "@/components/site/Reveal";
import { Mail, MapPin, Phone } from "lucide-react";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with Comffee Drink and Play. Reservations, questions, partnerships.",
};

export default async function ContactPage() {
  const [branches, settings] = await Promise.all([
    getPublishedBranches(),
    getSiteSettings(),
  ]);

  return (
    <>
      <section className="relative py-20 md:py-28 border-b border-line bg-bg-soft overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
        <div className="container-edge relative">
          <p className="terminal-label">/contact</p>
          <h1 className="mt-4 font-display text-5xl md:text-7xl font-bold leading-[0.9] tracking-tight text-cream">
            Send a signal.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-cream-dim">
            Reservations, questions, partnerships — we read everything. Reply within a few hours during operating time.
          </p>
        </div>
      </section>

      <section className="container-edge py-20 md:py-28 grid gap-12 lg:grid-cols-[2fr_1fr]">
        <Reveal>
          <ContactForm
            branches={branches.map((b) => ({ id: b.id, name: b.name }))}
          />
        </Reveal>

        <Reveal delay={0.1}>
          <aside className="space-y-8">
            <div>
              <p className="terminal-label">direct_line</p>
              <ul className="mt-5 space-y-4 text-cream-dim">
                {settings.contact_phone && (
                  <li className="flex items-start gap-3">
                    <Phone className="h-4 w-4 text-amber mt-1" />
                    <a href={`tel:${settings.contact_phone}`} className="hover:text-amber transition">
                      {settings.contact_phone}
                    </a>
                  </li>
                )}
                {settings.contact_email && (
                  <li className="flex items-start gap-3">
                    <Mail className="h-4 w-4 text-amber mt-1" />
                    <a href={`mailto:${settings.contact_email}`} className="hover:text-amber transition">
                      {settings.contact_email}
                    </a>
                  </li>
                )}
                {settings.address && (
                  <li className="flex items-start gap-3">
                    <MapPin className="h-4 w-4 text-amber mt-1" />
                    <span>{settings.address}</span>
                  </li>
                )}
              </ul>
            </div>

            <div className="border border-line-bright rounded-xl p-5 bg-bg-card">
              <p className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-phosphor">
                // response time
              </p>
              <p className="mt-3 text-sm text-cream-dim leading-relaxed">
                We aim to reply within a few hours during operating time. Live chat and instant booking are coming in v2.
              </p>
            </div>
          </aside>
        </Reveal>
      </section>
    </>
  );
}
