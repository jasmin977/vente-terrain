import type { CapacitorConfig } from '@capacitor/cli';

// Développement : `LIVE_RELOAD=1 npx cap sync android` charge l'app depuis le
// serveur Vite du PC (live-reload, avec `adb reverse tcp:5173 tcp:5173`).
// Sans cette variable (APK de production), l'app embarque le build de `dist`.
const liveReload = process.env.LIVE_RELOAD === '1';

const config: CapacitorConfig = {
  appId: 'com.bonneaffaire.venteterrain',
  appName: 'Vente Terrain',
  webDir: 'dist',
  ...(liveReload && {
    server: {
      url: 'http://localhost:5173',
      cleartext: true,
    },
  }),
};

export default config;
