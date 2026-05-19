-- =============================================================
-- Audit log triggers — automatically log every admin write
-- to branches, menus, settings, rates, amenities, photos.
-- =============================================================

create or replace function public.audit_row_change()
returns trigger language plpgsql security definer as $$
declare
  v_actor uuid;
  v_diff jsonb;
  v_entity_id uuid;
  v_row jsonb;
begin
  v_actor := auth.uid();

  if (tg_op = 'INSERT') then
    v_row := to_jsonb(new);
    v_diff := v_row;
  elsif (tg_op = 'UPDATE') then
    v_row := to_jsonb(new);
    v_diff := jsonb_build_object(
      'before', to_jsonb(old),
      'after', v_row
    );
  elsif (tg_op = 'DELETE') then
    v_row := to_jsonb(old);
    v_diff := v_row;
  end if;

  -- Most audited tables have a uuid `id` column. site_settings uses `key`
  -- as its primary key, so we tolerate the missing column.
  begin
    if v_row ? 'id' then
      v_entity_id := (v_row->>'id')::uuid;
    end if;
  exception when others then
    v_entity_id := null;
  end;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, diff_jsonb)
  values (v_actor, lower(tg_op), tg_table_name, v_entity_id, v_diff);

  if (tg_op = 'DELETE') then
    return old;
  else
    return new;
  end if;
end $$;

-- Attach to all auditable tables
do $$
declare
  t text;
  audit_tables text[] := array[
    'branches','branch_amenities','branch_photos','branch_rates',
    'menu_categories','menu_items','branch_menu_overrides',
    'site_settings','airbnb_calendars'
  ];
begin
  foreach t in array audit_tables loop
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format(
      'create trigger %I_audit
       after insert or update or delete on public.%I
       for each row execute function public.audit_row_change()',
      t, t
    );
  end loop;
end $$;
