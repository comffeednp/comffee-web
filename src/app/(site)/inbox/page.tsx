import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { managerBranchIds } from "@/lib/chat-access";
import ManagerInbox from "@/components/site/ManagerInbox";

export const dynamic = "force-dynamic";

// Branch chat inbox for CHAT MANAGERS (2026-06-12). The partner cafe's admin
// lists manager emails in Clockwork Settings -> "Website chat managers"; that
// list syncs to branch_chat_managers. When one of those emails is signed in
// here (Google), they see their branch's website conversations site-wide.
// Authorization happens BOTH here (page gate) and on every /api/branch-inbox
// call (the real enforcement) — this page is just the front door.
export default async function InboxPage() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/account/login?next=/inbox");

  const admin = getSupabaseAdmin();
  const branchIds = await managerBranchIds(admin, user.email);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-2xl font-bold text-cream mb-1">Branch inbox</h1>
      <p className="text-sm text-cream-dim mb-6">
        Customer messages from your branch&apos;s page on comffee.org.
      </p>
      {branchIds.length === 0 ? (
        <div className="rounded-2xl border border-line-bright bg-bg-elev p-8 text-center">
          <p className="text-cream font-medium mb-2">This account isn&apos;t a chat manager yet.</p>
          <p className="text-sm text-cream-dim">
            Ask your cafe&apos;s admin to add <span className="text-amber">{user.email}</span> under{" "}
            <span className="text-cream">Settings → Website chat managers</span> in Comffee Clockwork,
            then reload this page.
          </p>
        </div>
      ) : (
        <ManagerInbox multiBranch={branchIds.length > 1} />
      )}
    </div>
  );
}
