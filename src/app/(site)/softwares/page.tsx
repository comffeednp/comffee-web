import type { Metadata } from "next";
import { Download, Monitor, KeyRound, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Software — Comffee POS",
  description:
    "Download Comffee POS — point of sale, live PC seating, staff attendance, and AI assistant for internet cafes.",
};

// Refresh the shown version/link periodically so it tracks the latest published release.
export const revalidate = 300;

// If the control project can't be reached, fall back to the known current installer.
const FALLBACK_URL =
  "https://ipcgytexedrzwoayhvyy.supabase.co/storage/v1/object/public/releases/Comffee-POS-Setup-1.1.0.exe";
const FALLBACK_VERSION = "1.1.0";

// The live release is the single source of truth: publish.js writes the version + Supabase
// installer_url into app_releases (control project, ipcgyt…) and flips is_live. We read it
// server-side with the service key, so the download link is always whatever was last published.
async function getLatestRelease(): Promise<{
  version: string;
  installer_url: string;
  features: string[];
} | null> {
  const url = process.env.LICENSE_SUPABASE_URL;
  const key = process.env.LICENSE_SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(
      `${url.replace(/\/$/, "")}/rest/v1/app_releases?is_live=eq.true&select=version,installer_url,features&order=created_at.desc&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, next: { revalidate: 300 } },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{
      version: string;
      installer_url: string | null;
      features: string[] | null;
    }>;
    const r = rows?.[0];
    if (!r?.installer_url) return null;
    return { version: r.version, installer_url: r.installer_url, features: r.features ?? [] };
  } catch {
    return null;
  }
}

export default async function SoftwaresPage() {
  const rel = await getLatestRelease();
  const version = rel?.version ?? FALLBACK_VERSION;
  const downloadUrl = rel?.installer_url ?? FALLBACK_URL;
  const features = rel?.features ?? [];

  return (
    <section className="container-edge py-24 md:py-32">
      <p className="terminal-label">software</p>
      <h1 className="mt-3 font-display text-4xl md:text-6xl font-bold tracking-tight text-cream max-w-3xl">
        Comffee POS for your cafe.
      </h1>
      <p className="mt-5 max-w-2xl text-cream-dim text-lg leading-relaxed">
        The all-in-one system that runs an internet cafe — point of sale, live PC seating, staff
        attendance, and the Comffee AI assistant. Download it, pick a package, and you&rsquo;re live.
      </p>

      <div className="mt-12 max-w-2xl border border-line-bright bg-bg-card rounded-2xl p-8 md:p-10">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="status-chip status-chip-amber">
            <Monitor className="h-3 w-3" /> Windows
          </span>
          <span className="status-chip">v{version}</span>
        </div>
        <h2 className="mt-5 font-display text-2xl font-bold text-cream">Download Comffee POS</h2>
        <p className="mt-2 text-sm text-cream-dim leading-relaxed">
          Windows 10/11 · 64-bit. After installing, open it and choose{" "}
          <strong className="text-cream">Partner Cafe</strong> to pick a package and pay by QR, or{" "}
          <strong className="text-cream">Comffee Franchise</strong> if you already have a license key.
        </p>
        <a
          href={downloadUrl}
          title={`Download Comffee POS v${version} for Windows`}
          className="key-cap key-cap-primary mt-7 inline-flex"
        >
          <Download className="h-4 w-4" />
          Download for Windows
        </a>

        {features.length > 0 && (
          <div className="mt-8 border-t border-line pt-6">
            <p className="terminal-label">what&rsquo;s_new — v{version}</p>
            <ul className="mt-3 space-y-1.5">
              {features.map((f, i) => (
                <li key={i} className="flex gap-2 text-sm text-cream-dim">
                  <span className="text-amber">›</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-10 grid max-w-3xl gap-5 sm:grid-cols-3">
        {[
          { icon: Monitor, title: "Sales & seating", body: "Point of sale, inventory, and live PC seating in one screen." },
          { icon: ShieldCheck, title: "Staff attendance", body: "Face-scan clock-in with a location check, straight into payroll." },
          { icon: KeyRound, title: "Live in minutes", body: "Pick a package, pay by QR, and your license activates automatically." },
        ].map((it) => {
          const Icon = it.icon;
          return (
            <div key={it.title} className="rounded-xl border border-line-bright bg-bg-card p-5">
              <Icon className="h-6 w-6 text-cream" strokeWidth={1.5} />
              <h3 className="mt-3 text-base font-semibold text-cream">{it.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-cream-dim">{it.body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
