"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Bell, BellOff, Loader2, Send } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { formatDateTime } from "@/lib/utils";
import type { ChatConversation, ChatMessage } from "@/lib/chat";

interface ConversationWithBranch extends ChatConversation {
  branch_name?: string | null;
  unread?: boolean;
}

interface Props {
  adminId: string;
  adminName: string;
  initialConversations: ConversationWithBranch[];
  initialActiveId: string | null;
  canReply?: boolean;
}

export default function AdminChatClient({
  adminId,
  adminName,
  initialConversations,
  initialActiveId,
  canReply = true,
}: Props) {
  const [conversations, setConversations] =
    useState<ConversationWithBranch[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(
    initialActiveId ?? initialConversations[0]?.id ?? null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [customerTyping, setCustomerTyping] = useState(false);
  const [unreadConvs, setUnreadConvs] = useState<Map<string, string>>(new Map());
  const activeIdRef = useRef(activeId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const broadcastChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<number>(0);

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => {
    if (!activeId) return;
    // Opening a conversation marks it seen — clear its unread state locally
    // (the GET request persists admin_last_read_at server-side).
    setUnreadConvs((m) => { const n = new Map(m); n.delete(activeId); return n; });
    setConversations((prev) => prev.map((c) => (c.id === activeId ? { ...c, unread: false } : c)));
  }, [activeId]);

  // Broadcast read + subscribe to customer typing when active conversation changes
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
      .on("broadcast", { event: "message" }, (payload: { payload?: { message?: ChatMessage } }) => {
        const m = payload.payload?.message;
        if (!m || m.sender_type !== "customer") return;
        setMessages((prev) => prev.find((x) => x.id === m.id) ? prev : [...prev, m]);
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === m.conversation_id);
          if (idx === -1) return prev;
          const updated = { ...prev[idx], last_message_at: m.created_at, last_message_body: m.body, last_message_sender_type: m.sender_type };
          const next = [...prev];
          next.splice(idx, 1);
          return [updated, ...next];
        });
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

  // Load messages whenever active conversation changes
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
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
          if (m.conversation_id === activeIdRef.current) {
            setMessages((prev) =>
              prev.find((x) => x.id === m.id) ? prev : [...prev, m],
            );
          } else if (m.sender_type === "customer") {
            setUnreadConvs((prev) => new Map(prev).set(m.conversation_id, m.body));
          }
          setConversations((prev) => {
            const idx = prev.findIndex((c) => c.id === m.conversation_id);
            if (idx === -1) {
              // Conversation not yet in list — fetch fresh list to pick it up
              fetch("/api/admin/chat")
                .then((r) => r.json())
                .then((d) => { if (d.conversations) setConversations(d.conversations); })
                .catch(() => {});
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
        }
      }
    } finally {
      setSending(false);
    }
  }, [draft, activeId, sending]);

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
  const unreadCount = conversations.filter((c) => unreadConvs.has(c.id) || c.unread).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr] h-[calc(100vh-22rem)] min-h-[500px]">
      {/* SIDEBAR */}
      <aside className="border border-line-bright bg-bg-card rounded-xl overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-line bg-bg-soft flex items-center justify-between">
          <span className="font-mono text-[0.7rem] uppercase tracking-widest text-cream-dim">
            // {conversations.length} conversations
            {unreadCount > 0 && (
              <span className="ml-2 text-amber">· {unreadCount} unread</span>
            )}
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
          {conversations.map((c) => {
            const isUnread = unreadConvs.has(c.id) || !!c.unread;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  title={`Open conversation with ${c.customer_name ?? "Anonymous"}`}
                  className={`w-full text-left px-4 py-3 transition ${
                    c.id === activeId
                      ? "bg-bg-elev border-l-2 border-amber"
                      : isUnread
                      ? "bg-amber/5 border-l-2 border-amber hover:bg-amber/10"
                      : "hover:bg-bg-elev/40 border-l-2 border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate ${isUnread ? "text-cream font-semibold" : "text-cream font-medium"}`}>
                      {c.customer_name ?? "Anonymous"}
                    </span>
                    {isUnread ? (
                      <span className="h-2 w-2 rounded-full bg-amber animate-pulse shrink-0" />
                    ) : null}
                  </div>
                  {(c as ConversationWithBranch).branch_name && (
                    <p className="font-mono text-[0.6rem] uppercase tracking-widest text-amber mt-0.5 truncate">
                      {(c as ConversationWithBranch).branch_name}
                    </p>
                  )}
                  {c.inquiry_check_in && c.inquiry_check_out && (
                    <p className="font-mono text-[0.6rem] text-amber/70 mt-0.5">
                      {new Date(c.inquiry_check_in + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                      {" – "}
                      {new Date(c.inquiry_check_out + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                    </p>
                  )}
                  <p className="font-mono text-[0.65rem] text-mocha mt-0.5">
                    {formatDateTime(c.last_message_at)}
                  </p>
                  {c.last_message_body && (
                    <p className={`mt-0.5 text-xs truncate ${isUnread ? "text-cream-dim font-medium" : "text-mocha"}`}>
                      {c.last_message_sender_type === "admin" ? "You: " : ""}{c.last_message_body}
                    </p>
                  )}
                </button>
              </li>
            );
          })}
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
              <div className="flex items-center gap-3 min-w-0">
                {active.customer_avatar_url ? (
                  <img src={active.customer_avatar_url} alt="" className="h-9 w-9 rounded-full shrink-0 object-cover" />
                ) : (
                  <div className="h-9 w-9 rounded-full shrink-0 bg-bg-elev border border-line-bright flex items-center justify-center">
                    <span className="font-mono text-sm text-mocha">
                      {(active.customer_name ?? "?")[0].toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-display text-base font-semibold text-cream">
                    {active.customer_name ?? "Anonymous"}
                  </p>
                  <p className="font-mono text-[0.65rem] text-mocha mt-0.5">
                    {(active as ConversationWithBranch).branch_name
                      ? `${(active as ConversationWithBranch).branch_name} · `
                      : ""}
                    {active.inquiry_check_in && active.inquiry_check_out
                      ? `${new Date(active.inquiry_check_in + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" })} – ${new Date(active.inquiry_check_out + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" })} · `
                      : ""}
                    {active.customer_email ?? active.customer_phone ?? "no contact"}
                  </p>
                </div>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
              {messagesLoading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 py-8">
                  <Loader2 className="h-5 w-5 text-amber animate-spin" />
                  <p className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha">// loading messages</p>
                </div>
              ) : (
                <>
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
                  {customerTyping && (
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1 px-3 py-2 bg-bg-elev border border-line-bright rounded-lg">
                        <span className="h-1.5 w-1.5 rounded-full bg-mocha animate-bounce [animation-delay:0ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-mocha animate-bounce [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-mocha animate-bounce [animation-delay:300ms]" />
                      </div>
                      <span className="font-mono text-[0.65rem] text-mocha">typing</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {canReply ? (
              <div className="border-t border-line p-4 flex gap-2">
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
                  title="Send reply"
                  className="flex h-10 px-4 items-center gap-2 bg-amber text-bg rounded-md disabled:opacity-40 font-mono text-xs uppercase tracking-widest"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send
                </button>
              </div>
            ) : (
              <div className="border-t border-line p-4 text-center">
                <p className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha">// read-only · partner view</p>
              </div>
            )}
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
