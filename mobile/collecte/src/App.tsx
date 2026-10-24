import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  envoyerCollecte,
  etatCollectes,
  listerSocietes,
  normaliserServeur,
  supprimerCollecteServeur,
  telechargerCatalogue,
  type CollecteServeur,
  type Societe,
} from "./api";
import {
  ecrireCatalogue,
  ecrireCollectes,
  ecrireConfig,
  ecrireReglages,
  ecrireSuppressions,
  lireCatalogue,
  lireCollectes,
  lireConfig,
  lireReglages,
  lireSuppressions,
  nouvelId,
  rattacherCollectes,
  type ArticleCatalogue,
  type Collecte,
  type Config,
} from "./stockage";
import { bip, cameraDisponible, dateHeure, nombre, quantiteTexte, scannerAvecCamera } from "./outils";

/** Adresse proposée tant qu'aucune n'est réglée (serveur du PC sur le Wi-Fi du dépôt). */
const SERVEUR_PAR_DEFAUT = import.meta.env.VITE_SERVEUR_COLLECTE ?? "http://10.0.0.139:3000";

type Ecran = { nom: "accueil" } | { nom: "scan"; id: string };

/* ---------------------------------------------------------------- Icônes (traits, 24 × 24) */

const TRACES: Record<string, string> = {
  menu: "M4 7h16M4 12h16M4 17h16",
  retour: "M15 5l-7 7 7 7",
  codebarre: "M4 6v12M7 6v12M10 6v12M14 6v12M17 6v12M20 6v12",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8z",
  poubelle: "M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  envoyer: "M4 12l16-8-6 16-3-6-7-2z",
  plus: "M12 5v14M5 12h14",
  moins: "M5 12h14",
  ok: "M5 12l5 5 9-10",
  alerte: "M12 4l9 16H3zM12 10v4M12 17v.5",
  nuage: "M7 18h10a4 4 0 00.5-8 6 6 0 00-11.4 1.5A3.5 3.5 0 007 18z",
  actualiser: "M20 11a8 8 0 10-2.3 5.7M20 5v6h-6",
  fermer: "M6 6l12 12M18 6L6 18",
  serveur: "M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01",
  societe: "M4 20V8l8-4 8 4v12M9 20v-6h6v6",
  balai: "M14 4l6 6M4 20l7-7M11 13l-4-4 6-3 4 4-3 6z",
  clavier: "M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8",
};

function Icone({ nom, taille = 22 }: { nom: string; taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={TRACES[nom]} />
    </svg>
  );
}

/* ---------------------------------------------------------------- Touche retour d'Android */

/**
 * Pile des écrans ouverts (scan, menu, feuilles) : la touche retour (Android) ferme celui du dessus au lieu de
 * quitter l'app. Chaque écran ajoute une entrée à l'historique du WebView ; fermé par un bouton, il la retire
 * (ce retour-là est ignoré).
 */
const pileRetour: { rappel: () => void; parRetour: boolean }[] = [];
let retoursIgnores = 0;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    if (retoursIgnores > 0) {
      retoursIgnores--;
      return;
    }
    const haut = pileRetour.pop();
    if (haut) {
      haut.parRetour = true;
      haut.rappel();
    }
  });
}

/** Tant que `actif`, la touche retour appelle `onRetour` (l'écran le plus récent d'abord). */
function useToucheRetour(actif: boolean, onRetour: () => void) {
  const rappel = useRef(onRetour);
  rappel.current = onRetour;
  useEffect(() => {
    if (!actif) return;
    const entree = { rappel: () => rappel.current(), parRetour: false };
    pileRetour.push(entree);
    history.pushState({ scanStock: pileRetour.length }, "");
    return () => {
      const i = pileRetour.indexOf(entree);
      if (i >= 0) pileRetour.splice(i, 1);
      if (!entree.parRetour) {
        retoursIgnores++;
        history.back();
      }
    };
  }, [actif]);
}

/* ---------------------------------------------------------------- Fenêtre de confirmation (feuille du bas) */

function Confirmation({
  titre,
  texte,
  action,
  danger,
  onOui,
  onNon,
}: {
  titre: string;
  texte: ReactNode;
  action: string;
  danger?: boolean;
  onOui: () => void;
  onNon: () => void;
}) {
  useToucheRetour(true, onNon);
  useEffect(() => {
    const touche = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onOui();
      } else if (e.key === "Escape") onNon();
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [onOui, onNon]);
  return (
    <div className="feuille" role="dialog" aria-label={titre}>
      <div className="feuille__voile" onClick={onNon} />
      <div className="feuille__panneau">
        <span className="feuille__poignee" aria-hidden="true" />
        <h2>{titre}</h2>
        <p>{texte}</p>
        <div className="feuille__actions">
          <button className="bouton bouton--doux" onClick={onNon}>
            Annuler
          </button>
          <button className={`bouton ${danger ? "bouton--danger" : "bouton--principal"}`} onClick={onOui}>
            {action} <kbd>↵</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Scan Stock, l'app des employés du dépôt : elle s'ouvre directement sur les collectes, sans compte. Le menu ☰
 * règle l'adresse du serveur et la société ; chaque société a sa propre liste de collectes et ses articles.
 */
export default function App() {
  const [config, setConfig] = useState<Config>(() => lireConfig() ?? { serveur: lireReglages().serveur || SERVEUR_PAR_DEFAUT, societeId: "", societeNom: "" });
  // Pas encore de société : le menu s'ouvre pour la choisir.
  const [menu, setMenu] = useState(() => !lireConfig()?.societeId);
  const [version, setVersion] = useState(0);

  const changer = (c: Config) => {
    ecrireConfig(c);
    ecrireReglages({ ...lireReglages(), serveur: c.serveur });
    if (c.societeId) rattacherCollectes(c.societeId);
    setConfig(c);
  };

  return (
    <>
      <Espace key={`${config.serveur}|${config.societeId}|${version}`} config={config} onMenu={() => setMenu(true)} />
      <Menu
        ouvert={menu}
        config={config}
        onChanger={changer}
        onVider={() => {
          viderCollectes(config.serveur, config.societeId);
          setVersion((v) => v + 1);
          setMenu(false);
        }}
        onFermer={() => config.societeId && setMenu(false)}
      />
    </>
  );
}

/* ---------------------------------------------------------------- Suppression (appareil, puis serveur) */

/** Supprime des collectes de l'appareil ; celles déjà envoyées sont aussi supprimées sur le serveur. */
function supprimerCollectes(serveur: string, ids: string[]) {
  const liste = lireCollectes();
  const parties = liste.filter((c) => ids.includes(c.id));
  ecrireCollectes(liste.filter((c) => !ids.includes(c.id)));
  const aServeur = parties.filter((c) => c.envoyeeLe || c.statut !== "brouillon").map((c) => ({ id: c.id, societeId: c.societeId }));
  if (aServeur.length) {
    ecrireSuppressions([...lireSuppressions(), ...aServeur]);
    void suppressionsEnAttente(serveur);
  }
}

/** Vide toutes les collectes de la société. */
function viderCollectes(serveur: string, societeId: string) {
  supprimerCollectes(
    serveur,
    lireCollectes()
      .filter((c) => c.societeId === societeId)
      .map((c) => c.id),
  );
}

/** Supprime sur le serveur ce qui l'a été sur l'appareil (retenté au prochain passage si le Wi-Fi manque). */
async function suppressionsEnAttente(serveur: string) {
  let reste = lireSuppressions();
  for (const s of [...reste]) {
    try {
      await supprimerCollecteServeur(serveur, s.societeId, s.id);
      reste = reste.filter((x) => x.id !== s.id);
    } catch {
      // gardée pour plus tard
    }
  }
  ecrireSuppressions(reste);
}

/* ---------------------------------------------------------------- Menu latéral */

/** Menu latéral : société des collectes, adresse du serveur, et vider les collectes de la société. */
function Menu({
  ouvert,
  config,
  onChanger,
  onVider,
  onFermer,
}: {
  ouvert: boolean;
  config: Config;
  onChanger: (c: Config) => void;
  onVider: () => void;
  onFermer: () => void;
}) {
  const [serveur, setServeur] = useState(config.serveur);
  const [societes, setSocietes] = useState<Societe[] | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [connecte, setConnecte] = useState<boolean | null>(null);
  const [confirmer, setConfirmer] = useState(false);

  const charger = useCallback(async (adresse: string) => {
    setChargement(true);
    setErreur(null);
    try {
      const liste = await listerSocietes(adresse);
      setSocietes(liste);
      setConnecte(true);
      return liste;
    } catch (err) {
      setSocietes(null);
      setConnecte(false);
      setErreur(err instanceof Error ? err.message : "Serveur injoignable");
      return null;
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    if (!ouvert) return;
    setServeur(config.serveur);
    void charger(config.serveur).then((liste) => {
      // Une seule société sur le serveur : choisie d'office.
      if (liste && liste.length === 1 && !config.societeId) onChanger({ ...config, societeId: liste[0].id, societeNom: liste[0].nom });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert]);

  const enregistrerServeur = async () => {
    const adresse = normaliserServeur(serveur);
    setServeur(adresse);
    const liste = await charger(adresse);
    if (!liste) return;
    // La société choisie existe-t-elle sur ce serveur ? Sinon, à rechoisir.
    const garde = liste.find((s) => s.id === config.societeId);
    onChanger({ serveur: adresse, societeId: garde?.id ?? "", societeNom: garde?.nom ?? "" });
  };

  const nbCollectes = lireCollectes().filter((c) => c.societeId === config.societeId).length;
  useToucheRetour(ouvert && Boolean(config.societeId), onFermer);

  return (
    <div className={`menu${ouvert ? " menu--ouvert" : ""}`} aria-hidden={!ouvert}>
      <div className="menu__voile" onClick={onFermer} />
      <aside className="menu__panneau" role="dialog" aria-label="Menu">
        <div className="menu__tete">
          <span className="menu__logo">
            <Icone nom="codebarre" taille={26} />
          </span>
          <div>
            <strong>Scan Stock</strong>
            <span>Collecte du dépôt</span>
          </div>
          {config.societeId && (
            <button className="bouton-rond bouton-rond--doux" onClick={onFermer} aria-label="Fermer le menu">
              <Icone nom="fermer" />
            </button>
          )}
        </div>

        <section className="menu__bloc">
          <h2>
            <Icone nom="societe" taille={16} /> Société
          </h2>
          <p className="menu__aide">Les collectes partent dans la société choisie ; chacune a sa propre liste.</p>
          {chargement && !societes ? (
            <p className="menu__aide">Chargement…</p>
          ) : societes ? (
            <ul className="menu__societes">
              {societes.map((s) => (
                <li key={s.id}>
                  <button
                    className={`menu__societe${s.id === config.societeId ? " menu__societe--choisie" : ""}`}
                    onClick={() => {
                      onChanger({ ...config, societeId: s.id, societeNom: s.nom });
                      onFermer();
                    }}
                  >
                    <span className="menu__radio" aria-hidden="true" />
                    {s.nom}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            config.societeNom && <p className="menu__aide">Actuelle : {config.societeNom}</p>
          )}
          {!config.societeId && !chargement && societes && <p className="erreur">Choisissez la société de cet appareil.</p>}
        </section>

        <section className="menu__bloc">
          <h2>
            <Icone nom="serveur" taille={16} /> Serveur
            {connecte !== null && <span className={`pastille ${connecte ? "pastille--ok" : "pastille--ko"}`}>{connecte ? "Connecté" : "Injoignable"}</span>}
          </h2>
          <label className="champ">
            <span>Adresse IP du PC</span>
            <input value={serveur} onChange={(e) => setServeur(e.target.value)} inputMode="url" autoCapitalize="off" autoCorrect="off" placeholder="10.0.0.139:3000" />
            <small>Même Wi-Fi que le PC, avec le port (ex. 10.0.0.139:3000).</small>
          </label>
          {erreur && <p className="erreur">{erreur}</p>}
          <button className="bouton bouton--doux" disabled={chargement || !serveur.trim()} onClick={() => void enregistrerServeur()}>
            <Icone nom="actualiser" taille={18} />
            {chargement ? "Connexion…" : normaliserServeur(serveur) === config.serveur ? "Tester la connexion" : "Enregistrer l'adresse"}
          </button>
        </section>

        {config.societeId && (
          <section className="menu__bloc">
            <h2>
              <Icone nom="balai" taille={16} /> Données
            </h2>
            <p className="menu__aide">
              {nbCollectes} collecte{nbCollectes > 1 ? "s" : ""} pour {config.societeNom}.
            </p>
            <button className="bouton bouton--danger-doux" disabled={nbCollectes === 0} onClick={() => setConfirmer(true)}>
              <Icone nom="poubelle" taille={18} />
              Vider toutes les collectes
            </button>
          </section>
        )}
      </aside>
      {confirmer && (
        <Confirmation
          titre="Vider toutes les collectes ?"
          texte={`Les ${nbCollectes} collectes de ${config.societeNom} seront supprimées de cet appareil et du PC. Cette action est définitive.`}
          action="Tout vider"
          danger
          onNon={() => setConfirmer(false)}
          onOui={() => {
            setConfirmer(false);
            onVider();
          }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Accueil : les collectes de la société */

const statutCollecte = (c: Collecte, serveur?: CollecteServeur) =>
  c.statut === "brouillon"
    ? { texte: c.envoyeeLe ? "Modifiée" : "En cours", classe: "statut--cours" }
    : c.statut === "a_envoyer"
      ? { texte: "À envoyer", classe: "statut--attente" }
      : serveur?.nbImports
        ? { texte: `Importée ${serveur.nbImports}×`, classe: "statut--importee" }
        : { texte: "Envoyée", classe: "statut--envoyee" };

function Espace({ config, onMenu }: { config: Config; onMenu: () => void }) {
  const { serveur, societeId } = config;
  // Aperçu de test : une collecte à ouvrir directement (sessionStorage, posé seulement par la page d'aperçu).
  const [ecran, setEcran] = useState<Ecran>(() => {
    const id = sessionStorage.getItem("scanstock.ouvrir");
    return id ? { nom: "scan", id } : { nom: "accueil" };
  });
  const [toutes, setToutes] = useState<Collecte[]>(lireCollectes);
  const [catalogue, setCatalogue] = useState(() => lireCatalogue(societeId));
  const [envoyees, setEnvoyees] = useState<CollecteServeur[]>([]);
  const [message, setMessage] = useState<{ texte: string; ok: boolean } | null>(null);
  const [majCatalogue, setMajCatalogue] = useState(false);
  const [aSupprimer, setASupprimer] = useState<Collecte | null>(null);
  // La liste de la société choisie seulement.
  const collectes = useMemo(() => toutes.filter((c) => c.societeId === societeId), [toutes, societeId]);

  const enregistrer = useCallback((liste: Collecte[]) => {
    ecrireCollectes(liste);
    setToutes(liste);
  }, []);

  const actualiserCatalogue = useCallback(async () => {
    if (!societeId) return;
    setMajCatalogue(true);
    try {
      const articles = await telechargerCatalogue(serveur, societeId);
      ecrireCatalogue(societeId, articles);
      setCatalogue(lireCatalogue(societeId));
      setMessage({ texte: `${articles.length} articles à jour.`, ok: true });
    } catch (err) {
      setMessage({ texte: err instanceof Error ? err.message : "Catalogue indisponible", ok: false });
    } finally {
      setMajCatalogue(false);
    }
  }, [serveur, societeId]);

  const suivre = useCallback(() => {
    const ids = lireCollectes()
      .filter((c) => c.societeId === societeId && c.envoyeeLe)
      .slice(0, 100)
      .map((c) => c.id);
    if (societeId && ids.length) etatCollectes(serveur, societeId, ids).then(setEnvoyees).catch(() => undefined);
  }, [serveur, societeId]);

  // Envoie les collectes terminées pas encore reçues (toutes sociétés : chacune part dans la sienne).
  const envoyerEnAttente = useCallback(async () => {
    void suppressionsEnAttente(serveur);
    let liste = lireCollectes();
    const aEnvoyer = liste.filter((c) => c.statut === "a_envoyer" && c.societeId);
    if (aEnvoyer.length === 0) return suivre();
    let nb = 0;
    for (const c of aEnvoyer) {
      try {
        await envoyerCollecte(serveur, c);
        liste = liste.map((x) => (x.id === c.id ? { ...x, statut: "envoyee", envoyeeLe: Date.now(), erreur: undefined } : x));
        nb++;
      } catch (err) {
        liste = liste.map((x) => (x.id === c.id ? { ...x, erreur: err instanceof Error ? err.message : "Envoi impossible" } : x));
      }
    }
    enregistrer(liste);
    if (nb > 0) setMessage({ texte: nb > 1 ? `${nb} collectes envoyées au PC.` : "Collecte envoyée au PC.", ok: true });
    suivre();
  }, [serveur, enregistrer, suivre]);

  useEffect(() => {
    if (!societeId) return;
    if (catalogue.articles.length === 0) void actualiserCatalogue();
    void envoyerEnAttente();
    const enLigne = () => void envoyerEnAttente();
    window.addEventListener("online", enLigne);
    const minuteur = setInterval(() => void envoyerEnAttente(), 60_000);
    return () => {
      window.removeEventListener("online", enLigne);
      clearInterval(minuteur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [societeId]);

  useEffect(() => {
    if (!message) return;
    const m = setTimeout(() => setMessage(null), 3500);
    return () => clearTimeout(m);
  }, [message]);

  const nouvelle = () => {
    if (!societeId) return onMenu();
    const c: Collecte = { id: nouvelId(), societeId, nom: "", lignes: [], statut: "brouillon", creeLe: Date.now() };
    enregistrer([c, ...lireCollectes()]);
    setEcran({ nom: "scan", id: c.id });
  };

  // Clavier du PDA : F1 = nouvelle collecte (à l'accueil).
  useEffect(() => {
    if (ecran.nom !== "accueil") return;
    const touche = (e: globalThis.KeyboardEvent) => {
      if (e.key === "F1") {
        e.preventDefault();
        nouvelle();
      }
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  });

  if (ecran.nom === "scan") {
    const collecte = collectes.find((c) => c.id === ecran.id);
    if (collecte)
      return (
        <Scan
          collecte={collecte}
          catalogue={catalogue.articles}
          // Une collecte envoyée qu'on complète redevient « en cours » jusqu'au prochain envoi.
          onChange={(c) => enregistrer(lireCollectes().map((x) => (x.id === c.id ? { ...c, statut: "brouillon" } : x)))}
          onSupprimer={() => {
            supprimerCollectes(serveur, [collecte.id]);
            setToutes(lireCollectes());
            setEcran({ nom: "accueil" });
            setMessage({ texte: "Collecte supprimée.", ok: true });
          }}
          onTerminer={(c) => {
            enregistrer(lireCollectes().map((x) => (x.id === c.id ? { ...c, statut: "a_envoyer" } : x)));
            setEcran({ nom: "accueil" });
            setTimeout(() => void envoyerEnAttente(), 0);
          }}
          onRetour={() => setEcran({ nom: "accueil" })}
        />
      );
  }

  const parId = new Map(envoyees.map((e) => [e.id, e]));
  const enCours = collectes.filter((c) => c.statut === "brouillon");
  const attente = collectes.filter((c) => c.statut === "a_envoyer");
  const finies = collectes.filter((c) => c.statut === "envoyee").slice(0, 30);
  const pieces = (c: Collecte) => c.lignes.reduce((s, l) => s + l.quantite, 0);

  const carte = (c: Collecte) => {
    const s = parId.get(c.id);
    const st = statutCollecte(c, s);
    return (
      <li key={c.id} className="carte-collecte">
        <button className="carte-collecte__corps" onClick={() => setEcran({ nom: "scan", id: c.id })}>
          <span className={`carte-collecte__barre ${st.classe}`} aria-hidden="true" />
          <span className="carte-collecte__texte">
            <strong>{c.nom || "Collecte sans nom"}</strong>
            <span>
              {c.lignes.length} article{c.lignes.length > 1 ? "s" : ""} · {quantiteTexte(pieces(c))} pièces · {dateHeure(c.envoyeeLe ?? c.creeLe)}
            </span>
            {s?.importeeDans && <span className="carte-collecte__note">Dernier import : {s.importeeDans}</span>}
            {c.erreur && c.statut === "a_envoyer" && <span className="erreur" title={c.erreur}>Pas encore envoyée : nouvel essai automatique</span>}
          </span>
          <span className={`statut ${st.classe}`}>{st.texte}</span>
        </button>
        <button className="carte-collecte__suppr" aria-label={`Supprimer ${c.nom || "la collecte"}`} onClick={() => setASupprimer(c)}>
          <Icone nom="poubelle" taille={18} />
        </button>
      </li>
    );
  };

  return (
    <main className="app">
      <header className="entete">
        <div className="entete__ligne">
          <button className="bouton-rond bouton-rond--verre" onClick={onMenu} aria-label="Ouvrir le menu">
            <Icone nom="menu" />
          </button>
          <div className="entete__titre">
            <h1>Scan Stock</h1>
            <button className="puce-societe" onClick={onMenu}>
              <Icone nom="societe" taille={14} />
              {config.societeNom || "Choisir la société"}
            </button>
          </div>
          <button className="bouton-rond bouton-rond--verre" onClick={() => void envoyerEnAttente()} aria-label="Synchroniser">
            <Icone nom="actualiser" />
          </button>
        </div>
        <div className="chiffres">
          <div className="chiffre">
            <strong>{enCours.length}</strong>
            <span>En cours</span>
          </div>
          <div className="chiffre">
            <strong>{attente.length}</strong>
            <span>À envoyer</span>
          </div>
          <div className="chiffre">
            <strong>{finies.length}</strong>
            <span>Envoyées</span>
          </div>
        </div>
      </header>

      {message && (
        <div className={`toast ${message.ok ? "toast--ok" : "toast--ko"}`} role="status">
          <Icone nom={message.ok ? "ok" : "alerte"} taille={18} />
          {message.texte}
        </div>
      )}

      <div className="contenu">
        {collectes.length === 0 ? (
          <div className="vide">
            <span className="vide__icone">
              <Icone nom="codebarre" taille={40} />
            </span>
            <h2>Aucune collecte</h2>
            <p>Touchez « Nouvelle collecte » puis scannez les articles : la collecte part au PC quand vous l'envoyez.</p>
          </div>
        ) : (
          <>
            {enCours.length > 0 && (
              <section>
                <h2 className="section-titre">En cours</h2>
                <ul className="liste-cartes">{enCours.map(carte)}</ul>
              </section>
            )}
            {attente.length > 0 && (
              <section>
                <h2 className="section-titre">
                  À envoyer
                  <button className="lien" onClick={() => void envoyerEnAttente()}>
                    Renvoyer
                  </button>
                </h2>
                <ul className="liste-cartes">{attente.map(carte)}</ul>
              </section>
            )}
            {finies.length > 0 && (
              <section>
                <h2 className="section-titre">Envoyées au PC</h2>
                <ul className="liste-cartes">{finies.map(carte)}</ul>
              </section>
            )}
          </>
        )}

        <footer className="catalogue">
          <Icone nom="nuage" taille={18} />
          <span>
            {catalogue.articles.length} articles {catalogue.majLe ? `· ${dateHeure(catalogue.majLe)}` : ""}
          </span>
          <button className="lien" disabled={majCatalogue || !societeId} onClick={() => void actualiserCatalogue()}>
            {majCatalogue ? "Mise à jour…" : "Actualiser"}
          </button>
        </footer>
      </div>

      <footer className="barre-action">
        <button className="bouton bouton--principal bouton--large" onClick={nouvelle}>
          <Icone nom="plus" taille={22} />
          Nouvelle collecte <kbd>F1</kbd>
        </button>
      </footer>

      {aSupprimer && (
        <Confirmation
          titre="Supprimer la collecte ?"
          texte={`« ${aSupprimer.nom || "Collecte sans nom"} » (${aSupprimer.lignes.length} articles) sera supprimée de cet appareil${aSupprimer.envoyeeLe ? " et du PC" : ""}.`}
          action="Supprimer"
          danger
          onNon={() => setASupprimer(null)}
          onOui={() => {
            supprimerCollectes(serveur, [aSupprimer.id]);
            setToutes(lireCollectes());
            setASupprimer(null);
            setMessage({ texte: "Collecte supprimée.", ok: true });
          }}
        />
      )}
    </main>
  );
}

/* ---------------------------------------------------------------- Scan */

function Scan({
  collecte,
  catalogue,
  onChange,
  onSupprimer,
  onTerminer,
  onRetour,
}: {
  collecte: Collecte;
  catalogue: ArticleCatalogue[];
  onChange: (c: Collecte) => void;
  onSupprimer: () => void;
  onTerminer: (c: Collecte) => void;
  onRetour: () => void;
}) {
  const [reglages, setReglages] = useState(lireReglages);
  const [code, setCode] = useState("");
  const [quantite, setQuantite] = useState("");
  // Code en attente de sa quantité (mode « quantité à chaque scan »).
  const [enAttente, setEnAttente] = useState<{ codeBarre: string; designation: string | null } | null>(null);
  const [dernier, setDernier] = useState<{ texte: string; code: string; ok: boolean } | null>(null);
  const [edition, setEdition] = useState<string | null>(null);
  const [confirmer, setConfirmer] = useState<"terminer" | "supprimer" | "vider" | null>(null);
  // Dernier ajout (pour DEL : annuler le dernier scan).
  const dernierAjout = useRef<{ codeBarre: string; q: number } | null>(null);
  const champCode = useRef<HTMLInputElement>(null);
  const champQuantite = useRef<HTMLInputElement>(null);

  const index = useMemo(() => {
    const m = new Map<string, ArticleCatalogue>();
    for (const a of catalogue) for (const c of a.codes) if (!m.has(c)) m.set(c, a);
    return m;
  }, [catalogue]);

  const totalQuantite = collecte.lignes.reduce((s, l) => s + l.quantite, 0);
  const focusCode = () => setTimeout(() => champCode.current?.focus(), 0);

  useEffect(() => {
    focusCode();
  }, []);

  const ajouter = (codeBarre: string, designation: string | null, q: number) => {
    dernierAjout.current = { codeBarre, q };
    const existante = collecte.lignes.find((l) => l.codeBarre === codeBarre);
    const lignes = existante
      ? [{ ...existante, quantite: existante.quantite + q }, ...collecte.lignes.filter((l) => l.codeBarre !== codeBarre)]
      : [{ codeBarre, quantite: q, designation }, ...collecte.lignes];
    onChange({ ...collecte, lignes });
  };

  const scanner = (brut: string) => {
    const codeBarre = brut.trim();
    if (!codeBarre) return;
    const article = index.get(codeBarre);
    bip(Boolean(article));
    setDernier(article ? { texte: article.designation, code: codeBarre, ok: true } : { texte: "Code inconnu (gardé pour le PC)", code: codeBarre, ok: false });
    setCode("");
    if (reglages.demanderQuantite) {
      setEnAttente({ codeBarre, designation: article?.designation ?? null });
      setQuantite("");
      setTimeout(() => champQuantite.current?.focus(), 0);
    } else {
      ajouter(codeBarre, article?.designation ?? null, 1);
      focusCode();
    }
  };

  // Rien de tapé : 1 pièce.
  const validerQuantite = (q = quantite.trim() ? nombre(quantite) : 1) => {
    if (!enAttente) return;
    if (q > 0) ajouter(enAttente.codeBarre, enAttente.designation, q);
    setEnAttente(null);
    setQuantite("");
    focusCode();
  };

  const toucheCode = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      scanner(code);
    } else if ((e.key === "Backspace" || e.key === "Delete") && !code && dernierAjout.current) {
      // DEL sur un champ vide : le dernier scan est retiré.
      e.preventDefault();
      const { codeBarre, q } = dernierAjout.current;
      const ligne = collecte.lignes.find((l) => l.codeBarre === codeBarre);
      dernierAjout.current = null;
      if (!ligne) return;
      changerQuantite(codeBarre, ligne.quantite - q);
      setDernier({ texte: `Dernier scan annulé (−${quantiteTexte(q)})`, code: ligne.designation ?? codeBarre, ok: false });
    }
  };
  const toucheQuantite = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      validerQuantite();
    } else if (e.key === "Escape") {
      setEnAttente(null);
      focusCode();
    }
  };

  const camera = async () => {
    try {
      const c = await scannerAvecCamera();
      if (c) scanner(c);
    } catch (err) {
      setDernier({ texte: err instanceof Error ? err.message : "Caméra indisponible", code: "", ok: false });
    }
  };

  const retirer = (codeBarre: string) => onChange({ ...collecte, lignes: collecte.lignes.filter((l) => l.codeBarre !== codeBarre) });
  const changerQuantite = (codeBarre: string, q: number) => {
    if (q <= 0) return retirer(codeBarre);
    onChange({ ...collecte, lignes: collecte.lignes.map((l) => (l.codeBarre === codeBarre ? { ...l, quantite: q } : l)) });
  };

  const choisirMode = (demanderQuantite: boolean) => {
    const r = { ...reglages, demanderQuantite };
    ecrireReglages(r);
    setReglages(r);
    focusCode();
  };
  const fermerQuantite = () => {
    setEnAttente(null);
    focusCode();
  };
  const basculerClavier = () => {
    const r = { ...reglages, clavierEcran: !reglages.clavierEcran };
    ecrireReglages(r);
    setReglages(r);
    focusCode();
  };
  const modeSaisie = reglages.clavierEcran ? "numeric" : "none";

  // Touche retour : ferme la quantité, sinon revient aux collectes (les confirmations gèrent la leur).
  useToucheRetour(Boolean(enAttente), fermerQuantite);
  useToucheRetour(true, onRetour);
  // F2 = envoyer au PC ; un toucher hors d'un champ rend la main au champ de scan (le scanner y tape).
  useEffect(() => {
    const touche = (e: globalThis.KeyboardEvent) => {
      if (e.key === "F2" && !enAttente && !confirmer && collecte.lignes.length > 0) {
        e.preventDefault();
        setConfirmer("terminer");
      }
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [enAttente, confirmer, collecte.lignes.length]);

  return (
    <main className="app app--scan">
      <header className="entete entete--compact">
        <div className="entete__ligne">
          <button className="bouton-rond bouton-rond--verre" onClick={onRetour} aria-label="Retour aux collectes">
            <Icone nom="retour" />
          </button>
          <div className="entete__titre">
            <input
              className="nom-collecte"
              value={collecte.nom}
              placeholder="Nom de la collecte"
              onChange={(e) => onChange({ ...collecte, nom: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && focusCode()}
              aria-label="Nom de la collecte"
            />
            <span className="entete__sous">
              {collecte.lignes.length} article{collecte.lignes.length > 1 ? "s" : ""} · {quantiteTexte(totalQuantite)} pièces
            </span>
          </div>
          <button className="bouton-rond bouton-rond--verre" onClick={() => setConfirmer("supprimer")} aria-label="Supprimer la collecte">
            <Icone nom="poubelle" />
          </button>
        </div>
      </header>

      <div className="contenu contenu--scan">
        <section className="zone-scan">
          <div className="zone-scan__champ">
            <Icone nom="codebarre" taille={24} />
            <input
              ref={champCode}
              value={code}
              inputMode={modeSaisie}
              autoComplete="off"
              placeholder="Scannez ou tapez un code-barres"
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={toucheCode}
              aria-label="Code-barres"
            />
            {code.trim() && (
              <button className="bouton-rond bouton-rond--plein" onClick={() => scanner(code)} aria-label="Ajouter">
                <Icone nom="plus" />
              </button>
            )}
          </div>
          <div className="zone-scan__outils">
            <div className="segment" role="radiogroup" aria-label="Mode de scan">
              <button role="radio" aria-checked={reglages.demanderQuantite} className={reglages.demanderQuantite ? "segment--actif" : ""} onClick={() => choisirMode(true)}>
                Quantité
              </button>
              <button role="radio" aria-checked={!reglages.demanderQuantite} className={!reglages.demanderQuantite ? "segment--actif" : ""} onClick={() => choisirMode(false)}>
                Cascade +1
              </button>
            </div>
            <span className="zone-scan__boutons">
              <button
                className={`bouton-rond bouton-rond--petit${reglages.clavierEcran ? " bouton-rond--actif" : ""}`}
                onClick={basculerClavier}
                aria-label={reglages.clavierEcran ? "Masquer le clavier de l'écran" : "Afficher le clavier de l'écran"}
                title="Clavier de l'écran"
              >
                <Icone nom="clavier" taille={18} />
              </button>
              {cameraDisponible() && (
                <button className="bouton-rond bouton-rond--petit" onClick={camera} aria-label="Scanner avec la caméra">
                  <Icone nom="camera" taille={18} />
                </button>
              )}
            </span>
          </div>
        </section>

        {dernier && (
          <div className={`retour-scan ${dernier.ok ? "retour-scan--ok" : "retour-scan--ko"}`}>
            <span className="retour-scan__icone">
              <Icone nom={dernier.ok ? "ok" : "alerte"} taille={20} />
            </span>
            <span className="retour-scan__texte">
              <strong>{dernier.texte}</strong>
              {dernier.code && <span>{dernier.code}</span>}
            </span>
          </div>
        )}

        {collecte.lignes.length === 0 ? (
          <div className="vide vide--petit">
            <span className="vide__icone">
              <Icone nom="codebarre" taille={34} />
            </span>
            <p>Scannez le premier article.</p>
          </div>
        ) : (
          <>
            <h2 className="section-titre">
              Articles scannés
              <button className="lien lien--danger" onClick={() => setConfirmer("vider")}>
                Vider
              </button>
            </h2>
            <ul className="liste-lignes">
              {collecte.lignes.map((l) => (
                <li key={l.codeBarre} className={`ligne${l.designation ? "" : " ligne--inconnue"}`}>
                  <div className="ligne__texte">
                    <strong>{l.designation ?? "Code inconnu"}</strong>
                    <span>{l.codeBarre}</span>
                  </div>
                  <div className="pas-a-pas">
                    <button onClick={() => changerQuantite(l.codeBarre, l.quantite - 1)} aria-label="Moins un">
                      <Icone nom="moins" taille={18} />
                    </button>
                    {edition === l.codeBarre ? (
                      <input
                        inputMode="decimal"
                        autoFocus
                        defaultValue={quantiteTexte(l.quantite)}
                        onBlur={(e) => {
                          changerQuantite(l.codeBarre, nombre(e.target.value));
                          setEdition(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                      />
                    ) : (
                      <button className="pas-a-pas__valeur" onClick={() => setEdition(l.codeBarre)}>
                        {quantiteTexte(l.quantite)}
                      </button>
                    )}
                    <button onClick={() => changerQuantite(l.codeBarre, l.quantite + 1)} aria-label="Plus un">
                      <Icone nom="plus" taille={18} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <footer className="barre-action">
        <button className="bouton bouton--principal bouton--large" disabled={collecte.lignes.length === 0} onClick={() => setConfirmer("terminer")}>
          <Icone nom="envoyer" taille={20} />
          {collecte.envoyeeLe ? "Renvoyer au PC" : "Envoyer au PC"} <kbd>F2</kbd>
        </button>
      </footer>

      {/* Quantité du code scanné (feuille du bas) : curseur dans le champ, Entrée pour valider. */}
      {enAttente && (
        <div className="feuille" role="dialog" aria-label="Quantité">
          <div className="feuille__voile" onClick={fermerQuantite} />
          <div className="feuille__panneau">
            <span className="feuille__poignee" aria-hidden="true" />
            <p className={`feuille__article${enAttente.designation ? "" : " feuille__article--inconnu"}`}>{enAttente.designation ?? "Code inconnu"}</p>
            <p className="feuille__code">{enAttente.codeBarre}</p>
            <input ref={champQuantite} className="quantite-geante" inputMode={reglages.clavierEcran ? "decimal" : "none"} placeholder="1" value={quantite} onChange={(e) => setQuantite(e.target.value)} onKeyDown={toucheQuantite} aria-label="Quantité" />
            <div className="feuille__actions">
              <button className="bouton bouton--doux" onClick={fermerQuantite}>
                Annuler
              </button>
              <button className="bouton bouton--principal" onClick={() => validerQuantite()}>
                Valider <kbd>↵</kbd>
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmer === "terminer" && (
        <Confirmation
          titre={collecte.envoyeeLe ? "Renvoyer au PC ?" : "Envoyer au PC ?"}
          texte={`${collecte.lignes.length} articles, ${quantiteTexte(totalQuantite)} pièces. Vous pourrez toujours la rouvrir pour la compléter.`}
          action="Envoyer"
          onNon={() => setConfirmer(null)}
          onOui={() => onTerminer(collecte)}
        />
      )}
      {confirmer === "vider" && (
        <Confirmation
          titre="Vider la collecte ?"
          texte={`Les ${collecte.lignes.length} articles scannés seront retirés ; la collecte reste, vide.`}
          action="Vider"
          danger
          onNon={() => setConfirmer(null)}
          onOui={() => {
            onChange({ ...collecte, lignes: [] });
            setDernier(null);
            setConfirmer(null);
            focusCode();
          }}
        />
      )}
      {confirmer === "supprimer" && (
        <Confirmation
          titre="Supprimer la collecte ?"
          texte={`Elle sera supprimée de cet appareil${collecte.envoyeeLe ? " et du PC" : ""}. Cette action est définitive.`}
          action="Supprimer"
          danger
          onNon={() => setConfirmer(null)}
          onOui={onSupprimer}
        />
      )}
    </main>
  );
}
