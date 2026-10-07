import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
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