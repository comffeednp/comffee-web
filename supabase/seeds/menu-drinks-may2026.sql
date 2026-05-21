-- Menu update · May 2026
-- Replaces the old coffee/cold-bar seed categories with the actual drink menu.
-- Rice meals, snacks, desserts are untouched.
-- Run in Supabase SQL editor.

-- 1. Remove old drink items & categories
delete from public.menu_items
  where category_id in (
    select id from public.menu_categories where slug in ('coffee', 'cold-bar')
  );
delete from public.menu_categories where slug in ('coffee', 'cold-bar');

-- 2. Upsert new categories
insert into public.menu_categories (slug, name, sort_order) values
  ('lattes',    'Iced / Hot Latte',  1),
  ('mocktails', 'Mocktails (Iced)',  2)
on conflict (slug) do update set name = excluded.name, sort_order = excluded.sort_order;

-- Shift food categories down so drinks are first
update public.menu_categories set sort_order = 3 where slug = 'rice-meals';
update public.menu_categories set sort_order = 4 where slug = 'snacks';
update public.menu_categories set sort_order = 5 where slug = 'desserts';

-- 3. Insert drink items
do $$
declare c_lattes uuid; c_mocktails uuid;
begin
  select id into c_lattes    from public.menu_categories where slug = 'lattes';
  select id into c_mocktails from public.menu_categories where slug = 'mocktails';

  -- Remove any stale items for these categories first
  delete from public.menu_items where category_id in (c_lattes, c_mocktails);

  insert into public.menu_items
    (category_id, name, description, base_price_php, is_global, available, sort_order)
  values
    -- Iced / Hot Latte
    (c_lattes, 'Americano',          null,                     99,  true,  true,  1),
    (c_lattes, 'Cafe Latte',         null,                    119,  true,  true,  2),
    (c_lattes, 'Cappuccino',         null,                    119,  true,  true,  3),
    (c_lattes, 'Spanish Latte',      null,                    139,  true,  true,  4),
    (c_lattes, 'French Vanilla',     null,                    129,  true,  true,  5),
    (c_lattes, 'Hazelnut',           null,                    129,  true,  true,  6),
    (c_lattes, 'White Mocha',        null,                    139,  true,  true,  7),
    (c_lattes, 'Dark Mocha',         null,                    139,  true,  true,  8),
    (c_lattes, 'Caramel Macchiato',  null,                    139,  true,  true,  9),
    (c_lattes, 'Matcha Espresso',    'Cafe branches only',    139,  false, true, 10),
    (c_lattes, 'Salted Caramel',     null,                    129,  true,  true, 11),

    -- Mocktails (Iced) — base price is Medium; Large noted in description
    (c_mocktails, 'Caramel Biscoff Latte', 'Large ₱169',  149,  true, true, 1),
    (c_mocktails, 'Mango Latte',           'Large ₱149',  129,  true, true, 2),
    (c_mocktails, 'Strawberry Latte',      'Large ₱149',  129,  true, true, 3),
    (c_mocktails, 'Blueberry Latte',       'Large ₱149',  129,  true, true, 4),
    (c_mocktails, 'Strawberry Aloe',       'Large ₱139',  119,  true, true, 5),
    (c_mocktails, 'Green Apple Aloe',      'Large ₱139',  119,  true, true, 6),
    (c_mocktails, 'Passionfruit Aloe',     'Large ₱139',  119,  true, true, 7),
    (c_mocktails, 'Mango Aloe',            'Large ₱139',  119,  true, true, 8),
    (c_mocktails, 'Matcha n'' Milk',       'Large ₱149',  129,  true, true, 9);
end $$;
