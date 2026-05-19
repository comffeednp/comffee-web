import Link from "next/link";
import { getMemberOptional } from "@/lib/auth/require-member";
import { memberSignOutAction } from "./_actions/auth";
import { LogOut, User } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const member = await getMemberOptional();

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {member && (
        <div className="border-b border-line bg-bg-soft">
          <div className="container-edge h-12 flex items-center justify-between">
            <Link
              href="/account"
              className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cream hover:text-amber"
            >
              <User className="h-3.5 w-3.5 text-amber" />
              {member.full_name}
              {member.member_number && (
                <span className="text-mocha">· {member.member_number}</span>
              )}
            </Link>
            <form action={memberSignOutAction}>
              <button
                type="submit"
                className="flex items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-widest text-cream-dim hover:text-amber"
              >
                <LogOut className="h-3 w-3" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
