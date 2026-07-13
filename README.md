# Courses & Préférences

Application (PWA) pour partager des préférences alimentaires entre un **consommateur** et un **acheteur**, en vue de faire les courses.

- Frontend : HTML / CSS / JS, Vue 3 (via CDN, sans étape de build), déployé sur GitHub Pages.
- Backend : Supabase (base de données Postgres, stockage de fichiers, authentification).
- Connexion : écran "code PIN" à 6 chiffres, sans email ni mot de passe visible.

## ✅ État actuel : tout est configuré et en ligne

- **Site en ligne** : https://cedrixs.github.io/app-courses-preferences/
- **Projet Supabase** : `ghbqykqeupjcpkoockep` (région choisie à la création). URL du projet : `https://ghbqykqeupjcpkoockep.supabase.co`.
- **Base de données, sécurité (RLS) et bucket de stockage** : créés via `sql/schema.sql`, exécuté une fois dans le SQL Editor de Supabase.
- **Comptes utilisateurs** : `consommateur@app.local` et `acheteur@app.local` créés dans Supabase Auth, connexion validée par code PIN à **6 chiffres** (longueur par défaut de Supabase — aucun réglage à changer côté Supabase).
- **`js/config.js`** : déjà rempli avec l'URL et la clé publique (anon) du projet.
- **GitHub Pages** : activé sur la branche `main`, dossier `/ (root)`.
- **Anti-pause Supabase** : une GitHub Action (`.github/workflows/keep-supabase-alive.yml`) ping l'API Supabase tous les lundis et jeudis pour empêcher la mise en pause automatique après 7 jours d'inactivité (voir section dédiée plus bas).

Tu n'as normalement plus rien à configurer. Les sections ci-dessous servent de mémo si tu dois un jour changer quelque chose (code PIN, catégories, redéploiement...).

---

## Si l'app ne répond plus : le projet Supabase est probablement en pause

Le plan gratuit de Supabase met un projet en pause après 7 jours **sans aucune requête API**. La GitHub Action anti-pause est censée l'empêcher, mais si jamais ça arrive quand même (Action désactivée, échec répété...) :

1. Va sur [supabase.com](https://supabase.com), ouvre le projet.
2. S'il affiche un badge **Paused**, clique sur **Restore project** (ou **Resume**).
3. Attends 1-2 minutes : aucune donnée n'est perdue, le service redémarre simplement.

Pour vérifier que l'anti-pause fonctionne : sur GitHub, onglet **Actions** du dépôt → workflow **"Garder le projet Supabase actif"** → doit afficher des exécutions récentes avec une coche verte. Tu peux aussi le lancer manuellement via **Run workflow**.

---

## Changer les codes PIN

1. Dans Supabase : **Authentication** > **Users**.
2. Clique sur le compte concerné (`consommateur@app.local` ou `acheteur@app.local`).
3. Réinitialise / définis un nouveau mot de passe (= le nouveau code PIN, 6 chiffres minimum).

Aucune modification du code n'est nécessaire : le code saisi dans l'application est directement transmis comme mot de passe.

## Modifier les catégories

Depuis l'app elle-même (les deux rôles y ont accès) : bouton **⚙️ Gérer les catégories** sur l'écran d'accueil, pour ajouter, renommer ou supprimer une catégorie. Aucune manipulation en base nécessaire.

## Tester en local

Le navigateur bloque l'appareil photo et certaines fonctions (génération d'identifiants) en dehors de `https://` ou `http://localhost`. Pour tester sur ton ordinateur :

```bash
# Depuis le dossier du projet, avec Python déjà installé :
python -m http.server 8080
# puis ouvre http://localhost:8080 dans ton navigateur
```

(ou tout autre serveur statique local équivalent, comme `npx serve`).

## Réexécuter le script SQL (si besoin un jour)

`sql/schema.sql` est idempotent pour les tables/données (clauses `on conflict`), mais il **échouera sur la création des policies** si elles existent déjà — c'est normal et sans danger, les données existantes ne sont pas affectées. Si tu dois vraiment recréer les policies, supprime-les d'abord dans Supabase (Database > Policies) avant de relancer le script.

## Installer l'application sur l'écran d'accueil

- **iPhone (Safari)** : ouvre le site, bouton de partage (carré avec flèche vers le haut), puis **Sur l'écran d'accueil**.
- **Android (Chrome)** : ouvre le site, menu ⋮, puis **Ajouter à l'écran d'accueil** (ou une bannière d'installation apparaît automatiquement).

---

## Structure du projet

```
index.html                       Page unique de l'application (toutes les vues)
manifest.json                    Manifeste PWA (nom, icônes, couleurs)
service-worker.js                Service worker minimal (installation + cache léger)
css/style.css                    Styles (mobile-first)
js/config.js                     Configuration Supabase (URL + clé anon), déjà remplie
js/supabase-client.js            Initialisation du client Supabase
js/auth.js                       Connexion par code PIN
js/image-utils.js                Compression des photos avant envoi
js/api.js                        Toutes les requêtes vers la base de données et le stockage
js/app.js                        Application Vue 3 (état, navigation, glisser-déposer)
icons/                           Icônes de la PWA
sql/schema.sql                   Script SQL complet (tables, sécurité, stockage)
.github/workflows/keep-supabase-alive.yml   Ping anti-pause Supabase (lundi/jeudi)
```

## Fonctionnement des droits (résumé)

Tout est appliqué à deux niveaux : dans l'interface (boutons visibles ou non selon le rôle) et surtout dans la base de données via les policies RLS du fichier `sql/schema.sql`, qui sont la véritable barrière de sécurité.

- **Consommateur** : ajoute des photos classées, réordonne le classement (glisser-déposer), évalue les propositions de l'acheteur, supprime n'importe quelle photo (les siennes et celles de l'acheteur), commente tout.
- **Acheteur** : consulte tout (avec le produit préféré mis en avant), propose des photos (non classées, section "À évaluer"), commente tout, ne peut ni classer ni supprimer aucune photo.

## Historique des ajustements post-lancement

- Code PIN passé de 4 à 6 chiffres (Supabase impose 6 caractères minimum par défaut pour un mot de passe).
- Bouton de suppression d'une photo transformé en icône poubelle rouge isolée à droite de chaque carte, pour éviter les clics accidentels.
- Ajout de la GitHub Action anti-pause Supabase.
- Correction du bouton poubelle : `preventOnFilter: true` de SortableJS annulait le clic tactile sur le bouton (car il appelle `preventDefault()` sur le touchstart, ce qui empêche le navigateur de générer le clic correspondant) — passé à `false`.
- Le consommateur peut désormais supprimer aussi les photos proposées par l'acheteur, pas seulement les siennes (policy RLS `photos_delete_consommateur_only`).
