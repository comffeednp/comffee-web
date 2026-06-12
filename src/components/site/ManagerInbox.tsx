"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";

// Site-wide branch chat inbox for CHAT MANAGERS (2026-06-12) — the full-page
// sibling of the staff clock-in panel (StaffChatPanel). Same proven transport:
// a 6s list poll as the reliable floor + a realtime nudge for instant updates.
// Everything is scoped server-side by /api/branch-inbox (branch_chat_managers);
// this component renders only what the caller's branches may see.

interface Conversation {
  id: string;
  customer_name: string | null;
  branch_name?: string | null;
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

export default function ManagerInbox({ multiBranch }: { multiBranch: boolean }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const refreshList = useCallback(async () => {
    try {
      const res = await fetch(`/api/branch-inbox`, { cache: "no-store" });
      if (!res.ok) return;
      const d = await res.json();
      if (Array.isArray(d.conversations)) setConversations(d.conversations as Conversation[]);
    } catch {
      /* transient — next tick retries */
    }
  }, []);

  const openConversation = useCallback(async (id: string) => {
    setActiveId(id);
    setMessages([]);
    try {
      const res = await fetch(`/api/branch-inbox?conversationId=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!res.ok) return;
      const d = await res.json();
      if (Array.isArray(d.messages)) setMessages(d.messages as Message[]);
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: false } : c)));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refreshList();
    const t = setInterval(refreshList, 6000);
    return () => clearInterval(t);
  }, [refreshList]);

  useEffect(() => {
    let supabase;
    try { supabase = getSupabaseBrowser(); } catch { return; }
    const channel = supabase
      .channel(`manager-inbox`)
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
  }, [refreshList]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !activeId || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/branch-inbox`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, body: text }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.message) setMessages((prev) => (prev.find((x) => x.id === d.message.id) ? prev : [...prev, d.message]));
        setDraft("");
      }
      // else: keep the draft so the manager can retry — never silently swallow a failed send.
    } finally {
      setSending(false);
    }
  };

  const active = conversations.find((c) => c.id === activeId) ?? null;

  return (
    <div className="grid md:grid-cols-[18rem_1fr] gap-0 rounded-2xl border border-line-bright bg-bg-elev overflow-hidden min-h-[28rem]">
      {/* Conversation list */}
      <ul className={`overflow-y-auto divide-y divide-line border-line md:border-r max-h-[34rem] ${activeId ? "hidden md:block" : ""}`}>
        {conversations.length === 0 ? (
          <li className="p-6 text-center text-[0.72rem] text-mocha">
            No customer messages yet. When someone messages your branch from its page, it shows here.
          </li>
        ) : (
          conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => openConversation(c.id)}
                title={`Open chat with ${c.customer_name ?? "customer"}`}
                className={`w-full text-left px-4 py-3 transition ${c.id === activeId ? "bg-bg-card" : c.unread ? "bg-amber/10 hover:bg-amber/15" : "hover:bg-bg-card/50"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm truncate ${c.unread ? "text-cream font-bold" : "text-cream font-medium"}`}>
                    {c.customer_name ?? "Customer"}
                  </span>
                  {c.unread && <span className="h-2 w-2 rounded-full bg-amber animate-pulse shrink-0" />}
                </div>
                {multiBranch && c.branch_name && (
                  <p className="font-mono text-[0.6rem] uppercase tracking-widest text-amber/80 mt-0.5">{c.branch_name}</p>
                )}
                <p className="text-[0.72rem] text-cream-dim truncate mt-0.5">
                  {c.last_message_sender_type === "customer" ? "" : "You: "}
                  {c.last_message_body ?? "…"}
                </p>
              </button>
            </li>
          ))
        )}
      </ul>

      {/* Thread */}
      <div className="flex flex-col min-h-[28rem]">
        {activeId ? (
          <>
            <div className="px-4 py-3 border-b border-line flex items-center gap-3">
              <button
                type="button"
                onClick={() => { setActiveId(null); setMessages([]); refreshList(); }}
                title="Back to all messages"
                className="md:hidden font-mono text-[0.65rem] uppercase tracking-widest text-cream-dim hover:text-amber"
              >
                ‹ back
              </button>
              <span className="font-display text-sm font-bold text-cream truncate">
                {active?.customer_name ?? "Customer"}
              </span>
              {multiBranch && active?.branch_name && (
                <span className="font-mono text-[0.6rem] uppercase tracking-widest text-amber/80">{active.branch_name}</span>
              )}
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[26rem]">
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
            <div className="border-t border-line p-3 flex gap-2">
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
          <div className="flex-1 hidden md:flex items-center justify-center text-mocha gap-2 text-sm">
            <MessageSquare className="h-4 w-4" /> Pick a conversation
          </div>
        )}
      </div>
    </div>
  );
}
