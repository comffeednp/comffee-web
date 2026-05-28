-- 0033: branch edit submissions queue
--
-- WHY: cafe owners edit their public-page details from inside the POS "Reservation" tab.
-- Submissions land here in 'pending' status; an admin reviews inline on the existing
-- /admin/branches/[id] page and approves or rejects with one click. Approving applies the
-- payload to branches/branch_photos/branch_amenities/branch_rates atomically.
--
-- branch_id is NULLABLE — null = a brand-new branch being proposed (future SaaS onboarding when
-- a fresh partner POS submits its first form). For existing edits, branch_id points to the row.
--
-- payload (jsonb) holds the entire form (name, tagline, address, lat/lng, photos, amenities,
-- rates, gcash QR path + type, etc.). JSON keeps the schema flexible — new fields don't need
-- a migration. Approval deserializes + writes to the typed tables.
--
-- [[comffee-saas-vision]] Stage 4.

create table if not exists public.branch_edit_submissions (
  id              uuid primary key default gen_random_uuid(),
  branch_id       uuid references public.branches(id) on delete cascade,   -- nullable: NEW branch case
  proposed_slug   text,
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  submitted_at    timestamptz not null default now(),
  submitted_by    text,   -- license key or machine id from POS for audit
  payload         jsonb not null,
  rejection_note  text,
  reviewed_at     timestamptz,
  reviewed_by     uuid references public.admin_users(id)
);

create index if not exists branch_edit_submissions_status_idx
  on public.branch_edit_submissions (status, submitted_at desc);
create index if not exists branch_edit_submissions_branch_idx
  on public.branch_edit_submissions (branch_id, status);

-- RLS on — service-role only. POS inserts via the submit endpoint (service-role); admin
-- approve/reject endpoints use getSupabaseAdmin(). The anon key has no access.
alter table public.branch_edit_submissions enable row level security;
