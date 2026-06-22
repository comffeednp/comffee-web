import Link from "next/link";
import { getAdminScope } from "@/lib/auth/require-admin";
import { listConversations } from "@/lib/chat";
import { listSavedReplies } from "@/lib/saved-replies";
import AdminChatClient from "./AdminChatClient";
import { MessageSquarePlus } from "lucide-react";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ conversation?: string }>;
}

export default async function AdminChatPage({ searchParams }: Props) {
  const { admin, branchId } = await getAdminScope();
  const { conversation } = await searchParams;
  const [conversations, savedReplies] = await Promise.all([
    listConversations(branchId),
    listSavedReplies(branchId),
  ]);

  return (
    <section className="container-edge py-12">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="terminal-label">/chat</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">
            Live chat inbox
          </h1>
          <p className="mt-2 text-sm text-cream-dim">
            Customer messages appear here in real-time. Push notifications fire to your phone when configured.
          </p>
        </div>
        {admin.role !== "partner" && (
          <Link href="/admin/saved-replies" className="inline-flex items-center gap-2 border border-line-bright rounded-md px-4 py-2 font-mono text-xs uppercase tracking-widest text-cream-dim hover:text-amber hover:border-amber">
            <MessageSquarePlus className="h-4 w-4" /> Saved replies
          </Link>
        )}
      </div>

      <div className="mt-10">
        <AdminChatClient
          adminId={admin.id}
          adminName={admin.full_name}
          initialConversations={conversations}
          initialActiveId={conversation ?? null}
          canReply={admin.role !== "partner"}
          savedReplies={savedReplies}
        />
      </div>
    </section>
  );
}
