// =====================================================================
// Initialisation du client Supabase
// =====================================================================
// `window.supabase` est fourni par le script CDN chargé dans index.html
// (@supabase/supabase-js). On l'utilise pour créer notre client, puis on
// écrase la variable globale par NOTRE client applicatif pour éviter
// toute confusion dans le reste du code.
const supabaseClient = window.supabase.createClient(
  SUPABASE_CONFIG.url,
  SUPABASE_CONFIG.anonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'courses-preferences-auth',
    },
  }
);
