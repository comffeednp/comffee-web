import { requireFullAdmin } from "@/lib/auth/require-admin";
import { getSiteSettings } from "@/lib/settings";
import { saveSettingsAction } from "../_actions/settings";
import { Save } from "lucide-react";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ ok?: string; error?: string }>;
}

export default async function AdminSettingsPage({ searchParams }: Props) {
  await requireFullAdmin();
  const { ok, error } = await searchParams;
  const settings = await getSiteSettings();

  return (
    <section className="container-edge py-12 max-w-3xl">
      <p className="terminal-label">/settings</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">Site settings</h1>
      <p className="mt-2 text-sm text-cream-dim">
        Company info, contact details, social links. Changes appear on the public site within a few seconds.
      </p>

      {ok && <p className="mt-4 font-mono text-xs text-phosphor">// saved</p>}
      {error && <p className="mt-4 font-mono text-xs text-red-400">// {error}</p>}

      <form action={saveSettingsAction} className="mt-10 space-y-6">
        <Field label="Company name" name="company_name" defaultValue={settings.company_name} />
        <Field label="Tagline" name="tagline" defaultValue={settings.tagline} textarea />
        <Field label="Hero copy (homepage subtext)" name="hero_copy" defaultValue={settings.hero_copy} textarea />
        <Field label="Footer blurb" name="footer_blurb" defaultValue={settings.footer_blurb} textarea />

        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Phone" name="contact_phone" defaultValue={settings.contact_phone} />
          <Field label="Email" name="contact_email" defaultValue={settings.contact_email} type="email" />
        </div>

        <Field label="Address (HQ)" name="address" defaultValue={settings.address} />
        <Field label="Site URL" name="site_url" defaultValue={settings.site_url} />

        <div className="grid gap-5 md:grid-cols-3">
          <Field label="Facebook URL" name="social_facebook" defaultValue={settings.social_facebook} />
          <Field label="Instagram URL" name="social_instagram" defaultValue={settings.social_instagram} />
          <Field label="TikTok URL" name="social_tiktok" defaultValue={settings.social_tiktok} />
        </div>

        <button type="submit" title="Save site settings" className="key-cap key-cap-primary">
          <Save className="h-4 w-4" />
          Save settings
        </button>
      </form>

      <style>{`
        .admin-input {
          width: 100%;
          background: var(--color-bg);
          border: 1px solid var(--color-line-bright);
          border-radius: 0.5rem;
          padding: 0.625rem 0.875rem;
          color: var(--color-cream);
          font-family: var(--font-sans);
          font-size: 0.92rem;
        }
        .admin-input:focus {
          outline: none;
          border-color: var(--color-amber);
          box-shadow: 0 0 0 1px rgba(255,181,71,0.4);
        }
      `}</style>
    </section>
  );
}

function Field({
  label,
  name,
  defaultValue,
  textarea,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  textarea?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-phosphor">
        // {label}
      </span>
      <div className="mt-2">
        {textarea ? (
          <textarea
            name={name}
            defaultValue={defaultValue}
            rows={3}
            className="admin-input resize-y"
          />
        ) : (
          <input
            name={name}
            type={type}
            defaultValue={defaultValue}
            className="admin-input"
          />
        )}
      </div>
    </label>
  );
}
