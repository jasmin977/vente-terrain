import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bonneaffaire.venteterrain',
  appName: 'Revive Cosmetix',
  webDir: 'dist',
  server: {
    // Charge l'app depuis le serveur Vite en dev pour le live-reload natif.
    // À retirer (ou commenter) avant de builder un APK de production.
    url: 'http://localhost:5173',
    cleartext: true,
  },
};

export default config;
