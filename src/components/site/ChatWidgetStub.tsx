"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Send, X } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";

interface Message {
  id: string;
  sender_type: "customer" | "admin" | "system";
  body: string;
  created_at: string;
}

const STORAGE_KEY = "comffe.chat.session.v1";

/**
 * Live chat widget — talks to /api/chat/start to get a session token,
 * subscribes to chat_messages via Supabase Realtime, and posts new
 * customer messages to /api/chat/messages.
 *
 * The component name is kept as "ChatWidgetStub" to avoid touching the
 * root layout — but it's now the real widget.
 */
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
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize session
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as {
          sessionToken: string;
          name?: string;
        };
        setSessionToken(parsed.sessionToken);
        if (parsed.name) {
          setName(parsed.name);
          setNeedsName(false);
        }
      } catch {}
    }
  }, []);

  // Fetch conversation + messages on first open
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const init = async () => {
      try {
        const startRes = await fetch("/api/chat/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionToken: sessionToken ?? undefined,
            customerName: name || undefined,
          }),
        });
        const startData = await startRes.json();
        if (cancelled) return;
        if (!startRes.ok) return;
        setSessionToken(startData.sessionToken);
        setConversationId(startData.conversationId);
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ sessionToken: startData.sessionToken, name }),
        );

        const msgRes = await fetch(
          `/api/chat/messages?sessionToken=${encodeURIComponent(startData.sessionToken)}`,
        );
        const msgData = await msgRes.json();
        if (cancelled) return;
        if (msgRes.ok && Array.isArray(msgData.messages)) {
          setMessages(msgData.messages);
        }
      } catch (e) {
        console.error("chat init failed", e);
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [open, sessionToken, name]);

  // Subscribe to Realtime for new messages on this conversation
  useEffect(() => {
    if (!conversationId) return;
    let supabase;
    try {
      supabase = getSupabaseBrowser();
    } catch {
      return;
    }
    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: { new: Message }) => {
          const m = payload.new;
          setMessages((prev) => {
            if (prev.find((x) => x.id === m.id)) return prev;
            return [...prev, m];
          });
          if (!open && m.sender_type === "admin") {
            setUnread((u) => u + 1);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, open]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  // Clear unread on open
  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !sessionToken || sending) return;
    if (needsName && !name.trim()) {
      setNeedsName(true);
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken,
          body: text,
          customerName: name || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, data.message]);
        setDraft("");
        if (needsName && name.trim()) {
          setNeedsName(false);
          window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ sessionToken, name }),
          );
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
            <div className="px-4 py-3 border-b border-line bg-bg-soft flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-phosphor animate-pulse shadow-[0_0_8px_var(--color-phosphor)]" />
              <span className="font-mono text-xs uppercase tracking-widest text-cream">
                comffee // live chat
              </span>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="text-sm text-cream-dim py-4">
                  <div className="flex gap-3">
                    <span className="font-mono text-[0.65rem] uppercase text-phosphor mt-1">
                      ›
                    </span>
                    <p className="leading-relaxed">
                      Hi! Drop your question and we&apos;ll get back to you fast. The team gets a phone notification immediately.
                    </p>
                  </div>
                </div>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${
                    m.sender_type === "customer" ? "justify-end" : "justify-start"
                  }`}
                >
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
                </div>
              ))}
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
                  onChange={(e) => setDraft(e.target.value)}
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
