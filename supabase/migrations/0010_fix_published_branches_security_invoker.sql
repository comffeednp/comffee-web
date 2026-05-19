-- Recreate published_branches view with security_invoker so RLS policies
-- apply to the querying user rather than the view owner.
create or replace view public.published_branches with (security_invoker = true) as
  select b.*,
    (select count(*) from public.branch_photos p where p.branch_id = b.id) as photo_count,
    (select count(*) from public.branch_amenities a where a.branch_id = b.id) as amenity_count
  from public.branches b
  where b.is_published = true;
