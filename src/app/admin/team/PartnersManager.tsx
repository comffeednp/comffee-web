"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Copy, Check } from "lucide-react";

interface Partner {
  id: string;
  email: string | null;
  full_name: string;
  is_active: boolean;
  branch?: { name: string } | null;
}

interface Branch {
  id: string;
  name: string;
}

export default function PartnersManager() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [email, setEmail] = useState("");
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    const r = await fetch("/api/admin/partners");
    if (r.ok) {
      const d = await r.json();
      setPartners(d.partners ?? []);
      setBranches(d.branches ?? []);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function add() {
    const e = email.trim().toLowerCase();
    if (!e) return;
    if (!branchId) { setError("pick a branch for this partner"); return; }
    setLoading(true);
    setError(null);
    setCreated(null);
    setCopied(false);
    try {
      const r = await fetch("/api/admin/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e, branchId }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.detail || d.error || "could not add partner");
        return;
      }
      setCreated({ email: d.email, tempPassword: d.tempPassword });
      setEmail("");
      setBranchId("");
      load();
    } catch {
      setError("network error");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this partner's access? Their login will stop working.")) return;
    await fetch(`/api/admin/partners?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="mt-8 space-y-6">
      {/* Add partner */}
      <div className="border border-line-bright bg-bg-card rounded-xl p-5">
        <p className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor mb-3">// add a partner</p>
        <div className="flex flex-wrap gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="partner@email.com"
            className="flex-1 min-w-[14rem] bg-bg border border-line-bright rounded-md px-3 py-2 text-sm text-cream focus:outline-none focus:border-amber"
          />
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="bg-bg border border-line-bright rounded-md px-3 py-2 text-sm text-cream focus:outline-none focus:border-amber"
          >
            <option value="">Select branch…</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={add}
            disabled={loading || !email.trim()}
            title="Create a read-only partner login for this email"
            className="key-cap key-cap-primary disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            {loading ? "Adding…" : "Add partner"}
          </button>
        </div>
        {error && <p className="mt-2 font-mono text-xs text-red-400">// {error}</p>}

        {created && (
          <div className="mt-4 border border-phosphor/40 bg-phosphor/5 rounded-lg p-4">
            <p className="font-mono text-[0.65rem] uppercase tracking-widest text-phosphor">// login created — share these once</p>
            <div className="mt-2 font-mono text-sm text-cream space-y-1">
              <p>email: <span className="text-amber">{created.email}</span></p>
              <p className="flex items-center gap-2">
                temp password: <span className="text-amber">{created.tempPassword}</span>
                <button
                  type="button"
                  title="Copy temp password"
                  onClick={() => {
                    navigator.clipboard?.writeText(created.tempPassword).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    });
                  }}
                  className="text-cream-dim hover:text-amber"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-phosphor" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </p>
            </div>
            <p className="mt-2 font-mono text-[0.6rem] text-mocha">
              They log in at /admin with this email + temp password. This password won&apos;t be shown again.
            </p>
          </div>
        )}
      </div>

      {/* Partner list */}
      <div className="border border-line-bright bg-bg-card rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-line bg-bg-soft">
          <span className="font-mono text-[0.7rem] uppercase tracking-widest text-cream-dim">
            // {partners.length} partner{partners.length === 1 ? "" : "s"}
          </span>
        </div>
        <ul className="divide-y divide-line">
          {partners.map((p) => (
            <li key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="block font-mono text-sm text-cream truncate">{p.email ?? p.full_name}</span>
                <span className="font-mono text-[0.6rem] uppercase tracking-widest text-amber">{p.branch?.name ?? "no branch"}</span>
              </div>
              <button
                type="button"
                onClick={() => remove(p.id)}
                title={`Remove ${p.email ?? p.full_name}`}
                className="text-red-400 hover:text-red-300 shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
          {partners.length === 0 && (
            <li className="px-5 py-8 text-center font-mono text-xs text-mocha">// no partners yet</li>
          )}
        </ul>
      </div>
    </div>
  );
}
