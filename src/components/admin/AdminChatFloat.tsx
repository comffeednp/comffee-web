"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, Loader2, MessageSquare, Send, X } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { formatDateTime } from "@/lib/utils";
import type { ChatConversation, ChatMessage } from "@/lib/chat";

interface ConversationWithBranch extends ChatConversation {
  branch_name?: string | null;
}

interface Props {
  adminId: string;
  adminName: string;
}

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

function Avatar({ url, name, size = 8 }: { url?: string | null; name?: string | null; size?: number }) {
  const cls = `h-${size} w-${size} rounded-full shrink-0 object-cover`;
  if (url) return <img src={url} alt="" className={cls} />;
  return (
    <div className={`h-${size} w-${size} rounded-full shrink-0 bg-bg-elev border border-line-bright flex items-center justify-center`}>
      <span className="font-mono text-xs text-mocha">{(name ?? "?")[0].toUpperCase()}</span>
    </div>
  );
}

export default function AdminChatFloat({ adminName }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "thread">("list");
  const [conversations, setConversations] = useState<ConversationWithBranch[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const [unreadConvs, setUnreadConvs] = useState<Map<string, string>>(new Map());
  const [customerTyping, setCustomerTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const broadcastChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<number>(0);

  const fetchConversations = () => {
    fetch("/api/admin/chat")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d?.conversations) return;
        setConversations(d.conversations);
        setUnread(d.conversations.filter((c: ChatConversation) => c.status === "open").length);
      })
      .catch(() => {});
  };

  // Fetch on mount and whenever panel opens
  useEffect(() => { fetchConversations(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) fetchConversations(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: new messages + new conversations
  useEffect(() => {
    let supabase;
    try { supabase = getSupabaseBrowser(); } catch { return; }

    const msgChannel = supabase
      .channel("admin-float-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload: { new: ChatMessage }) => {
          const m = payload.new;
          if (m.conversation_id === activeId) {
            setMessages((prev) => prev.find((x) => x.id === m.id) ? prev : [...prev, m]);
          }
          if (m.sender_type === "customer") {
            setUnread((u) => u + 1);
            if (m.conversation_id !== activeId) {
              setUnreadConvs((prev) => new Map(prev).set(m.conversation_id, m.body));
            }
          }
          setConversations((prev) => {
            const idx = prev.findIndex((c) => c.id === m.conversation_id);
            if (idx === -1) {
              fetchConversations();
              return prev;
            }
            const updated = { ...prev[idx], last_message_at: m.created_at, status: "open", last_message_body: m.body, last_message_sender_type: m.sender_type };
            const next = [...prev];
            next.splice(idx, 1);
            return [updated, ...next];
          });
        },
      )
      .subscribe();

    const convChannel = supabase
      .channel("admin-float-conversations")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_conversations" },
        (payload: { new: ChatConversation }) => {
          const c = payload.new;
          setConversations((prev) => prev.find((x) => x.id === c.id) ? prev : [c, ...prev]);
          setUnread((u) => u + 1);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(convChannel);
    };
  }, [activeId]);

  // Broadcast read + subscribe to customer typing when conversation changes
  useEffect(() => {
    if (!activeId) return;
    let supabase;
    try { supabase = getSupabaseBrowser(); } catch { return; }

    const channel = supabase
      .channel(`chat:${activeId}`)
      .on("broadcast", { event: "typing" }, (payload: { payload?: { from?: string } }) => {
        if (payload.payload?.from === "customer") {
          setCustomerTyping(true);
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
          typingTimerRef.current = setTimeout(() => setCustomerTyping(false), 3000);
        }
      })
      .subscribe(() => {
        channel.send({ type: "broadcast", event: "read", payload: { by: "admin" } });
      });

    broadcastChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      broadcastChannelRef.current = null;
      setCustomerTyping(false);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [activeId]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    let cancelled = false;
    setMessages([]);
    setMessagesLoading(true);
    (async () => {
      const res = await fetch(`/api/admin/chat?conversationId=${activeId}`);
      if (!res.ok) { if (!cancelled) setMessagesLoading(false); return; }
      const data = await res.json();
      if (cancelled) return;
      setMessages(data.messages ?? []);
      setMessagesLoading(false);
    })();
    return () => { cancelled = true; };
  }, [activeId]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Clear unread when panel is opened
  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  const selectConversation = (id: string) => {
    setActiveId(id);
    setView("thread");
    setUnreadConvs((prev) => { const n = new Map(prev); n.delete(id); return n; });
  };

  const sendTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1500) return;
    lastTypingSentRef.current = now;
    broadcastChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { from: "admin" } });
  }, []);

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
      if (res.ok) {
        const data = await res.json() as { message?: ChatMessage };
        setDraft("");
        if (data.message) {
          setMessages((prev) =>
            prev.find((x) => x.id === data.message!.id) ? prev : [...prev, data.message!]
          );
          broadcastChannelRef.current?.send({
            type: "broadcast",
            event: "message",
            payload: { message: data.message },
          });
          setConversations((prev) => {
            const idx = prev.findIndex((c) => c.id === activeId);
            if (idx === -1) return prev;
            const updated = { ...prev[idx], last_message_body: data.message!.body, last_message_sender_type: "admin" };
            const next = [...prev];
            next[idx] = updated;
            return next;
          });
        }
      }
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
    setConversations((prev) => prev.map((c) => (c.id === activeId ? { ...c, status: "resolved" } : c)));
  };

  const active = conversations.find((c) => c.id === activeId) ?? null;

  return (
    <>
      {/* Floating toggle button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle chat inbox"
        className="fixed bottom-5 right-5 z-[200] flex h-14 w-14 items-center justify-center rounded-full border border-amber/50 bg-bg-card shadow-xl hover:scale-105 transition-transform"
      >
        {open ? <X className="h-5 w-5 text-amber" /> : <MessageSquare className="h-5 w-5 text-amber" />}
        <AnimatePresence>
          {!open && unread > 0 && (
            <motion.span
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-rgb-r text-bg flex items-center justify-center font-mono text-[0.65rem] font-bold"
            >
              {unread}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* Floating panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="fixed bottom-24 right-5 z-[200] w-[22rem] h-[28rem] border border-line-bright bg-bg-card rounded-xl shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-line bg-bg-soft flex items-center justify-between shrink-0">
              {view === "thread" && active ? (
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => setView("list")}
                    className="text-cream-dim hover:text-amber shrink-0"
                    aria-label="Back to list"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                  <Avatar url={active.customer_avatar_url} name={active.customer_name} size={7} />
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-cream truncate">{active.customer_name ?? "Anonymous"}</p>
                    {(active as ConversationWithBranch).branch_name && (
                      <p className="font-mono text-[0.6rem] text-amber truncate">{(active as ConversationWithBranch).branch_name}</p>
                    )}
                    {active.inquiry_check_in && active.inquiry_check_out && (
                      <p className="font-mono text-[0.6rem] text-mocha truncate">
                        {fmtDate(active.inquiry_check_in)} – {fmtDate(active.inquiry_check_out)}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <span className="font-mono text-[0.7rem] uppercase tracking-widest text-cream-dim">
                  // inbox · {conversations.length}
                </span>
              )}
              {view === "thread" && active && active.status !== "resolved" && (
                <button
                  type="button"
                  onClick={markResolved}
                  className="flex items-center gap-1 border border-phosphor/40 rounded px-2 py-1 font-mono text-[0.6rem] uppercase tracking-widest text-phosphor hover:bg-phosphor/10 shrink-0"
                >
                  <Check className="h-3 w-3" />
                  Resolve
                </button>
              )}
            </div>

            {/* Body */}
            {view === "list" ? (
              <ul className="flex-1 overflow-y-auto divide-y divide-line">
                {conversations.map((c) => {
                  const isUnread = unreadConvs.has(c.id);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => selectConversation(c.id)}
                        className={`w-full text-left px-4 py-3 transition ${
                          isUnread ? "bg-amber/5 hover:bg-amber/10" : "hover:bg-bg-elev/40"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <Avatar url={c.customer_avatar_url} name={c.customer_name} size={8} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-sm truncate ${isUnread ? "text-cream font-semibold" : "text-cream font-medium"}`}>
                                {c.customer_name ?? "Anonymous"}
                              </span>
                              {c.status === "resolved" ? (
                                <Check className="h-3 w-3 text-phosphor shrink-0" />
                              ) : isUnread ? (
                                <span className="h-2 w-2 rounded-full bg-amber animate-pulse shrink-0" />
                              ) : null}
                            </div>
                            {(c as ConversationWithBranch).branch_name && (
                              <p className="font-mono text-[0.6rem] uppercase tracking-widest text-amber mt-0.5 truncate">
                                {(c as ConversationWithBranch).branch_name}
                              </p>
                            )}
                            {c.inquiry_check_in && c.inquiry_check_out && (
                              <p className="font-mono text-[0.6rem] text-cream-dim mt-0.5">
                                {fmtDate(c.inquiry_check_in)} – {fmtDate(c.inquiry_check_out)}
                              </p>
                            )}
                            <p className="font-mono text-[0.6rem] text-mocha mt-0.5">
                              {formatDateTime(c.last_message_at)}
                            </p>
                            {c.last_message_body && (
                              <p className={`mt-0.5 text-xs truncate ${isUnread ? "text-cream-dim font-medium" : "text-mocha"}`}>
                                {c.last_message_sender_type === "admin" ? "You: " : ""}{c.last_message_body}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
                {conversations.length === 0 && (
                  <li className="px-4 py-10 font-mono text-xs text-mocha text-center">
                    // no conversations yet
                  </li>
                )}
              </ul>
            ) : (
              <>
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messagesLoading ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2">
                      <Loader2 className="h-4 w-4 text-amber animate-spin" />
                      <p className="font-mono text-[0.6rem] uppercase tracking-widest text-mocha">// loading</p>
                    </div>
                  ) : (
                    <>
                      {messages.map((m) => (
                        <div
                          key={m.id}
                          className={`flex ${m.sender_type === "admin" ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                              m.sender_type === "admin"
                                ? "bg-amber text-bg"
                                : m.sender_type === "customer"
                                ? "bg-bg-elev border border-line-bright text-cream"
                                : "bg-transparent text-mocha font-mono text-[0.7rem]"
                            }`}
                          >
                            {m.body}
                          </div>
                        </div>
                      ))}
                      {messages.length === 0 && (
                        <p className="font-mono text-xs text-mocha text-center py-6">// no messages yet</p>
                      )}
                      {customerTyping && (
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1 px-3 py-2 bg-bg-elev border border-line-bright rounded-lg">
                            <span className="h-1.5 w-1.5 rounded-full bg-mocha animate-bounce [animation-delay:0ms]" />
                            <span className="h-1.5 w-1.5 rounded-full bg-mocha animate-bounce [animation-delay:150ms]" />
                            <span className="h-1.5 w-1.5 rounded-full bg-mocha animate-bounce [animation-delay:300ms]" />
                          </div>
                          <span className="font-mono text-[0.6rem] text-mocha">typing</span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Reply input */}
                <div className="border-t border-line p-3 flex gap-2 shrink-0">
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => { setDraft(e.target.value); sendTyping(); }}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder={`Reply as ${adminName}…`}
                    className="flex-1 bg-bg border border-line-bright rounded-md px-3 py-2 text-sm text-cream focus:outline-none focus:border-amber"
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending || !draft.trim()}
                    className="flex h-10 w-10 items-center justify-center bg-amber text-bg rounded-md disabled:opacity-40"
                    aria-label="Send"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
