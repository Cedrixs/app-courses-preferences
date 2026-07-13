// =====================================================================
// Configuration Supabase
// =====================================================================
// ⚠️ À COMPLÉTER avec les informations de VOTRE projet Supabase.
// Elles se trouvent dans Supabase > Project Settings > API.
// La clé "anon public" est sans danger à exposer côté client : c'est
// la Row Level Security (RLS), configurée via sql/schema.sql, qui
// protège réellement les données.
const SUPABASE_CONFIG = {
  url: 'https://VOTRE-PROJET.supabase.co',
  anonKey: 'VOTRE_CLE_ANON_PUBLIQUE',
};

// Emails techniques associés à chaque rôle (comptes Supabase Auth).
// L'utilisateur ne voit jamais ces emails : seul un clavier PIN est
// affiché à l'écran. Voir README.md pour la création de ces comptes.
const ROLE_EMAILS = {
  consommateur: 'consommateur@app.local',
  acheteur: 'acheteur@app.local',
};
