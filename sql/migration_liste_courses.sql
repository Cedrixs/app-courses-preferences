-- =====================================================================
-- Migration : Liste de courses
-- À exécuter dans Supabase > SQL Editor sur le projet déjà configuré
-- (ajoute uniquement les nouveaux objets, ne touche pas à l'existant).
-- =====================================================================

create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index if not exists shopping_lists_one_active_idx
  on public.shopping_lists (status)
  where status = 'active';

create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  photo_id uuid references public.photos(id) on delete set null,
  label text not null,
  quantity integer not null default 1 check (quantity >= 1),
  taken boolean not null default false,
  taken_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists shopping_list_items_list_id_idx on public.shopping_list_items(list_id);

alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;

create policy "shopping_lists_select_authenticated"
  on public.shopping_lists for select
  to authenticated
  using (true);

create policy "shopping_lists_insert_consommateur_only"
  on public.shopping_lists for insert
  to authenticated
  with check (public.current_role_name() = 'consommateur');

create policy "shopping_lists_update_consommateur_only"
  on public.shopping_lists for update
  to authenticated
  using (public.current_role_name() = 'consommateur')
  with check (public.current_role_name() = 'consommateur');

create policy "shopping_list_items_select_authenticated"
  on public.shopping_list_items for select
  to authenticated
  using (true);

create policy "shopping_list_items_insert_consommateur_only"
  on public.shopping_list_items for insert
  to authenticated
  with check (
    public.current_role_name() = 'consommateur'
    and taken = false
    and taken_at is null
  );

create policy "shopping_list_items_update_authenticated"
  on public.shopping_list_items for update
  to authenticated
  using (true)
  with check (true);

create policy "shopping_list_items_delete_consommateur_only"
  on public.shopping_list_items for delete
  to authenticated
  using (public.current_role_name() = 'consommateur');

create or replace function public.enforce_shopping_list_item_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role_name() = 'acheteur' then
    if new.list_id is distinct from old.list_id
       or new.category_id is distinct from old.category_id
       or new.photo_id is distinct from old.photo_id
       or new.label is distinct from old.label
       or new.quantity is distinct from old.quantity
    then
      raise exception 'acheteur : seul le statut pris peut être modifié';
    end if;
  elsif public.current_role_name() = 'consommateur' then
    if new.taken is distinct from old.taken
       or new.taken_at is distinct from old.taken_at
    then
      raise exception 'consommateur : le statut pris est réservé à l''acheteur';
    end if;
  else
    raise exception 'rôle inconnu';
  end if;
  return new;
end;
$$;

drop trigger if exists shopping_list_items_update_guard on public.shopping_list_items;
create trigger shopping_list_items_update_guard
  before update on public.shopping_list_items
  for each row
  execute function public.enforce_shopping_list_item_update();

create or replace function public.terminer_liste_courses()
returns public.shopping_lists
language plpgsql
security definer
set search_path = public
as $$
declare
  nouvelle public.shopping_lists;
begin
  if public.current_role_name() <> 'consommateur' then
    raise exception 'seul le consommateur peut terminer la liste de courses';
  end if;

  update public.shopping_lists
  set status = 'archived', archived_at = now()
  where status = 'active';

  insert into public.shopping_lists (status) values ('active')
  returning * into nouvelle;

  return nouvelle;
end;
$$;

grant execute on function public.terminer_liste_courses() to authenticated;

-- =====================================================================
-- Fin de la migration.
-- =====================================================================
