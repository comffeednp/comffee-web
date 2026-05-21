"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, MessageSquare, Send, X } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface Message {
  id: string;
  sender_type: "customer" | "admin" | "system";
  body: string;
  created_at: string;
}

interface SessionEntry {
  key: string;
  sessionToken: string;
  conversationId: string;
  branchName?: string;
  checkIn?: string;
  checkOut?: string;
  updatedAt: string;
}

const SESSIONS_KEY = "comffe.chat.sessions";

function loadSessions(): SessionEntry[] {
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? "[]") as SessionEntry[]; }
  catch { return []; }
}

function upsertSession(entry: SessionEntry) {
  const rest = loadSessions().filter((s) => s.key !== entry.key);
  rest.unshift(entry);
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(rest.slice(0, 20)));
}

function getInquiryKey(branchId?: string | null, checkIn?: string | null, checkOut?: string | null): string {
  if (checkIn && checkOut) {
    return branchId
      ? `comffe.chat.v2.${branchId}.${checkIn}.${checkOut}`
      : `comffe.chat.v2.${checkIn}.${checkOut}`;
  }
  return branchId ? `comffe.chat.v2.${branchId}` : "comffe.chat.v2.general";
}

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

export default function ChatWidgetStub() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "thread" | "inquiry">("thread");
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [name, setName] = useState("");
  const [needsName, setNeedsName] = useState(true);
  const [sending, setSending] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [unread, setUnread] = useState(0);
  const [unreadConvIds, setUnreadConvIds] = useState<Set<string>>(new Set());
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
  const activeEntryRef = useRef<SessionEntry | null>(null);
  const [inquiryCheckIn, setInquiryCheckIn] = useState("");
  const [inquiryCheckOut, setInquiryCheckOut] = useState("");
  const [inquiryGuests, setInquiryGuests] = useState(2);
  const [inquiryMsg, setInquiryMsg] = useState("");
  const [inquirySending, setInquirySending] = useState(false);
  const viewRef = useRef(view);
  const openRef = useRef(open);
  const skipInitRef = useRef(false);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { openRef.current = open; }, [open]);

  useEffect(() => { nameRef.current = name; }, [name]);

  // Prefill name from Google auth on mount; setAuthChecked when done so name prompt never flashes
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
      setAuthChecked(true);
    })();
  }, []);

  // Listen for "Message host" button → open in inquiry view
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ inquiry?: boolean }>).detail;
      if (!detail?.inquiry) return;
      let ci = "", co = "";
      let guests = 2;
      try { const d = JSON.parse(sessionStorage.getItem("comffe.chat.dates") ?? "null"); if (d) { ci = d.checkIn ?? ""; co = d.checkOut ?? ""; } } catch {}
      try { guests = parseInt(sessionStorage.getItem("comffe.chat.guests") ?? "2") || 2; } catch {}
      setInquiryCheckIn(ci);
      setInquiryCheckOut(co);
      setInquiryGuests(guests);
      setInquiryMsg("");
      setMessages([]);
      skipInitRef.current = true;
      setView("inquiry");
      setOpen(true);
    };
    window.addEventListener("comffe:open-chat", handler);
    return () => window.removeEventListener("comffe:open-chat", handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // On open: init current inquiry, register session, decide list vs thread
  useEffect(() => {
    if (!open) return;
    if (skipInitRef.current) { skipInitRef.current = false; return; }
    let cancelled = false;

    setMessages([]);
    setMessagesLoading(false);
    setSeenByAdmin(false);

    (async () => {
      // Get Google user info
      let authName: string | null = null;
      let avatarUrl: string | null = null;
      try {
        const supabase = getSupabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          authName = (user.user_metadata?.full_name ?? user.user_metadata?.name ?? null) as string | null;
          avatarUrl = (user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null) as string | null;
          if (authName && !nameRef.current) { setName(authName); setNeedsName(false); }
        }
      } catch {}

      if (cancelled) return;

      // If there are existing sessions, resume them — don't create a new one
      const existing = loadSessions();
      setSessions(existing);
      if (cancelled) return;

      if (existing.length > 1) {
        setView("list");
        return;
      }

      if (existing.length === 1) {
        const s = existing[0];
        activeEntryRef.current = s;
        inquiryKeyRef.current = s.key;
        setSessionToken(s.sessionToken);
        setConversationId(s.conversationId);
        setBranchLabel(s.branchName ?? null);
        setDatesLabel(s.checkIn && s.checkOut ? `${fmtDate(s.checkIn)} – ${fmtDate(s.checkOut)}` : null);
        setView("thread");
        setMessagesLoading(true);
        const msgRes = await fetch(`/api/chat/messages?sessionToken=${encodeURIComponent(s.sessionToken)}`);
        const msgData = await msgRes.json();
        if (cancelled) return;
        if (msgRes.ok && Array.isArray(msgData.messages)) setMessages(msgData.messages);
        setMessagesLoading(false);
        return;
      }

      // No existing sessions — create a new general session
      let branchCtx: { id: string; name: string } | null = null;
      try { branchCtx = JSON.parse(sessionStorage.getItem("comffe.chat.branch") ?? "null"); } catch {}
      const inquiryKey = getInquiryKey(branchCtx?.id);
      inquiryKeyRef.current = inquiryKey;

      let storedToken: string | null = null;
      try {
        const stored = JSON.parse(localStorage.getItem(inquiryKey) ?? "null") as { sessionToken?: string; name?: string } | null;
        if (stored?.sessionToken) {
          storedToken = stored.sessionToken;
          if (stored.name && !nameRef.current) { setName(stored.name); setNeedsName(false); }
        }
      } catch {}

      const startRes = await fetch("/api/chat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken: storedToken ?? undefined,
          customerName: storedToken ? undefined : (nameRef.current || authName || undefined),
          branchId: branchCtx?.id ?? undefined,
          branchName: branchCtx?.name ?? undefined,
          avatarUrl: avatarUrl ?? undefined,
        }),
      });
      const startData = await startRes.json();
      if (cancelled || !startRes.ok) return;

      const token = startData.sessionToken as string;
      const convId = startData.conversationId as string;

      localStorage.setItem(inquiryKey, JSON.stringify({ sessionToken: token, name: nameRef.current || undefined }));
      const entry: SessionEntry = {
        key: inquiryKey,
        sessionToken: token,
        conversationId: convId,
        branchName: branchCtx?.name ?? undefined,
        updatedAt: new Date().toISOString(),
      };
      upsertSession(entry);
      activeEntryRef.current = entry;
      setSessionToken(token);
      setConversationId(convId);
      setSessions(loadSessions());
      if (cancelled) return;

      setBranchLabel(branchCtx?.name ?? null);
      setDatesLabel(null);
      setView("thread");
      setMessagesLoading(true);
      const msgRes = await fetch(`/api/chat/messages?sessionToken=${encodeURIComponent(token)}`);
      const msgData = await msgRes.json();
      if (cancelled) return;
      if (msgRes.ok && Array.isArray(msgData.messages)) setMessages(msgData.messages);
      setMessagesLoading(false);
    })();

    return () => { cancelled = true; };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open a session from the list
  const openSession = async (entry: SessionEntry) => {
    activeEntryRef.current = entry;
    inquiryKeyRef.current = entry.key;
    setSessionToken(entry.sessionToken);
    setConversationId(entry.conversationId);
    setBranchLabel(entry.branchName ?? null);
    setDatesLabel(entry.checkIn && entry.checkOut ? `${fmtDate(entry.checkIn)} – ${fmtDate(entry.checkOut)}` : null);
    setMessages([]);
    setMessagesLoading(true);
    setSeenByAdmin(false);
    setUnreadConvIds((s) => { const n = new Set(s); n.delete(entry.conversationId); return n; });
    setView("thread");

    const msgRes = await fetch(`/api/chat/messages?sessionToken=${encodeURIComponent(entry.sessionToken)}`);
    const msgData = await msgRes.json();
    if (msgRes.ok && Array.isArray(msgData.messages)) setMessages(msgData.messages);
    setMessagesLoading(false);
  };

  // Realtime: messages + typing + seen for active conversation
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
          if (viewRef.current === "thread") {
            setMessages((prev) => prev.find((x) => x.id === m.id) ? prev : [...prev, m]);
          } else if (m.sender_type === "admin") {
            setUnread((u) => u + 1);
            setUnreadConvIds((s) => new Set([...s, conversationId]));
          }
        },
      )
      .on("broadcast", { event: "message" }, (payload: { payload?: { message?: Message } }) => {
        const m = payload.payload?.message;
        if (!m) return;
        if (openRef.current && viewRef.current === "thread") {
          setMessages((prev) => prev.find((x) => x.id === m.id) ? prev : [...prev, m]);
        } else {
          setUnread((u) => u + 1);
          setUnreadConvIds((s) => new Set([...s, conversationId]));
        }
      })
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
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && view === "thread" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open, view]);

  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  const sendTyping = () => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1500) return;
    lastTypingSentRef.current = now;
    broadcastChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { from: "customer" } });
  };

  const handleInquirySubmit = async () => {
    const text = inquiryMsg.trim();
    if (!text || inquirySending) return;
    setInquirySending(true);
    try {
      // Update sessionStorage with form values
      try {
        sessionStorage.setItem("comffe.chat.dates", JSON.stringify({ checkIn: inquiryCheckIn, checkOut: inquiryCheckOut }));
        sessionStorage.setItem("comffe.chat.guests", String(inquiryGuests));
      } catch {}

      let branchCtx: { id: string; name: string } | null = null;
      try { branchCtx = JSON.parse(sessionStorage.getItem("comffe.chat.branch") ?? "null"); } catch {}

      const inquiryKey = getInquiryKey(branchCtx?.id, inquiryCheckIn || undefined, inquiryCheckOut || undefined);

      let storedToken: string | null = null;
      try {
        const stored = JSON.parse(localStorage.getItem(inquiryKey) ?? "null") as { sessionToken?: string } | null;
        if (stored?.sessionToken) storedToken = stored.sessionToken;
      } catch {}

      let authName: string | null = null;
      let avatarUrl: string | null = null;
      try {
        const supabase = getSupabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          authName = (user.user_metadata?.full_name ?? user.user_metadata?.name ?? null) as string | null;
          avatarUrl = (user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null) as string | null;
          if (authName && !nameRef.current) { setName(authName); setNeedsName(false); }
        }
      } catch {}

      const startRes = await fetch("/api/chat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken: storedToken ?? undefined,
          customerName: nameRef.current || authName || undefined,
          branchId: branchCtx?.id ?? undefined,
          branchName: branchCtx?.name ?? undefined,
          checkIn: inquiryCheckIn || undefined,
          checkOut: inquiryCheckOut || undefined,
          avatarUrl: avatarUrl ?? undefined,
        }),
      });
      if (!startRes.ok) return;
      const startData = await startRes.json();
      const token = startData.sessionToken as string;
      const convId = startData.conversationId as string;

      localStorage.setItem(inquiryKey, JSON.stringify({ sessionToken: token, name: nameRef.current || undefined }));
      const entry: SessionEntry = {
        key: inquiryKey,
        sessionToken: token,
        conversationId: convId,
        branchName: branchCtx?.name ?? undefined,
        checkIn: inquiryCheckIn || undefined,
        checkOut: inquiryCheckOut || undefined,
        updatedAt: new Date().toISOString(),
      };
      upsertSession(entry);
      activeEntryRef.current = entry;
      inquiryKeyRef.current = inquiryKey;
      setSessionToken(token);
      setConversationId(convId);
      setBranchLabel(branchCtx?.name ?? null);
      setDatesLabel(inquiryCheckIn && inquiryCheckOut ? `${fmtDate(inquiryCheckIn)} – ${fmtDate(inquiryCheckOut)}` : null);
      setSessions(loadSessions());

      const msgRes = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken: token, body: text, customerName: nameRef.current || authName || undefined }),
      });
      if (msgRes.ok) {
        const data = await msgRes.json() as { message?: Message };
        if (data.message) {
          setMessages([data.message]);
          broadcastChannelRef.current?.send({
            type: "broadcast",
            event: "message",
            payload: { message: data.message },
          });
        }
        if (needsName && nameRef.current) {
          setNeedsName(false);
          localStorage.setItem(inquiryKey, JSON.stringify({ sessionToken: token, name: nameRef.current }));
        }
      }
      setView("thread");
    } finally {
      setInquirySending(false);
    }
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
        const data = await res.json() as { message?: Message };
        if (data.message) {
          setMessages((prev) => prev.find((x) => x.id === data.message!.id) ? prev : [...prev, data.message!]);
          broadcastChannelRef.current?.send({
            type: "broadcast",
            event: "message",
            payload: { message: data.message },
          });
        }
        setDraft("");
        const updatedEntry = activeEntryRef.current
          ? { ...activeEntryRef.current, updatedAt: new Date().toISOString() }
          : null;
        if (updatedEntry) {
          activeEntryRef.current = updatedEntry;
          upsertSession(updatedEntry);
          setSessions(loadSessions());
        }
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
      <div className="fixed bottom-5 right-5 z-50">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close chat" : "Open chat"}
          className={`flex items-center gap-2 h-14 rounded-full bg-amber text-bg font-bold shadow-lg shadow-amber/40 hover:scale-105 transition-transform ${open ? "w-14 justify-center" : "px-5"}`}
        >
          {open
            ? <X className="h-5 w-5 shrink-0" />
            : <>
                <MessageSquare className="h-5 w-5 shrink-0" />
                <span className="font-mono text-xs uppercase tracking-widest pr-1">Chat</span>
              </>
          }
        </button>
        <AnimatePresence>
          {!open && unread > 0 && (
            <motion.span
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-rgb-r text-cream flex items-center justify-center font-mono text-[0.65rem] font-bold pointer-events-none"
            >
              {unread}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="fixed bottom-24 right-5 z-50 w-[22rem] max-w-[calc(100vw-2.5rem)] h-[28rem] border border-line-bright bg-bg-card rounded-xl shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-line bg-bg-soft flex items-center justify-between shrink-0">
              {view === "inquiry" ? (
                <>
                  <div className="min-w-0">
                    <span className="font-mono text-xs uppercase tracking-widest text-cream">
                      {(() => { try { const b = JSON.parse(sessionStorage.getItem("comffe.chat.branch") ?? "null"); return b?.name ? `comffee // ${b.name}` : "comffee // message host"; } catch { return "comffee // message host"; } })()}
                    </span>
                    <p className="font-mono text-[0.6rem] text-mocha mt-0.5">tell us about your stay</p>
                  </div>
                  <span className="h-2 w-2 rounded-full bg-phosphor animate-pulse shadow-[0_0_8px_var(--color-phosphor)] shrink-0" />
                </>
              ) : view === "thread" ? (
                <>
                  <div className="flex items-center gap-2 min-w-0">
                    {sessions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setView("list")}
                        className="text-cream-dim hover:text-amber shrink-0"
                        aria-label="Back to conversations"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <div>
                      <span className="font-mono text-xs uppercase tracking-widest text-cream">
                        {branchLabel ? `comffee // ${branchLabel}` : "comffee // live chat"}
                      </span>
                      {datesLabel && (
                        <p className="font-mono text-[0.6rem] text-amber mt-0.5">{datesLabel}</p>
                      )}
                    </div>
                  </div>
                  <span className="h-2 w-2 rounded-full bg-phosphor animate-pulse shadow-[0_0_8px_var(--color-phosphor)] shrink-0" />
                </>
              ) : (
                <span className="font-mono text-[0.7rem] uppercase tracking-widest text-cream-dim">
                  // my conversations · {sessions.length}
                </span>
              )}
            </div>

            {/* Body */}
            {view === "inquiry" ? (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div>
                    <p className="font-mono text-[0.6rem] uppercase tracking-widest text-mocha mb-2">// your stay</p>
                    <div className="border border-line-bright rounded-xl p-4 space-y-3 bg-bg">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="font-mono text-[0.55rem] uppercase tracking-widest text-mocha">check-in</label>
                          <input
                            type="date"
                            value={inquiryCheckIn}
                            onChange={(e) => setInquiryCheckIn(e.target.value)}
                            className="w-full bg-bg-soft border border-line rounded-md px-2 py-1.5 text-xs text-cream font-mono focus:outline-none focus:border-amber"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="font-mono text-[0.55rem] uppercase tracking-widest text-mocha">check-out</label>
                          <input
                            type="date"
                            value={inquiryCheckOut}
                            onChange={(e) => setInquiryCheckOut(e.target.value)}
                            className="w-full bg-bg-soft border border-line rounded-md px-2 py-1.5 text-xs text-cream font-mono focus:outline-none focus:border-amber"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="font-mono text-[0.55rem] uppercase tracking-widest text-mocha">guests</label>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setInquiryGuests((g) => Math.max(1, g - 1))}
                            title="Remove a guest"
                            className="h-7 w-7 rounded-full border border-line-bright flex items-center justify-center text-cream-dim hover:border-amber hover:text-amber transition text-base leading-none"
                          >−</button>
                          <span className="font-mono text-sm text-cream w-5 text-center">{inquiryGuests}</span>
                          <button
                            type="button"
                            onClick={() => setInquiryGuests((g) => g + 1)}
                            title="Add a guest"
                            className="h-7 w-7 rounded-full border border-line-bright flex items-center justify-center text-cream-dim hover:border-amber hover:text-amber transition text-base leading-none"
                          >+</button>
                          <span className="font-mono text-[0.6rem] text-mocha">{inquiryGuests === 1 ? "guest" : "guests"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="font-mono text-[0.6rem] uppercase tracking-widest text-mocha">// message</p>
                    <textarea
                      value={inquiryMsg}
                      onChange={(e) => setInquiryMsg(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleInquirySubmit(); } }}
                      placeholder="Ask about the stay, amenities, or anything…"
                      rows={3}
                      className="w-full bg-bg border border-line-bright rounded-lg px-3 py-2 text-sm text-cream focus:outline-none focus:border-amber resize-none"
                      autoFocus
                    />
                  </div>
                  {authChecked && needsName && (
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      className="w-full bg-bg border border-line-bright rounded-md px-3 py-2 text-sm text-cream font-mono focus:outline-none focus:border-amber"
                    />
                  )}
                </div>
                <div className="border-t border-line p-3 shrink-0">
                  <button
                    type="button"
                    onClick={handleInquirySubmit}
                    disabled={inquirySending || !inquiryMsg.trim()}
                    title="Send your inquiry message"
                    className="w-full flex items-center justify-center gap-2 bg-amber text-bg rounded-md py-2.5 font-mono text-xs uppercase tracking-widest disabled:opacity-40 hover:bg-amber/90 transition"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {inquirySending ? "Sending…" : "Send message"}
                  </button>
                </div>
              </>
            ) : view === "list" ? (
              <ul className="flex-1 overflow-y-auto divide-y divide-line">
                {sessions.map((s) => (
                  <li key={s.key}>
                    <button
                      type="button"
                      onClick={() => openSession(s)}
                      title={`Open conversation: ${s.branchName ?? "General inquiry"}`}
                      className={`w-full text-left px-4 py-3 transition ${
                        unreadConvIds.has(s.conversationId)
                          ? "bg-amber/5 hover:bg-amber/10"
                          : "hover:bg-bg-elev/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm truncate ${unreadConvIds.has(s.conversationId) ? "text-cream font-semibold" : "text-cream font-medium"}`}>
                          {s.branchName ?? "General inquiry"}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {unreadConvIds.has(s.conversationId) && (
                            <span className="h-2 w-2 rounded-full bg-amber animate-pulse" />
                          )}
                          {s.key === inquiryKeyRef.current && (
                            <span className="font-mono text-[0.55rem] uppercase tracking-widest text-amber border border-amber/40 rounded px-1">
                              current
                            </span>
                          )}
                        </div>
                      </div>
                      {s.checkIn && s.checkOut && (
                        <p className="font-mono text-[0.6rem] text-amber mt-0.5">
                          {fmtDate(s.checkIn)} – {fmtDate(s.checkOut)}
                        </p>
                      )}
                      <p className="font-mono text-[0.6rem] text-mocha mt-0.5">
                        {new Date(s.updatedAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messagesLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <span className="font-mono text-[0.65rem] text-mocha animate-pulse">// loading…</span>
                    </div>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>

                <div className="border-t border-line p-3 space-y-2">
                  {authChecked && needsName && (
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
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
