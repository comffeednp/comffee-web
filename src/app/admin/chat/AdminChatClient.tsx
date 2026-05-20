"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Bell, BellOff, Check, Send } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils";
import type { ChatConversation, ChatMessage } from "@/lib/chat";

interface ConversationWithBranch extends ChatConversation {
  branch_name?: string | null;
}

interface Props {
  adminId: string;
  adminName: string;
  initialConversations: ConversationWithBranch[];
  initialActiveId: string | null;
}

export default function AdminChatClient({
  adminId,
  adminName,
  initialConversations,
  initialActiveId,
}: Props) {
  const [conversations, setConversations] =
    useState<ConversationWithBranch[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(
    initialActiveId ?? initialConversations[0]?.id ?? null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load messages whenever active conversation changes
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/admin/chat?conversationId=${activeId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (cancelled) return;
      setMessages(data.messages ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  // Realtime: subscribe to all chat changes (new messages + new conversations)
  useEffect(() => {
    let supabase;
    try {
      supabase = getSupabaseBrowser();
    } catch {
      return;
    }

    const messagesChannel = supabase
      .channel("admin-chat-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload: { new: ChatMessage }) => {
          const m = payload.new;
          if (m.conversation_id === activeId) {
            setMessages((prev) =>
              prev.find((x) => x.id === m.id) ? prev : [...prev, m],
            );
          }
          // Bump the conversation in the sidebar
          setConversations((prev) => {
            const idx = prev.findIndex((c) => c.id === m.conversation_id);
            if (idx === -1) return prev;
            const updated = {
              ...prev[idx],
              last_message_at: m.created_at,
              status: "open",
            };
            const next = [...prev];
            next.splice(idx, 1);
            return [updated, ...next];
          });
        },
      )
      .subscribe();

    const convChannel = supabase
      .channel("admin-chat-conversations")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_conversations" },
        (payload: { new: ChatConversation }) => {
          const c = payload.new;
          setConversations((prev) =>
            prev.find((x) => x.id === c.id) ? prev : [c, ...prev],
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(convChannel);
    };
  }, [activeId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || !activeId || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/admin/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, body: text }),
      });
      if (res.ok) setDraft("");
    } finally {
      setSending(false);
    }
  }, [draft, activeId, sending]);

  const markResolved = async () => {
    if (!activeId) return;
    await fetch("/api/admin/chat/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: activeId }),
    });
    setConversations((prev) =>
      prev.map((c) => (c.id === activeId ? { ...c, status: "resolved" } : c)),
    );
  };

  // Push notifications enable/disable
  const togglePush = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      alert("This browser doesn't support push notifications.");
      return;
    }
    if (Notification.permission === "granted") {
      setPushEnabled(true);
      return;
    }
    if (Notification.permission === "denied") {
      alert("Notifications are blocked. Enable them in your browser settings.");
      return;
    }
    const result = await Notification.requestPermission();
    if (result === "granted") {
      setPushEnabled(true);
      // Register the FCM token (only works if FCM is configured)
      try {
        await fetch("/api/admin/fcm/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceLabel: navigator.userAgent.slice(0, 80),
          }),
        });
      } catch {}
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPushEnabled(Notification.permission === "granted");
    }
  }, []);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr] h-[calc(100vh-22rem)] min-h-[500px]">
      {/* SIDEBAR */}
      <aside className="border border-line-bright bg-bg-card rounded-xl overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-line bg-bg-soft flex items-center justify-between">
          <span className="font-mono text-[0.7rem] uppercase tracking-widest text-cream-dim">
            // {conversations.length} conversations
          </span>
          <button
            type="button"
            onClick={togglePush}
            className={`flex items-center gap-1 font-mono text-[0.65rem] uppercase tracking-widest border rounded-md px-2 py-1 ${
              pushEnabled
                ? "border-phosphor/50 text-phosphor"
                : "border-line-bright text-cream-dim hover:text-amber"
            }`}
            title={pushEnabled ? "Push enabled" : "Enable push"}
          >
            {pushEnabled ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
            {pushEnabled ? "ON" : "Push"}
          </button>
        </div>
        <ul className="overflow-y-auto flex-1 divide-y divide-line">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setActiveId(c.id)}
                className={`w-full text-left px-4 py-3 transition ${
                  c.id === activeId
                    ? "bg-bg-elev border-l-2 border-amber"
                    : "hover:bg-bg-elev/40 border-l-2 border-transparent"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-cream font-medium truncate">
                    {c.customer_name ?? "Anonymous"}
                  </span>
                  {c.status === "resolved" ? (
                    <Check className="h-3 w-3 text-phosphor shrink-0" />
                  ) : c.status === "open" ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-amber shrink-0" />
                  ) : null}
                </div>
                {(c as ConversationWithBranch).branch_name && (
                  <p className="font-mono text-[0.6rem] uppercase tracking-widest text-amber mt-0.5 truncate">
                    {(c as ConversationWithBranch).branch_name}
                  </p>
                )}
                <p className="font-mono text-[0.65rem] text-mocha mt-0.5">
                  {formatDateTime(c.last_message_at)}
                </p>
              </button>
            </li>
          ))}
          {conversations.length === 0 && (
            <li className="px-4 py-8 font-mono text-xs text-mocha text-center">
              // no conversations yet
            </li>
          )}
        </ul>
      </aside>

      {/* THREAD */}
      <div className="border border-line-bright bg-bg-card rounded-xl overflow-hidden flex flex-col">
        {active ? (
          <>
            <div className="px-5 py-3 border-b border-line bg-bg-soft flex items-center justify-between">
              <div>
                <p className="font-display text-base font-semibold text-cream">
                  {active.customer_name ?? "Anonymous"}
                </p>
                <p className="font-mono text-[0.65rem] text-mocha mt-0.5">
                  {(active as ConversationWithBranch).branch_name
                    ? `${(active as ConversationWithBranch).branch_name} · `
                    : ""}
                  {active.customer_email ?? active.customer_phone ?? "no contact"}
                </p>
              </div>
              {active.status !== "resolved" && (
                <button
                  type="button"
                  onClick={markResolved}
                  className="flex items-center gap-1.5 border border-phosphor/40 rounded-md px-3 py-1.5 text-[0.7rem] font-mono uppercase tracking-widest text-phosphor hover:bg-phosphor/10"
                >
                  <Check className="h-3 w-3" />
                  Mark resolved
                </button>
              )}
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${
                    m.sender_type === "admin" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[75%] px-3 py-2 rounded-lg text-sm ${
                      m.sender_type === "admin"
                        ? "bg-amber text-bg"
                        : m.sender_type === "customer"
                        ? "bg-bg-elev border border-line-bright text-cream"
                        : "bg-transparent text-mocha font-mono text-xs"
                    }`}
                  >
                    {m.body}
                  </div>
                </motion.div>
              ))}
              {messages.length === 0 && (
                <p className="font-mono text-xs text-mocha text-center py-8">
                  // no messages yet
                </p>
              )}
            </div>

            <div className="border-t border-line p-4 flex gap-2">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={`Reply as ${adminName}…`}
                className="flex-1 bg-bg border border-line-bright rounded-md px-3 py-2 text-sm text-cream focus:outline-none focus:border-amber"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !draft.trim()}
                className="flex h-10 px-4 items-center gap-2 bg-amber text-bg rounded-md disabled:opacity-40 font-mono text-xs uppercase tracking-widest"
              >
                <Send className="h-3.5 w-3.5" />
                Send
              </button>
            </div>
            {/* placeholder use of adminId to satisfy TS */}
            <input type="hidden" value={adminId} readOnly />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center font-mono text-xs text-mocha">
            // pick a conversation
          </div>
        )}
      </div>
    </div>
  );
}
