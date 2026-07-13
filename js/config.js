// =====================================================================
// Configuration Supabase
// =====================================================================
// ⚠️ À COMPLÉTER avec les informations de VOTRE projet Supabase.
// Elles se trouvent dans Supabase > Project Settings > API.
// La clé "anon public" est sans danger à exposer côté client : c'est
// la Row Level Security (RLS), configurée via sql/schema.sql, qui
// protège réellement les données.
const SUPABASE_CONFIG = {
  url: 'https://ghbqykqeupjcpkookecep.supabase.co',
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoYnF5a3FldXBqY3Brb29ja2VwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MzkzNTYsImV4cCI6MjA5OTUxNTM1Nn0.FpUVOIOpHx4fTSL2gdQeM8n4WIVxeHwXe4h2p1p6moU',
};

// Emails techniques associés à chaque rôle (comptes Supabase Auth).
// L'utilisateur ne voit jamais ces emails : seul un clavier PIN est
// affiché à l'écran. Voir README.md pour la création de ces comptes.
const ROLE_EMAILS = {
  consommateur: 'consommateur@app.local',
  acheteur: 'acheteur@app.local',
};
