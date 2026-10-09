import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { IonApp, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import Login from './pages/Login';
import EspaceSociete from './societe/EspaceSociete';
import { SocieteProvider } from './societe/SocieteContext';
import { AuthProvider } from './auth/AuthContext';
import PrivateRoute from './auth/PrivateRoute';
import { getLang, onLangChange } from './i18n';

/* Core CSS required for Ionic components to work properly */
import '@ionic/react/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';

/* Optional CSS utils that can be commented out */
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';

/**
 * Ionic Dark Mode
 * -----------------------------------------------------
 * For more info, please see:
 * https://ionicframework.com/docs/theming/dark-mode
 */

/* Ionic's dark palettes are not imported: light and dark themes are both
   defined from our own tokens in theme/variables.css (prefers-color-scheme). */

/* Fonts are bundled (no network): sellers work with poor coverage.
   Arabic: IBM Plex Sans Arabic (interface) + Amiri (large titles). */
import '@fontsource-variable/manrope';
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-700.css';
import '@fontsource/amiri/arabic-400.css';
import '@fontsource/amiri/arabic-700.css';
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-ext-400.css';

/* Design system */
import './theme/variables.css';
import './theme/global.css';
import './theme/components.css';

setupIonicReact();

const App: React.FC = () => {
  // Changement de langue : on remonte l'arbre des écrans pour que tous les
  // textes, dates et le sens de lecture (rtl) soient recalculés. La session
  // (AuthProvider) est conservée.
  const [lang, setLang] = useState(getLang());
  useEffect(() => {
    const off = onLangChange(setLang);
    return () => {
      off();
    };
  }, []);

  return (
  <IonApp>
    <AuthProvider>
      <SocieteProvider>
      <IonReactRouter key={lang}>
        {/* Connexion ↔ application est un changement de racine, pas une pile de
            navigation : un simple <Routes>. Avec un IonRouterOutlet ici, l'écran
            de l'application restait invisible (ion-page-invisible) après la
            connexion. La navigation empilée reste gérée par l'outlet des onglets. */}
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <PrivateRoute>
                <EspaceSociete />
              </PrivateRoute>
            }
          />
        </Routes>
      </IonReactRouter>
      </SocieteProvider>
    </AuthProvider>
  </IonApp>
  );
};

export default App;
