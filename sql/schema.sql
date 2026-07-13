-- =====================================================================
-- Script SQL complet : Application de préférences alimentaires
-- À exécuter dans Supabase > SQL Editor (en une seule fois)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Extension nécessaire pour générer des UUID
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 2. Table des catégories
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Table des photos
-- ---------------------------------------------------------------------
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  uploaded_by text not null check (uploaded_by in ('consommateur', 'acheteur')),
  product_name text not null,
  image_path text not null,
  priority_rank integer,
  created_at timestamptz not null default now()
);

create index if not exists photos_category_id_idx on public.photos(category_id);

-- ---------------------------------------------------------------------
-- 4. Table des commentaires
-- ---------------------------------------------------------------------
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos(id) on delete cascade,
  author text not null check (author in ('consommateur', 'acheteur')),
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists comments_photo_id_idx on public.comments(photo_id);

-- ---------------------------------------------------------------------
-- 5. Seed des catégories prédéfinies
-- ---------------------------------------------------------------------
insert into public.categories (name) values
  ('Fromages'),
  ('Yaourts'),
  ('Céréales'),
  ('Boissons'),
  ('Snacks salés'),
  ('Snacks sucrés'),
  ('Fruits'),
  ('Légumes'),
  ('Viandes'),
  ('Poissons'),
  ('Épicerie'),
  ('Autres')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- 6. Activation de la Row Level Security (RLS)
-- ---------------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.photos enable row level security;
alter table public.comments enable row level security;

-- ---------------------------------------------------------------------
-- 7. Fonction utilitaire : rôle de l'utilisateur connecté
-- Le rôle est déduit de l'email technique du compte Supabase Auth
-- (consommateur@app.local ou acheteur@app.local).
-- ---------------------------------------------------------------------
create or replace function public.current_role_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select split_part(auth.jwt() ->> 'email', '@', 1);
$$;

-- ---------------------------------------------------------------------
-- 8. Policies : categories
-- Les deux rôles peuvent lire/écrire les catégories (liste partagée
-- modifiable par les deux, comme demandé : ajout/renommage/suppression).
-- ---------------------------------------------------------------------
create policy "categories_select_authenticated"
  on public.categories for select
  to authenticated
  using (true);

create policy "categories_insert_authenticated"
  on public.categories for insert
  to authenticated
  with check (true);

create policy "categories_update_authenticated"
  on public.categories for update
  to authenticated
  using (true)
  with check (true);

create policy "categories_delete_authenticated"
  on public.categories for delete
  to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- 9. Policies : photos
-- - Lecture : les deux rôles voient tout.
-- - Insertion : chaque rôle ne peut insérer que des photos marquées
--   avec son propre nom (uploaded_by = son rôle). Les photos ajoutées
--   par l'acheteur doivent avoir priority_rank = null.
-- - Mise à jour du classement (priority_rank) : consommateur uniquement.
-- - Suppression : le consommateur peut supprimer n'importe quelle photo
--   (les siennes et celles proposées par l'acheteur) puisque c'est lui
--   qui a le dernier mot sur les préférences.
-- ---------------------------------------------------------------------
create policy "photos_select_authenticated"
  on public.photos for select
  to authenticated
  using (true);

create policy "photos_insert_own_role"
  on public.photos for insert
  to authenticated
  with check (
    uploaded_by = public.current_role_name()
    and (
      public.current_role_name() = 'consommateur'
      or (public.current_role_name() = 'acheteur' and priority_rank is null)
    )
  );

create policy "photos_update_rank_consommateur_only"
  on public.photos for update
  to authenticated
  using (public.current_role_name() = 'consommateur')
  with check (public.current_role_name() = 'consommateur');

create policy "photos_delete_consommateur_only"
  on public.photos for delete
  to authenticated
  using (public.current_role_name() = 'consommateur');

-- ---------------------------------------------------------------------
-- 10. Policies : comments
-- Les deux rôles peuvent lire tous les commentaires et n'ajouter que
-- des commentaires signés de leur propre nom. Pas de modification ni
-- de suppression prévue dans le cahier des charges.
-- ---------------------------------------------------------------------
create policy "comments_select_authenticated"
  on public.comments for select
  to authenticated
  using (true);

create policy "comments_insert_own_role"
  on public.comments for insert
  to authenticated
  with check (author = public.current_role_name());

-- =====================================================================
-- 11. Stockage : bucket pour les photos
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

-- Lecture publique des photos (nécessaire pour afficher les images
-- via une simple URL publique, sans re-signer une URL à chaque fois).
create policy "photos_bucket_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'photos');

-- Upload autorisé pour les deux rôles authentifiés.
create policy "photos_bucket_insert_authenticated"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'photos');

-- Suppression : uniquement le consommateur (cohérent avec la
-- policy de suppression des lignes en base ci-dessus).
create policy "photos_bucket_delete_consommateur_only"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'photos'
    and public.current_role_name() = 'consommateur'
  );

-- =====================================================================
-- 12. Liste de courses
-- =====================================================================
-- Une seule liste "active" existe à la fois (contrainte d'unicité
-- partielle ci-dessous). Quand le consommateur termine ses courses,
-- la liste active est archivée (consultable en historique) et une
-- nouvelle liste vide est créée automatiquement — voir la fonction
-- terminer_liste_courses() plus bas.

create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

-- Garantit qu'il n'existe jamais plus d'une liste "active" en même temps.
create unique index if not exists shopping_lists_one_active_idx
  on public.shopping_lists (status)
  where status = 'active';

create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  -- La photo est facultative (article texte libre) et peut disparaître
  -- si le consommateur supprime la photo du catalogue plus tard : dans
  -- ce cas l'article de la liste garde son nom (label) mais perd juste
  -- son image.
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

-- ---------------------------------------------------------------------
-- Policies : shopping_lists
-- Seul le consommateur crée/archive des listes. Les deux rôles
-- consultent (liste active + historique).
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Policies : shopping_list_items
-- - Lecture : les deux rôles.
-- - Ajout / suppression : consommateur uniquement.
-- - Modification : autorisée pour les deux rôles au niveau ligne, mais
--   restreinte au niveau colonne par le trigger ci-dessous (le
--   consommateur gère quantité/contenu, l'acheteur gère uniquement le
--   statut "pris" — RLS seule ne sait pas restreindre par colonne).
-- ---------------------------------------------------------------------
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

-- Contrôle fin par colonne, complémentaire aux policies RLS ci-dessus :
-- l'acheteur ne peut toucher qu'au statut "pris", le consommateur ne
-- peut pas y toucher lui-même (c'est l'acheteur qui coche pendant les
-- courses).
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

-- Termine la liste active (l'archive) et en recrée une nouvelle vide,
-- en une seule opération atomique. Réservé au consommateur.
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
-- Fin du script.
-- =====================================================================
