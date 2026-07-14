// =====================================================================
// Feedback multimodal (annonces lecteur d'écran + vibration + son)
// =====================================================================
// Une région aria-live montée en permanence (masquée visuellement,
// jamais affichée à l'écran) annonce chaque action clé aux technologies
// d'assistance, doublée d'une vibration courte et d'un bref son.
// Indépendant du mode confort visuel : un lecteur d'écran peut être
// utilisé avec l'interface actuelle inchangée (data-a11y="off").

const liveRegion = document.createElement('div');
liveRegion.id = 'live-region';
liveRegion.setAttribute('role', 'status');
liveRegion.setAttribute('aria-live', 'polite');
// Masqué visuellement mais accessible aux lecteurs d'écran (voir la
// classe .sr-only dans css/style.css, sans display:none qui le
// rendrait invisible aussi pour l'API d'accessibilité).
liveRegion.className = 'sr-only';
document.body.appendChild(liveRegion);

let audioCtx = null;

/** Joue un bref bip via Web Audio (aucun fichier son à charger/héberger). */
function playBeep(frequency = 880, durationMs = 80) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.value = 0.1;
    oscillator.connect(gain).connect(audioCtx.destination);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + durationMs / 1000);
  } catch (err) {
    // Web Audio indisponible (navigateur, contexte non débloqué par une
    // interaction utilisateur, etc.) : l'annonce aria-live reste émise,
    // on ignore silencieusement l'échec du son.
  }
}

/**
 * Annonce `msg` aux technologies d'assistance et déclenche un retour
 * haptique/sonore court. À appeler après chaque action clé (ajout,
 * suppression, changement de quantité, validation, erreur).
 * @param {string} msg
 * @param {{vibrate?: boolean, sound?: boolean}} [options]
 */
function announce(msg, options = {}) {
  const { vibrate = true, sound = true } = options;

  // On vide puis réinjecte après un court délai : un lecteur d'écran ne
  // relit pas un aria-live si le texte est strictement identique au
  // message précédent (ex. deux suppressions successives). setTimeout
  // plutôt que requestAnimationFrame : ce dernier peut rester en pause
  // indéfiniment si l'onglet passe en arrière-plan.
  liveRegion.textContent = '';
  setTimeout(() => {
    liveRegion.textContent = msg;
  }, 50);

  if (vibrate && 'vibrate' in navigator && a11y.vibrateEnabled()) {
    navigator.vibrate(40);
  }
  if (sound && a11y.soundEnabled()) {
    playBeep();
  }
}
