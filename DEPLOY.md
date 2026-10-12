# Déploiement

## 1. Backend sur Vercel (Neon + Blob)

1. **Créer le projet** — vercel.com → *Add New… → Project* → importer `jasmin977/vente-terrain`.
   - **Root Directory** : `backend`
   - **Framework Preset** : *Other*
   - Ne rien changer d'autre, puis *Deploy*. Ce premier déploiement échoue (pas encore de base) : c'est normal.
2. **Base de données** — onglet *Storage* du projet → *Create Database* → **Neon** (Postgres) → connecter au projet, tous les environnements. Vercel ajoute `DATABASE_URL` et `DATABASE_URL_UNPOOLED`.
3. **Photos** — *Storage* → *Create* → **Blob** → connecter au projet. Vercel ajoute `BLOB_READ_WRITE_TOKEN`.
4. **Variables** — *Settings → Environment Variables* :
   - `JWT_SECRET` : une longue valeur aléatoire, générée avec
     `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
   - `JWT_EXPIRES_IN` : `12h`
5. **Redéployer** — *Deployments* → dernier déploiement → *Redeploy*. Le build applique les migrations (`prisma migrate deploy`).
6. **Vérifier** — `https://<votre-projet>.vercel.app/health` doit répondre `{"status":"ok"}`.
7. **Comptes de départ** — depuis `backend/`, en pointant sur Neon (URL dans *Storage → Neon → .env.local*) et avec vos propres mots de passe (sans eux, ce seraient `admin1234` / `vendeur1234`, publics dans ce dépôt) :
   ```
   DATABASE_URL="<url Neon>" SEED_ADMIN_PASSWORD="<mot de passe admin>" SEED_VENDEUR_PASSWORD="<mot de passe vendeur>" npm run seed
   ```
   Le seed crée seulement les comptes et la première société : le catalogue s'importe depuis l'app (*Stock › Articles › Importer depuis Excel*), les photos s'ajoutent depuis la fiche de chaque article (Vercel Blob). Relancer le seed ne touche pas aux comptes existants.

Les jours et mois calculés par le serveur suivent l'heure de Tunis (`src/fuseau.ts`, modifiable avec la variable `APP_TIMEZONE`).

## Application web (navigateur)

La même application (`mobile/`) tourne dans un navigateur : sur ordinateur, barre latérale, listes en tableau, boîtes de dialogue ; sur tablette et téléphone, la mise en page mobile. Elle utilise la même API, les mêmes comptes et la même base que l'APK.

1. **Créer le projet** — vercel.com → *Add New… → Project* → importer `jasmin977/vente-terrain` (un second projet, à côté de celui du backend).
   - **Root Directory** : `mobile`
   - **Framework Preset** : *Vite* (le fichier `mobile/vercel.json` règle déjà la commande de build, le dossier `dist` et la redirection des pages vers `index.html`).
2. **Variable** — *Settings → Environment Variables* : `VITE_API_URL` = `https://<votre-projet-backend>.vercel.app/api` (adresse de l'API, avec `/api`).
3. **Déployer.** L'application est servie en HTTPS (obligatoire pour la caméra du scanner de code-barres et pour l'installation).
4. **Installer** (facultatif) — dans Chrome / Edge : icône « Installer » de la barre d'adresse ; sur téléphone : *Ajouter à l'écran d'accueil*.

En local : `cd mobile && npm run dev` (http://localhost:5173) avec le backend sur le port 3000 ; `npm run build:web` produit `mobile/dist`.

Ce qui change dans le navigateur par rapport à l'APK :
- **Scanner de code-barres** : pas de caméra sur le web. On utilise une douchette USB / Bluetooth : elle « tape » le code dans le champ actif, suivi d'Entrée (dans une recherche, c'est un scan ; sur une nouvelle fiche article, la fiche existante s'ouvre).
- **Impression** : les bons s'impriment avec la boîte d'impression du navigateur (A4, ou PDF) ; pas de ticket thermique Wi-Fi.
- **Date d'expiration** : saisie manuelle `jj/mm/aaaa` (la lecture par la caméra est propre à l'application du téléphone).
- **Hors ligne** : le mode hors ligne des vendeurs (file d'actions, copie du catalogue) s'appuie sur le stockage du navigateur ; le web n'a pas de service worker de cache, il vaut mieux l'utiliser en ligne.

## 2. APK Android signé

Prérequis : JDK 21, Android SDK, et la clé de signature `mobile/android/revive-cosmetix-release.jks` avec `mobile/android/keystore.properties` (hors git — **à sauvegarder** : sans cette clé, les téléphones ne pourront plus recevoir de mise à jour).

```
cd mobile
VITE_API_URL=https://<votre-projet>.vercel.app/api npm run build
npx cap sync android
cd android && ./gradlew assembleRelease
```

APK : `mobile/android/app/build/outputs/apk/release/app-release.apk`. Pour une nouvelle version, augmenter `versionCode` (et `versionName`) dans `mobile/android/app/build.gradle`.

## Développement sur téléphone (live-reload)

```
cd mobile
LIVE_RELOAD=1 npx cap sync android
adb reverse tcp:5173 tcp:5173 && adb reverse tcp:3000 tcp:3000
npx cap run android
```
