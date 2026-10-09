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
   DATABASE_URL="<url Neon>" BLOB_READ_WRITE_TOKEN="<jeton Blob>" SEED_ADMIN_PASSWORD="<mot de passe admin>" SEED_VENDEUR_PASSWORD="<mot de passe vendeur>" npm run seed
   ```
   `BLOB_READ_WRITE_TOKEN` (Vercel → *Storage → Blob → .env.local*) est **obligatoire en production** : le seed y envoie les photos de `backend/prisma/images/` (nommées `<code>.png|jpg`). Sans lui, il les copie dans `backend/uploads/` (développement local uniquement).
   Relancer le seed met à jour articles et photos sans toucher aux comptes existants.

Les jours et mois calculés par le serveur suivent l'heure de Tunis (`src/fuseau.ts`, modifiable avec la variable `APP_TIMEZONE`).

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
