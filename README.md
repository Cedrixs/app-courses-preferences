# Courses & Préférences

Application (PWA) pour partager des préférences alimentaires entre un **consommateur** et un **acheteur**, en vue de faire les courses.

- Frontend : HTML / CSS / JS, Vue 3 (via CDN, sans étape de build), déployé sur GitHub Pages.
- Backend : Supabase (base de données Postgres, stockage de fichiers, authentification).
- Connexion : écran "code PIN" à 4 chiffres, sans email ni mot de passe visible.

Ce document explique comment finaliser la configuration. Il y a des étapes que **toi seul** peux faire (création de comptes), et d'autres que je peux faire pour toi si tu me le demandes (le push du code).

---

## 1. Créer le projet Supabase

1. Va sur [supabase.com](https://supabase.com), crée un compte gratuit puis clique sur **New project**.
2. Choisis un nom (ex. `courses-preferences`), un mot de passe de base de données (garde-le de côté, tu n'en auras pas besoin au quotidien) et une région proche de toi.
3. Attends que le projet soit prêt (1-2 minutes).

## 2. Exécuter le script SQL (tables, sécurité, stockage)

1. Dans le menu de gauche de Supabase, ouvre **SQL Editor**.
2. Clique sur **New query**.
3. Ouvre le fichier [`sql/schema.sql`](sql/schema.sql) de ce projet, copie tout son contenu, colle-le dans l'éditeur SQL.
4. Clique sur **Run**.

Ce script crée :
- les 3 tables (`categories`, `photos`, `comments`) avec les 12 catégories de base ;
- toutes les règles de sécurité (Row Level Security) qui appliquent les droits décrits dans le cahier des charges ;
- le bucket de stockage `photos` avec ses propres règles d'accès.

Si tu relances le script plus tard (par erreur), il ne dupliquera pas les catégories ni le bucket (grâce aux clauses `on conflict`), mais il **échouera sur la création des policies** si elles existent déjà. C'est normal et sans danger : les tables et données existantes ne sont pas affectées.

## 3. Créer les deux comptes utilisateurs (consommateur / acheteur)

L'application n'affiche jamais d'email ni de mot de passe classique, mais elle s'appuie en interne sur deux comptes Supabase Auth avec un email technique fixe.

1. Dans Supabase, va dans **Authentication** > **Users**.
2. Clique sur **Add user** > **Create new user**.
3. Crée le premier compte :
   - Email : `consommateur@app.local`
   - Password : `1234` (le code PIN du consommateur — voir section 6 pour le changer)
   - Coche bien **Auto Confirm User** (sinon la connexion échouera, car il n'y a pas de vraie boîte mail pour confirmer le compte).
4. Recommence pour le second compte :
   - Email : `acheteur@app.local`
   - Password : `5678`
   - Coche également **Auto Confirm User**.

⚠️ Supabase exige un mot de passe d'au moins 6 caractères par défaut. Si tu veux un vrai code à 4 chiffres, va dans **Authentication** > **Providers** > **Email**, et réduis `Minimum password length` à `4` **avant** de créer les comptes (ou modifie-le après, puis remets à jour le mot de passe des 2 comptes déjà créés depuis l'onglet Users).

## 4. Récupérer l'URL et la clé publique du projet

1. Dans Supabase, va dans **Project Settings** > **API**.
2. Note les deux valeurs suivantes :
   - **Project URL** (ex. `https://abcdefgh.supabase.co`)
   - **anon public key** (une longue chaîne de caractères)

Ces informations sont sans danger à exposer côté client (ce sont les policies RLS qui protègent réellement les données), mais elles restent propres à ton projet.

## 5. Configurer le frontend

Ouvre le fichier [`js/config.js`](js/config.js) et remplace les deux valeurs par les tiennes :

```js
const SUPABASE_CONFIG = {
  url: 'https://abcdefgh.supabase.co',      // ta Project URL
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6...', // ta anon public key
};
```

## 6. Changer les codes PIN (recommandé)

Les codes `1234` / `5678` définis à l'étape 3 sont temporaires. Pour les changer :

1. Dans Supabase, va dans **Authentication** > **Users**.
2. Clique sur le compte concerné (`consommateur@app.local` ou `acheteur@app.local`).
3. Utilise l'option pour réinitialiser / définir un nouveau mot de passe (le nouveau code PIN).

Aucune modification du code n'est nécessaire : le code saisi dans l'application est directement transmis comme mot de passe.

## 7. Tester en local avant de mettre en ligne

Le navigateur bloque l'accès à l'appareil photo et à certaines fonctions (génération d'identifiants) en dehors de `https://` ou `http://localhost`. Pour tester sur ton ordinateur :

```bash
# Depuis le dossier du projet, avec Python déjà installé :
python -m http.server 8080
# puis ouvre http://localhost:8080 dans ton navigateur
```

(ou tout autre serveur statique local équivalent, comme `npx serve`).

## 8. Déployer sur GitHub Pages

Si ce dépôt est déjà connecté à GitHub (voir section suivante) :

1. Sur GitHub, va dans l'onglet **Settings** du dépôt.
2. Dans le menu de gauche, clique sur **Pages**.
3. Sous **Build and deployment** > **Source**, choisis **Deploy from a branch**.
4. Choisis la branche `main` et le dossier `/ (root)`, puis **Save**.
5. Attends 1-2 minutes : GitHub affiche l'URL publique du site (ex. `https://cedrixs.github.io/app-courses-preferences/`).

L'application nécessitant une connexion internet pour fonctionner (toutes les données viennent de Supabase), il n'y a rien d'autre à configurer côté hébergement.

## 9. Installer l'application sur l'écran d'accueil

- **iPhone (Safari)** : ouvre l'URL du site, appuie sur le bouton de partage (carré avec flèche vers le haut), puis **Sur l'écran d'accueil**.
- **Android (Chrome)** : ouvre l'URL du site, menu ⋮ en haut à droite, puis **Ajouter à l'écran d'accueil** (ou une bannière d'installation apparaît automatiquement).

---

## Structure du projet

```
index.html              Page unique de l'application (toutes les vues)
manifest.json            Manifeste PWA (nom, icônes, couleurs)
service-worker.js        Service worker minimal (installation + cache léger)
css/style.css            Styles (mobile-first)
js/config.js              Configuration Supabase (URL + clé) — À COMPLÉTER
js/supabase-client.js    Initialisation du client Supabase
js/auth.js               Connexion par code PIN
js/image-utils.js        Compression des photos avant envoi
js/api.js                 Toutes les requêtes vers la base de données et le stockage
js/app.js                 Application Vue 3 (état, navigation, glisser-déposer)
icons/                    Icônes de la PWA
sql/schema.sql            Script SQL complet (tables, sécurité, stockage)
```

## Fonctionnement des droits (résumé)

Tout est appliqué à deux niveaux : dans l'interface (boutons visibles ou non selon le rôle) et surtout dans la base de données via les policies RLS du fichier `sql/schema.sql`, qui sont la véritable barrière de sécurité.

- **Consommateur** : ajoute des photos classées, réordonne le classement, évalue les propositions de l'acheteur, supprime ses propres photos, commente tout.
- **Acheteur** : consulte tout, propose des photos (non classées), commente tout, ne peut ni classer ni supprimer les photos du consommateur.

---

## ⚠️ Ce qu'il te reste à faire manuellement

Je ne peux pas créer de comptes à ta place (Supabase, GitHub) ni cliquer dans leurs interfaces web. Voici la liste complète :

1. **Créer le projet Supabase** (section 1).
2. **Copier-coller le script `sql/schema.sql`** dans le SQL Editor de Supabase et l'exécuter (section 2).
3. **Créer les 2 comptes** `consommateur@app.local` et `acheteur@app.local` dans Supabase Auth, avec leurs codes PIN, en cochant "Auto Confirm User" (section 3).
4. **Copier l'URL et la clé anon** de ton projet Supabase dans `js/config.js` (sections 4 et 5).
5. **Activer GitHub Pages** sur le dépôt, une fois le code poussé (section 8).
6. *(Optionnel mais recommandé)* Changer les codes PIN temporaires `1234` / `5678` (section 6).

Une fois ces étapes faites, l'application est pleinement fonctionnelle, sans aucun autre entretien technique nécessaire.
