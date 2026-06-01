"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Send, ChevronDown, ChevronUp } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";

// Always-on staff chat panel for the clock-in page (2026-06-01). A customer messaging from the booking
// page creates a branch-tagged conversation; the on-duty cashier sees and answers it HERE (the owner
// also sees it in /admin/chat — same thread, one voice). Mounted only while the staffer is clocked in.
//
// WHY a poll + a realtime nudge (mirrors the live-QR card's proven pattern in AttendanceClient): the
// cafe's uplink drops the Supabase realtime socket, so a pure push would silently miss messages. We
// poll the branch list every 6s as the reliable floor and use realtime only as an instant "re-read now"
// nudge. All decisions live in refresh() so the two paths can't disagree.

interface Conversation {
  id: string;
  customer_name: string | null;
  last_message_body: string | null;
  last_message_sender_type: string | null;
  last_message_at: string;
  unread: boolean;
}

interface Message {
  id: string;
  sender_type: "customer" | "admin" | "system";
  body: string;
  created_at: string;
}

export default function StaffChatPanel({ slug }: { slug: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const unreadCount = conversations.filter((c) => c.unread).length;

  // Pull the branch's conversation list (scoped server-side to this branch + on-duty check).
  const refreshList = useCallback(async () => {
    try {
      const res = await fetch(`/api/partners/${slug}/chat`, { cache: "no-store" });
      if (!res.ok) return;
      const d = await res.json();
      if (Array.isArray(d.conversations)) setConversations(d.conversations as Conversation[]);
    } catch {
      /* transient — next tick retries */
    }
  }, [slug]);

  // Load one conversation's messages (also marks it seen server-side).
  const openConversation = useCallback(async (id: string) => {
    setActiveId(id);
    setMessages([]);
    try {
      const res = await fetch(`/api/partners/${slug}/chat?conversationId=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!res.ok) return;
      const d = await res.json();
      if (Array.isArray(d.messages)) setMessages(d.messages as Message[]);
      // It's now seen → clear its unread dot locally (the next list poll confirms).
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: false } : c)));
    } catch {
      /* ignore */
    }
  }, [slug]);

  // Reliable floor: poll the list every 6s. Immediately on mount too.
  useEffect(() => {
    refreshList();
    const t = setInterval(refreshList, 6000);
    return () => clearInterval(t);
  }, [refreshList]);

  // Instant nudge: any new chat message → re-read the list, and if it's the open thread, re-read it.
  useEffect(() => {
    let supabase;
    try { supabase = getSupabaseBrowser(); } catch { return; }
    const channel = supabase
      .channel(`staff-chat:${slug}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload: { new: Message & { conversation_id?: string } }) => {
          refreshList();
          const cid = payload.new.conversation_id;
          if (cid && cid === activeIdRef.current) {
            setMessages((prev) => (prev.find((x) => x.id === payload.new.id) ? prev : [...prev, payload.new]));
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [slug, refreshList]);

  // Keep the thread scrolled to the newest message.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !activeId || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/partners/${slug}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, body: text }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.message) setMessages((prev) => (prev.find((x) => x.id === d.message.id) ? prev : [...prev, d.message]));
        setDraft("");
      }
      // else: keep the draft so the staffer can retry — never silently swallow a failed send.
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed bottom-5 left-5 z-50 w-[min(92vw,20rem)] rounded-2xl border border-line-bright bg-bg-elev/95 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur overflow-hidden">
      {/* Header — tap to collapse/expand */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Show customer messages" : "Hide customer messages"}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-bg-soft"
      >
        <span className="flex items-center gap-2 font-display text-sm font-bold text-cream">
          <MessageSquare className="h-4 w-4 text-amber" />
          Customer messages
          {unreadCount > 0 && (
            <span className="ml-1 h-5 min-w-5 px-1.5 rounded-full bg-amber text-bg flex items-center justify-center font-mono text-[0.65rem] font-bold">
              {unreadCount}
            </span>
          )}
        </span>
        {collapsed ? <ChevronUp className="h-4 w-4 text-cream-dim" /> : <ChevronDown className="h-4 w-4 text-cream-dim" />}
      </button>

      {!collapsed && (
        <div className="h-[22rem] flex flex-col">
          {activeId ? (
            // ---- Thread view ----
            <>
              <button
                type="button"
                onClick={() => { setActiveId(null); setMessages([]); refreshList(); }}
                title="Back to all messages"
                className="px-4 py-2 text-left font-mono text-[0.65rem] uppercase tracking-widest text-cream-dim hover:text-amber border-b border-line"
              >
                ‹ all messages
              </button>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
                {messages.length === 0 ? (
                  <p className="text-center text-[0.7rem] text-mocha py-6">No messages yet.</p>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={`flex ${m.sender_type === "customer" ? "justify-start" : "justify-end"}`}>
                      <div
                        className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                          m.sender_type === "customer"
                            ? "bg-bg-card border border-line text-cream"
                            : m.sender_type === "admin"
                              ? "bg-amber text-bg"
                              : "bg-transparent text-mocha font-mono text-[0.7rem]"
                        }`}
                      >
                        {m.body}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t border-line p-2 flex gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder="Reply to the customer…"
                  className="flex-1 bg-bg border border-line-bright rounded-md px-3 py-2 text-sm text-cream focus:outline-none focus:border-amber"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={sending || !draft.trim()}
                  title="Send reply"
                  className="flex h-10 w-10 items-center justify-center bg-amber text-bg rounded-md disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : (
            // ---- List view ----
            <ul className="flex-1 overflow-y-auto divide-y divide-line">
              {conversations.length === 0 ? (
                <li className="p-6 text-center text-[0.72rem] text-mocha">
                  No customer messages yet. When someone messages from the booking page, it shows here.
                </li>
              ) : (
                conversations.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => openConversation(c.id)}
                      title={`Open chat with ${c.customer_name ?? "customer"}`}
                      className={`w-full text-left px-4 py-3 transition ${c.unread ? "bg-amber/10 hover:bg-amber/15" : "hover:bg-bg-card/50"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm truncate ${c.unread ? "text-cream font-bold" : "text-cream font-medium"}`}>
                          {c.customer_name ?? "Customer"}
                        </span>
                        {c.unread && <span className="h-2 w-2 rounded-full bg-amber animate-pulse shrink-0" />}
                      </div>
                      <p className="text-[0.72rem] text-cream-dim truncate mt-0.5">
                        {c.last_message_sender_type === "customer" ? "" : "You: "}
                        {c.last_message_body ?? "…"}
                      </p>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
