import { requireAdmin } from "@/lib/auth/require-admin";
import { listConversations } from "@/lib/chat";
import AdminChatClient from "./AdminChatClient";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ conversation?: string }>;
}

export default async function AdminChatPage({ searchParams }: Props) {
  const admin = await requireAdmin();
  const { conversation } = await searchParams;
  const conversations = await listConversations();

  return (
    <section className="container-edge py-12">
      <p className="terminal-label">/chat</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-cream tracking-tight">
        Live chat inbox
      </h1>
      <p className="mt-2 text-sm text-cream-dim">
        Customer messages appear here in real-time. Push notifications fire to your phone when configured.
      </p>

      <div className="mt-10">
        <AdminChatClient
          adminId={admin.id}
          adminName={admin.full_name}
          initialConversations={conversations}
          initialActiveId={conversation ?? null}
        />
      </div>
    </section>
  );
}
