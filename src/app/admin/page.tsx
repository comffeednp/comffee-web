import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { signInAction } from "./_actions/auth";
import { Lock, Power } from "lucide-react";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function AdminLoginPage({ searchParams }: PageProps) {
  const { error } = await searchParams;
  // If already signed in as admin, jump to dashboard
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: admin } = await supabase
      .from("admin_users")
      .select("id")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (admin) redirect("/admin/dashboard");
  }

  return (
    <div className="container-edge py-20 md:py-32 flex justify-center">
      <div className="w-full max-w-md">
        <div className="border border-line-bright bg-bg-card rounded-xl p-8">
          <div className="flex items-center gap-2.5 mb-2">
            <Lock className="h-4 w-4 text-amber" />
            <p className="terminal-label">admin.login</p>
          </div>
          <h1 className="font-display text-3xl font-bold text-cream tracking-tight">
            Sign in to admin
          </h1>
          <p className="mt-2 text-sm text-cream-dim">
            Restricted to active Comffee staff accounts.
          </p>

          <form action={signInAction} className="mt-8 space-y-5">
            <label className="block">
              <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-phosphor">
                // email
              </span>
              <input
                name="email"
                type="email"
                required
                className="mt-2 admin-input"
                autoComplete="email"
              />
            </label>
            <label className="block">
              <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-phosphor">
                // password
              </span>
              <input
                name="password"
                type="password"
                required
                className="mt-2 admin-input"
                autoComplete="current-password"
              />
            </label>

            {error && (
              <p className="font-mono text-xs text-red-400">// {error.replaceAll("_", " ")}</p>
            )}

            <button type="submit" className="key-cap key-cap-primary w-full justify-center">
              <Power className="h-4 w-4" />
              Sign in
            </button>
          </form>

          <p className="mt-8 font-mono text-[0.65rem] uppercase text-mocha tracking-widest text-center">
            // create admin accounts in Supabase Auth, then add a row in admin_users
          </p>
        </div>

        <style>{`
          .admin-input {
            width: 100%;
            background: var(--color-bg);
            border: 1px solid var(--color-line-bright);
            border-radius: 0.5rem;
            padding: 0.75rem 1rem;
            color: var(--color-cream);
            font-family: var(--font-mono);
            font-size: 0.9rem;
          }
          .admin-input:focus {
            outline: none;
            border-color: var(--color-amber);
            box-shadow: 0 0 0 1px rgba(255,181,71,0.4);
          }
        `}</style>
      </div>
    </div>
  );
}
