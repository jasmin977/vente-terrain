import { useEffect, useState } from "react";
import { useCaisse } from "../etat";
import { Clavier, Pave } from "../composants/communs";
import { heure, lireNombre, montant } from "../lib/format";

/** Appairage : adresse du serveur et code à 6 chiffres affiché par l'admin (Caisse › Postes de caisse). */
export function Appairage() {
  const { appairerCaisse } = useCaisse();
  const [serveur, setServeur] = useState("localhost:3000");
  // Écran tactile : d'abord l'adresse du serveur (clavier), puis le code (pavé).
  const [etape, setEtape] = useState<"serveur" | "code">("serveur");
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const valider = async () => {
    if (code.length !== 6 || !serveur.trim()) return;
    setEnCours(true);
    setErreur(null);
    try {
      await appairerCaisse(serveur, code);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Appairage impossible");
      setCode("");
    } finally {
      setEnCours(false);
    }
  };
  return (
    <div className="accueil">
      {etape === "serveur" ? (
        <div className="accueil__carte accueil__carte--large">
          <h1>Associer cette caisse</h1>
          <p className="accueil__aide">1 / 2 · Adresse du serveur (ordinateur où tourne l'application de gestion), par exemple 192.168.1.10:3000.</p>
          <label className="champ">
            <span>Adresse du serveur</span>
            <input value={serveur} inputMode="none" onChange={(e) => setServeur(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="192.168.1.10:3000" spellCheck={false} />
          </label>
          <Clavier valeur={serveur} onChange={setServeur} onValider={() => serveur.trim() && setEtape("code")} libelleValider="Suivant" />
        </div>
      ) : (
        <div className="accueil__carte">
          <h1>Associer cette caisse</h1>
          <p className="accueil__aide">
            2 / 2 · Dans l'application de gestion : <b>Réglages caisse › Postes de caisse</b>, ouvrez la caisse puis <b>Générer un code d'appairage</b>.
          </p>
          <p className="info">Serveur : {serveur}</p>
          <span className="champ__titre">Code d'appairage</span>
          {erreur && <p className="alerte">{erreur}</p>}
          <Pave valeur={code} onChange={setCode} onValider={() => void valider()} max={6} desactive={enCours || code.length !== 6} libelleValider={enCours ? "Connexion…" : "Associer la caisse"} />
          <button type="button" className="btn btn--discret" onClick={() => setEtape("serveur")}>
            Changer l'adresse du serveur
          </button>
        </div>
      )}
    </div>
  );
}

function Horloge() {
  const [maintenant, setMaintenant] = useState(new Date());
  useEffect(() => {
    const i = setInterval(() => setMaintenant(new Date()), 15_000);
    return () => clearInterval(i);
  }, []);
  return <span>{heure(maintenant)}</span>;
}

/** Connexion du caissier avec son code. */
export function Connexion() {
  const { config, identifier, connecter, etat, aEnvoyer, enLigne } = useCaisse();
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [verif, setVerif] = useState(false);
  const valider = async () => {
    if (code.length < 4) return;
    setVerif(true);
    const c = await identifier(code);
    setVerif(false);
    setCode("");
    if (!c) return setErreur("Code inconnu.");
    connecter(c);
  };
  const ouvertePar = etat.session ? config?.caissiers.find((c) => c.id === etat.session!.caissierId)?.nom : null;
  return (
    <div className="accueil">
      <div className="accueil__carte">
        <p className="accueil__societe">{config?.societe.nom}</p>
        <h1>{config?.caisse.nom}</h1>
        <p className="accueil__aide">
          <Horloge /> · {enLigne ? "connectée" : "hors ligne"}
          {aEnvoyer > 0 && ` · ${aEnvoyer} en attente d'envoi`}
        </p>
        {etat.session && <p className="info">Session ouverte par {ouvertePar ?? "un caissier"}.</p>}
        <span className="champ__titre">Votre code</span>
        {erreur && <p className="alerte">{erreur}</p>}
        <Pave valeur={code} onChange={setCode} onValider={() => void valider()} masque max={6} desactive={verif || code.length < 4} libelleValider={verif ? "Vérification…" : "Se connecter"} />
      </div>
    </div>
  );
}

/** Ouverture de la caisse : fond de caisse (espèces dans le tiroir au départ). */
export function Ouverture() {
  const { caissier, ouvrirSession, deconnecter } = useCaisse();
  const [fond, setFond] = useState("");
  const valeur = fond === "" ? 0 : lireNombre(fond);
  return (
    <div className="accueil">
      <div className="accueil__carte">
        <p className="accueil__societe">Bonjour {caissier?.nom}</p>
        <h1>Ouverture de la caisse</h1>
        <p className="accueil__aide">Comptez les espèces du tiroir et saisissez le fond de caisse.</p>
        <Pave valeur={fond} onChange={setFond} onValider={() => ouvrirSession(valeur)} decimal desactive={Number.isNaN(valeur)} libelleValider={`Ouvrir avec ${montant(valeur || 0)} DT`} />
        <button type="button" className="btn btn--discret" onClick={deconnecter}>
          Changer de caissier
        </button>
      </div>
    </div>
  );
}
