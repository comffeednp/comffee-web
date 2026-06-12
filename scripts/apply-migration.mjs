#!/usr/bin/env node
// Apply one or more migration files to the LIVE Supabase project via the
// Management API (the same way 0055 was applied — no direct DB password, no
// supabase db push). DDL-capable, runs each file as a single batch.
//
//   SUPABASE_ACCESS_TOKEN=sbp_… node scripts/apply-migration.mjs 0056 0057
//
// The token is a PERSONAL access token (supabase.com/dashboard/account/tokens
// or `supabase login`). It is read from the env ONLY — never written to disk
// (house rule: pasted tokens are never persisted).
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_REF = "uioeefxnugnqhvthaxjf"; // comffee-web Supabase (public URL host)
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN is not set — run `supabase login` or pass a personal token in the env.");
  process.exit(2);
}
const wanted = process.argv.slice(2);
if (!wanted.length) {
  console.error("usage: node scripts/apply-migration.mjs <number|filename> […]");
  process.exit(2);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");
const all = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

for (const want of wanted) {
  const file = all.find((f) => f === want || f.startsWith(want + "_") || f.startsWith(want));
  if (!file) {
    console.error(`✗ no migration matching "${want}" in supabase/migrations/`);
    process.exit(1);
  }
  const sql = readFileSync(join(dir, file), "utf8");
  process.stdout.write(`applying ${file} … `);
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`FAILED (HTTP ${res.status})\n${body}`);
    process.exit(1);
  }
  console.log("ok");
}
console.log("done — verify with a SELECT before deploying code that depends on it.");
