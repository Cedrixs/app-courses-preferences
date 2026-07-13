// =====================================================================
// Authentification par code PIN
// =====================================================================
// L'utilisateur ne saisit qu'un code à 4 chiffres. En interne, ce code
// sert de mot de passe pour un compte Supabase Auth classique dont
// l'email technique est fixé par rôle (voir config.js). Ce mapping est
// invisible pour l'utilisateur final.

/**
 * Tente une connexion avec le rôle choisi et le code PIN saisi.
 * @param {'consommateur'|'acheteur'} role
 * @param {string} pin - code à 4 chiffres
 * @returns {Promise<void>}
 * @throws en cas d'échec (mauvais PIN, réseau, etc.)
 */
async function loginWithPin(role, pin) {
  const email = ROLE_EMAILS[role];
  const { error } = await supabaseClient.auth.signInWithPassword({
    email,
    password: pin,
  });
  if (error) throw error;
}

/** Déconnecte l'utilisateur courant et efface la session locale. */
async function logout() {
  await supabaseClient.auth.signOut();
}

/**
 * Déduit le rôle ('consommateur' | 'acheteur') de la session Supabase
 * actuelle, à partir de l'email technique du compte connecté.
 * @returns {Promise<string|null>} le rôle, ou null si pas de session
 */
async function getCurrentRole() {
  const { data } = await supabaseClient.auth.getSession();
  const session = data.session;
  if (!session) return null;
  const email = session.user.email;
  return Object.keys(ROLE_EMAILS).find((role) => ROLE_EMAILS[role] === email) || null;
}
