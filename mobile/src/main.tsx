import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { Capacitor } from '@capacitor/core';
import { initLang } from './i18n';

const container = document.getElementById('root');
const root = createRoot(container!);
// Langue enregistrée (fr / ar) appliquée avant le premier rendu : pas de
// flash en français ni de bascule de sens de lecture au démarrage.
initLang().finally(() => {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
// Web : service worker minimal (public/sw.js) qui rend l'application installable. Pas sur le téléphone
// (application Capacitor) ni en développement.
if ('serviceWorker' in navigator && import.meta.env.PROD && !Capacitor.isNativePlatform()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
