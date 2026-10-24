import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FournisseurCaisse, useCaisse } from "./etat";
import { Appairage, Connexion, Ouverture } from "./ecrans/Accueil";
import { Vente } from "./ecrans/Vente";
import "./styles.css";

/** Parcours : appairage du PC → connexion du caissier → ouverture (fond de caisse) → vente. */
function App() {
  const { pret, appairage, config, erreurConfig, caissier, etat, rafraichirConfig, oublierAppairage, aEnvoyer, deconnecter } = useCaisse();
  if (!pret) return <div className="chargement">Démarrage de la caisse…</div>;
  if (!appairage) return <Appairage />;
  if (!config)
    return (
      <div className="accueil">
        <div className="accueil__carte">
          <h1>Catalogue indisponible</h1>
          <p className="accueil__aide">{erreurConfig ?? "Téléchargement du catalogue…"}</p>
          <button type="button" className="btn btn--primaire btn--grand" onClick={() => void rafraichirConfig()}>
            Réessayer
          </button>
          {aEnvoyer === 0 && (
            <button type="button" className="btn btn--discret" onClick={() => void oublierAppairage()}>
              Associer à une autre caisse
            </button>
          )}
        </div>
      </div>
    );
  if (!caissier) return <Connexion />;
  if (!etat.session) return <Ouverture />;
  if (etat.session.caissierId !== caissier.id && !caissier.droits.cloture) {
    const nom = config.caissiers.find((c) => c.id === etat.session!.caissierId)?.nom ?? "un autre caissier";
    return (
      <div className="accueil">
        <div className="accueil__carte">
          <h1>Session de {nom}</h1>
          <p className="accueil__aide">La caisse est ouverte par {nom}. Connectez-vous avec son code, ou demandez à un responsable de faire la clôture (Z).</p>
          <button type="button" className="btn btn--primaire btn--grand" onClick={deconnecter}>
            Changer de caissier
          </button>
        </div>
      </div>
    );
  }
  return (
    <>
      {erreurConfig && <div className="alerte-globale">{erreurConfig}</div>}
      <Vente />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FournisseurCaisse>
      <App />
    </FournisseurCaisse>
  </StrictMode>,
);
