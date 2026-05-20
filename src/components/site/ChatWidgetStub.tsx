"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Send, X } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface Message {
  id: string;
  sender_type: "customer" | "admin" | "system";
  body: string;
  created_at: string;
}

function getInquiryKey(branchId?: string | null, checkIn?: string | null, checkOut?: string | null): string {
  if (checkIn && checkOut) {
    return branchId
      ? `comffe.chat.v2.${branchId}.${checkIn}.${checkOut}`
      : `comffe.chat.v2.${checkIn}.${checkOut}`;
  }
  return branchId ? `comffe.chat.v2.${branchId}` : "comffe.chat.v2.general";
}

export default function ChatWidgetStub() {
  const [open, setOpen] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [name, setName] = useState("");
  const [needsName, setNeedsName] = useState(true);
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const [branchLabel, setBranchLabel] = useState<string | null>(null);
  const [datesLabel, setDatesLabel] = useState<string | null>(null);
  const [adminTyping, setAdminTyping] = useState(false);
  const [seenByAdmin, setSeenByAdmin] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const broadcastChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const inquiryKeyRef = useRef("comffe.chat.v2.general");
  const nameRef = useRef("");

  useEffect(() => { nameRef.current = name; }, [name]);

  // Prefill name from Google auth on mount
  useEffect(() => {
    (async () => {
      try {
        const supabase = getSupabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const fullName = (user.user_metadata?.full_name ?? user.user_metadata?.name ?? "") as string;
          if (fullName) { setName(fullName); setNeedsName(false); }
        }
      } catch {}
    })();
  }, []);

  // Initialize / resume conversation whenever the widget opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    setMessages([]);
    setSessionToken(null);
    setConversationId(null);
    setSeenByAdmin(false);

    (async () => {
      // Read inquiry context from sessionStorage
      let branchCtx: { id: string; name: string } | null = null;
      let datesCtx: { checkIn: string; checkOut: string } | null = null;
      try { branchCtx = JSON.parse(sessionStorage.getItem("comffe.chat.branch") ?? "null"); } catch {}
      try { datesCtx = JSON.parse(sessionStorage.getItem("comffe.chat.dates") ?? "null"); } catch {}

      setBranchLabel(branchCtx?.name ?? null);
      if (datesCtx) {
        const fmt = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" });
        setDatesLabel(`${fmt(datesCtx.checkIn)} – ${fmt(datesCtx.checkOut)}`);
      } else {
        setDatesLabel(null);
      }

      // Inquiry-specific storage key — different dates = different key = new conversation
      const inquiryKey = getInquiryKey(branchCtx?.id, datesCtx?.checkIn, datesCtx?.checkOut);
      inquiryKeyRef.current = inquiryKey;

      // Look up existing session for this exact inquiry
      let storedToken: string | null = null;
      let storedName: string | null = null;
      try {
        const stored = JSON.parse(localStorage.getItem(inquiryKey) ?? "null") as { sessionToken?: string; name?: string } | null;
        if (stored?.sessionToken) {
          storedToken = stored.sessionToken;
          if (stored.name && !nameRef.current) { storedName = stored.name; setName(stored.name); setNeedsName(false); }
        }
      } catch {}

      // Get Google auth for name (if not already known) and avatar
      let authName: string | null = null;
      let avatarUrl: string | null = null;
      try {
        const supabase = getSupabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          authName = (user.user_metadata?.full_name ?? user.user_metadata?.name ?? null) as string | null;
          avatarUrl = (user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null) as string | null;
          if (authName && !nameRef.current && !storedName) { setName(authName); setNeedsName(false); }
        }
      } catch {}

      if (cancelled) return;

      const customerName = (storedName ?? authName ?? nameRef.current) || undefined;

      const startRes = await fetch("/api/chat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken: storedToken ?? undefined,
          customerName,
          branchId: branchCtx?.id ?? undefined,
          branchName: branchCtx?.name ?? undefined,
          checkIn: datesCtx?.checkIn ?? undefined,
          checkOut: datesCtx?.checkOut ?? undefined,
          avatarUrl: avatarUrl ?? undefined,
        }),
      });
      const startData = await startRes.json();
      if (cancelled || !startRes.ok) return;

      setSessionToken(startData.sessionToken);
      setConversationId(startData.conversationId);
      localStorage.setItem(inquiryKey, JSON.stringify({ sessionToken: startData.sessionToken, name: customerName }));

      const msgRes = await fetch(`/api/chat/messages?sessionToken=${encodeURIComponent(startData.sessionToken)}`);
      const msgData = await msgRes.json();
      if (cancelled) return;
      if (msgRes.ok && Array.isArray(msgData.messages)) setMessages(msgData.messages);
    })();

    return () => { cancelled = true; };
  }, [open]);

  // Subscribe to Realtime for new messages + typing/seen broadcasts
  useEffect(() => {
    if (!conversationId) return;
    let supabase;
    try { supabase = getSupabaseBrowser(); } catch { return; }

    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conversationId}` },
        (payload: { new: Message }) => {
          const m = payload.new;
          setMessages((prev) => prev.find((x) => x.id === m.id) ? prev : [...prev, m]);
          if (!open && m.sender_type === "admin") setUnread((u) => u + 1);
        },
      )
      .on("broadcast", { event: "typing" }, (payload: { payload?: { from?: string } }) => {
        if (payload.payload?.from === "admin") {
          setAdminTyping(true);
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
          typingTimerRef.current = setTimeout(() => setAdminTyping(false), 3000);
        }
      })
      .on("broadcast", { event: "read" }, () => { setSeenByAdmin(true); })
      .subscribe();

    broadcastChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      broadcastChannelRef.current = null;
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [conversationId, open]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  // Clear unread on open
  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  const sendTyping = () => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1500) return;
    lastTypingSentRef.current = now;
    broadcastChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { from: "customer" } });
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !sessionToken || sending) return;
    if (needsName && !name.trim()) { setNeedsName(true); return; }
    setSeenByAdmin(false);
    setSending(true);
    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken, body: text, customerName: name || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, data.message]);
        setDraft("");
        if (needsName && name.trim()) {
          setNeedsName(false);
          localStorage.setItem(inquiryKeyRef.current, JSON.stringify({ sessionToken, name }));
        }
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open chat"
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-amber/50 bg-bg-card glow-amber hover:scale-105 transition-transform"
      >
        {open ? (
          <X className="h-5 w-5 text-amber" />
        ) : (
          <MessageSquare className="h-5 w-5 text-amber" />
        )}
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

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="fixed bottom-24 right-5 z-50 w-[22rem] max-w-[calc(100vw-2.5rem)] h-[28rem] border border-line-bright bg-bg-card rounded-xl shadow-2xl overflow-hidden flex flex-col"
          >
            <div className="px-4 py-3 border-b border-line bg-bg-soft flex items-start gap-2">
              <span className="h-2 w-2 rounded-full bg-phosphor animate-pulse shadow-[0_0_8px_var(--color-phosphor)] mt-1 shrink-0" />
              <div>
                <span className="font-mono text-xs uppercase tracking-widest text-cream">
                  {branchLabel ? `comffee // ${branchLabel}` : "comffee // live chat"}
                </span>
                {datesLabel && (
                  <p className="font-mono text-[0.6rem] text-amber mt-0.5">{datesLabel}</p>
                )}
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="text-sm text-cream-dim py-4">
                  <div className="flex gap-3">
                    <span className="font-mono text-[0.65rem] uppercase text-phosphor mt-1">›</span>
                    <p className="leading-relaxed">
                      {branchLabel
                        ? `Ask us anything about ${branchLabel}! We get a notification immediately.`
                        : "Hi! Drop your question and we'll get back to you fast. The team gets a phone notification immediately."}
                    </p>
                  </div>
                </div>
              )}
              {messages.map((m, i) => {
                const isLastCustomer = m.sender_type === "customer" && !messages.slice(i + 1).some((x) => x.sender_type === "customer");
                return (
                  <div key={m.id} className={`flex flex-col ${m.sender_type === "customer" ? "items-end" : "items-start"}`}>
                    <div
                      className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                        m.sender_type === "customer"
                          ? "bg-amber text-bg"
                          : m.sender_type === "admin"
                          ? "bg-bg-elev border border-line-bright text-cream"
                          : "bg-transparent text-mocha font-mono text-[0.7rem]"
                      }`}
                    >
                      {m.body}
                    </div>
                    {isLastCustomer && seenByAdmin && (
                      <span className="font-mono text-[0.6rem] text-mocha mt-0.5">Seen</span>
                    )}
                  </div>
                );
              })}
              {adminTyping && (
                <div className="flex items-center gap-2 text-mocha">
                  <div className="flex gap-1 px-3 py-2 bg-bg-elev border border-line-bright rounded-lg">
                    <span className="h-1.5 w-1.5 rounded-full bg-mocha animate-bounce [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-mocha animate-bounce [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-mocha animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-line p-3 space-y-2">
              {needsName && (
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="your name"
                  className="w-full bg-bg border border-line-bright rounded-md px-3 py-2 text-sm text-cream font-mono focus:outline-none focus:border-amber"
                />
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => { setDraft(e.target.value); sendTyping(); }}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Type a message…"
                  className="flex-1 bg-bg border border-line-bright rounded-md px-3 py-2 text-sm text-cream focus:outline-none focus:border-amber"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !draft.trim()}
                  className="flex h-10 w-10 items-center justify-center bg-amber text-bg rounded-md disabled:opacity-40 hover:bg-amber-hot transition"
                  aria-label="Send"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
