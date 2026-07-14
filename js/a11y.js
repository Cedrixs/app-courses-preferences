// =====================================================================
// Mode confort visuel (accessibilité basse vision)
// =====================================================================
// Gère l'état persistant du mode confort (on/off), du thème (clair/sombre)
// et de la taille de texte, reflété sur <html> via des attributs data-*
// (data-a11y, data-theme, data-text-size) lus par les tokens CSS de
// css/style.css. Ce module ne pose aucune classe ni style directement :
// tant qu'aucun bloc CSS ne cible ces attributs, l'interface actuelle
// reste strictement intacte (data-a11y="off" ou absent = comportement
// existant).

const A11Y_KEYS = {
  mode: 'a11yMode',
  theme: 'a11yTheme',
  textSize: 'a11yTextSize',
  vibrate: 'a11yVibrate',
  sound: 'a11ySound',
};

const a11y = {
  /**
   * Applique l'état persistant (localStorage) sur <html>. À appeler au
   * démarrage de l'app et à chaque changement de rôle : la valeur par
   * défaut du mode dépend du rôle (ON par défaut pour le consommateur,
   * OFF sinon) tant que l'utilisateur n'a pas réglé la préférence
   * explicitement (présence de la clé dans localStorage).
   * @param {'consommateur'|'acheteur'|null} role
   */
  init(role) {
    const storedMode = localStorage.getItem(A11Y_KEYS.mode);
    const mode = storedMode ?? (role === 'consommateur' ? 'on' : 'off');
    document.documentElement.dataset.a11y = mode;
    document.documentElement.dataset.theme = localStorage.getItem(A11Y_KEYS.theme) || 'light';
    document.documentElement.dataset.textSize = localStorage.getItem(A11Y_KEYS.textSize) || 'normal';
  },

  isOn() {
    return document.documentElement.dataset.a11y === 'on';
  },

  setMode(mode) {
    localStorage.setItem(A11Y_KEYS.mode, mode);
    document.documentElement.dataset.a11y = mode;
  },

  setTheme(theme) {
    localStorage.setItem(A11Y_KEYS.theme, theme);
    document.documentElement.dataset.theme = theme;
  },

  setTextSize(size) {
    localStorage.setItem(A11Y_KEYS.textSize, size);
    document.documentElement.dataset.textSize = size;
  },

  setVibrate(enabled) {
    localStorage.setItem(A11Y_KEYS.vibrate, enabled ? 'on' : 'off');
  },

  setSound(enabled) {
    localStorage.setItem(A11Y_KEYS.sound, enabled ? 'on' : 'off');
  },

  // Par défaut (absence de préférence enregistrée), vibration et son
  // sont activés : seule une préférence explicite 'off' les désactive.
  vibrateEnabled() {
    return localStorage.getItem(A11Y_KEYS.vibrate) !== 'off';
  },

  soundEnabled() {
    return localStorage.getItem(A11Y_KEYS.sound) !== 'off';
  },
};

// Synchronisation multi-onglets : si le réglage change dans un autre
// onglet (même appareil, même compte), on reflète l'attribut ici sans
// recharger la page. L'évènement "storage" n'est déclenché que dans les
// onglets *autres* que celui qui a fait le changement.
window.addEventListener('storage', (event) => {
  if (event.key === A11Y_KEYS.mode && event.newValue) {
    document.documentElement.dataset.a11y = event.newValue;
  } else if (event.key === A11Y_KEYS.theme && event.newValue) {
    document.documentElement.dataset.theme = event.newValue;
  } else if (event.key === A11Y_KEYS.textSize && event.newValue) {
    document.documentElement.dataset.textSize = event.newValue;
  }
});
