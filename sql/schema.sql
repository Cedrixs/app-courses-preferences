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
-- - Suppression : le consommateur peut supprimer uniquement ses propres
--   photos (celles qu'il a lui-même ajoutées).
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

create policy "photos_delete_own_consommateur_only"
  on public.photos for delete
  to authenticated
  using (
    public.current_role_name() = 'consommateur'
    and uploaded_by = 'consommateur'
  );

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
-- suppression des lignes en base, réservée à ses propres photos).
create policy "photos_bucket_delete_consommateur_only"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'photos'
    and public.current_role_name() = 'consommateur'
  );

-- =====================================================================
-- Fin du script.
-- =====================================================================
