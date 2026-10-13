import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { IonAlert, IonContent, IonPage, useIonToast } from "@ionic/react";
import { IonIcon } from "@ionic/react";
import { bulb, bulbOutline, closeOutline, cubeOutline, footstepsOutline, refreshOutline, searchOutline, walkOutline } from "ionicons/icons";
import { genererDisposition, getEntrepot, getVentesEntrepot, modifierBatiment, rangerAuto } from "../api/entrepot";
import { getPeremption } from "../api/stock";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import PanneauEntrepot from "../components/entrepot/PanneauEntrepot";
import { ScenEntrepot } from "../entrepot3d/ScenEntrepot";
import type { EntrepotData, SelectionEntrepot, VueEntrepot } from "../types/entrepot";
import { articleCorrespond } from "../utils/articleSearch";
import { compterCases, libelleStatut, type StatutStock } from "../utils/statutEntrepot";
import { formatAmount } from "../utils/format";
import { analyserVentes, DEGRADE_CHALEUR, type Metrique, type VentesEntrepot } from "../utils/ventesEntrepot";
import { analyserPeremption, detailPeremption, libellePeremption, type AnalysePeremption, type StatutPeremption } from "../utils/peremptionEntrepot";
import type { Peremption } from "../types/lot";
import { AppHeader, Button, EmptyState, Field, IconButton, PageNotice, Sheet, Spinner, useEcranLarge, useMediaQuery } from "../ui";
import { t } from "../i18n";

type NomVue = "ensemble" | "dessus" | "interieur";

/** Nom affiché d'un mur d'étagères (les anciennes « allées » A, B, C gardent leur nom). */
const MURS: Record<string, string> = { Fond: "Fond", Droite: "Droite", Gauche: "Gauche", Façade: "Façade", Frigo: "Frigo" };
const libelleMur = (allee: string) => (MURS[allee] ? t(MURS[allee]) : t("Allée {a}", { a: allee }));

/**
 * Plan du dépôt en 3D (admin) : bâtiment, allées, étagères à étages et leur contenu, camions garés devant
 * les portes. Caméra orbitale, vue du dessus, vue de l'intérieur ou marche à pied ; un clic sélectionne une
 * case, une étagère ou un camion, et le panneau permet de ranger les articles et d'ajuster la disposition.
 */
export default function Entrepot3D() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const web = useEcranLarge();
  const [toast] = useIonToast();

  const conteneur = useRef<HTMLDivElement>(null);
  const scene = useRef<ScenEntrepot | null>(null);
  const [data, setData] = useState<EntrepotData | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectionEntrepot | null>(null);
  const [vue, setVue] = useState<NomVue | string>("ensemble");
  const [marche, setMarche] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [genererOuvert, setGenererOuvert] = useState(false);
  const [batimentOuvert, setBatimentOuvert] = useState(false);
  const [webglIndisponible, setWebglIndisponible] = useState(false);
  // Couleurs de stock : toutes affichées, ou un seul statut mis en évidence (clic sur la légende).
  const [couleurs, setCouleurs] = useState(true);
  // Nuit : l'interrupteur de la lumière du hall apparaît ; allumé, l'employé vient travailler.
  const [nuit, setNuit] = useState(false);
  const [lampe, setLampe] = useState(() => {
    try {
      return localStorage.getItem("rc-entrepot-lampe") === "1";
    } catch {
      return false;
    }
  });
  const [filtre, setFiltre] = useState<StatutStock | null>(null);
  const [actualisation, setActualisation] = useState(false);
  // Mode « Ventes » : carte de chaleur du chiffre d'affaires, de la marge ou du surstock sur une période.
  const [mode, setMode] = useState<"stock" | "ventes" | "peremption">("stock");
  const [jours, setJours] = useState(30);
  const [metrique, setMetrique] = useState<Metrique>("ca");
  const [ventes, setVentes] = useState<VentesEntrepot | null>(null);
  const [surbrillance, setSurbrillance] = useState<{ rackId: string; niveau: number; travee: number }[]>([]);
  const modeRef = useRef<"stock" | "ventes" | "peremption">("stock");
  const [peremptionData, setPeremptionData] = useState<Peremption | null>(null);
  const [filtrePeremption, setFiltrePeremption] = useState<StatutPeremption | null>(null);
  const analysePerRef = useRef<AnalysePeremption | null>(null);
  const chargerPeremptionRef = useRef<() => Promise<void>>(async () => undefined);
  const chargerVentesRef = useRef<() => Promise<void>>(async () => undefined);

  const charger = useCallback(async () => {
    try {
      setData(await getEntrepot());
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible de charger les données"));
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  // « En direct » : le plan se recalcule seul toutes les 30 s (et au retour sur l'onglet), pour que les couleurs
  // suivent les ventes, chargements et réceptions sans rien faire.
  useEffect(() => {
    const maj = () => {
      if (document.visibilityState === "visible") {
        void charger();
        if (modeRef.current === "ventes") void chargerVentesRef.current();
        if (modeRef.current === "peremption") void chargerPeremptionRef.current();
      }
    };
    const minuterie = setInterval(maj, 30_000);
    document.addEventListener("visibilitychange", maj);
    return () => {
      clearInterval(minuterie);
      document.removeEventListener("visibilitychange", maj);
    };
  }, [charger]);

  const chargerVentes = useCallback(async () => {
    try {
      setVentes(await getVentesEntrepot(jours));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible de charger les données"));
    }
  }, [jours]);

  const chargerPeremption = useCallback(async () => {
    try {
      setPeremptionData(await getPeremption());
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible de charger les données"));
    }
  }, []);
  useEffect(() => {
    if (mode === "peremption") void chargerPeremption();
  }, [mode, chargerPeremption]);

  // Les ventes se chargent à l'entrée du mode et à chaque changement de période, puis suivent le rythme du plan.
  useEffect(() => {
    if (mode === "ventes") void chargerVentes();
  }, [mode, chargerVentes]);

  const actualiser = async () => {
    setActualisation(true);
    await Promise.all([charger(), mode === "ventes" ? chargerVentes() : Promise.resolve(), mode === "peremption" ? chargerPeremption() : Promise.resolve()]);
    setActualisation(false);
  };

  // Création de la scène (une fois) et nettoyage à la sortie.
  useEffect(() => {
    if (!conteneur.current) return;
    let s: ScenEntrepot;
    try {
      s = new ScenEntrepot({
        conteneur: conteneur.current,
        surSelection: setSelection,
        surNuit: setNuit,
        bulle: (e) => {
          const a = e.article;
          const etiquette = a.statut === "NOUVEAU" ? (a.etiquette === "PROMOTION" ? t("Promotion") : t("Nouveau")) : libelleStatut(a.statut);
          const per = analysePerRef.current?.parArticle.get(a.id);
          const lignes = [`${etiquette} · ${t("Stock {n}", { n: a.stock })}`, t("{p} TND TTC", { p: formatAmount(a.prixTTC) })];
          // La quantité de la case n'apparaît que si elle diffère du stock (article en plusieurs cases, ou stock qui a bougé).
          if (Math.abs(e.quantite - a.stock) > 1e-9) lignes.splice(1, 0, t("Dans la case : {n}", { n: e.quantite }));
          if (per) lignes.push(`${libellePeremption(per.statut)}${detailPeremption(per) ? ` · ${detailPeremption(per)}` : ""}`);
          return { titre: a.designation, lignes };
        },
      });
    } catch {
      setWebglIndisponible(true);
      return;
    }
    scene.current = s;
    if (import.meta.env.DEV) (window as unknown as { __entrepot: ScenEntrepot }).__entrepot = s;
    return () => {
      s.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    if (data) scene.current?.charger(data);
  }, [data]);

  // Ordinateur : le panneau recouvre la droite de la scène, qui se centre dans le reste.
  const grandEcran = useMediaQuery("(min-width: 900px)");
  useEffect(() => {
    scene.current?.definirMargeDroite(grandEcran ? 380 : 0);
  }, [grandEcran, data]);

  useEffect(() => {
    scene.current?.selectionner(selection);
  }, [selection]);

  useEffect(() => {
    scene.current?.definirLampe(lampe);
    try {
      localStorage.setItem("rc-entrepot-lampe", lampe ? "1" : "0");
    } catch {
      /* stockage indisponible : le choix n'est simplement pas retenu */
    }
  }, [lampe]);

  useEffect(() => {
    scene.current?.definirCouleurs(couleurs);
  }, [couleurs]);

  useEffect(() => {
    scene.current?.definirFiltre(couleurs ? filtre : null);
  }, [filtre, couleurs]);

  const comptes = useMemo(() => (data ? compterCases(data) : null), [data]);

  const analyse = useMemo(() => (mode === "ventes" && data && ventes ? analyserVentes(data, ventes) : null), [mode, data, ventes]);
  const chaleur = useMemo(() => (analyse ? analyse.chaleur(metrique) : null), [analyse, metrique]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    chargerVentesRef.current = chargerVentes;
  }, [chargerVentes]);
  useEffect(() => {
    chargerPeremptionRef.current = chargerPeremption;
  }, [chargerPeremption]);

  const analysePeremption = useMemo(() => (mode === "peremption" && data && peremptionData ? analyserPeremption(data, peremptionData) : null), [mode, data, peremptionData]);
  useEffect(() => {
    analysePerRef.current = analysePeremption;
  }, [analysePeremption]);
  useEffect(() => {
    scene.current?.definirPeremption(
      analysePeremption ? { articles: analysePeremption.couleursArticles(filtrePeremption), racks: analysePeremption.couleursRacks(filtrePeremption) } : null,
    );
  }, [analysePeremption, filtrePeremption]);
  useEffect(() => {
    scene.current?.definirChaleur(chaleur ? { cases: chaleur.cases, racks: chaleur.racks } : null);
  }, [chaleur]);

  // Échap quitte la marche à pied.
  useEffect(() => {
    if (!marche) return;
    const f = (e: KeyboardEvent) => {
      if (e.key === "Escape") quitterMarche();
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [marche]);

  const allees = useMemo(() => [...new Set(data?.racks.map((r) => r.allee) ?? [])].sort(), [data]);

  // Résultats de la recherche d'article : cases qui le contiennent.
  const resultats = useMemo(() => {
    const q = recherche.trim();
    if (!data || q.length < 2) return [];
    const parArticle = new Map<string, { designation: string; cases: { rackId: string; niveau: number; travee: number; rack: string; quantite: number }[] }>();
    for (const r of data.racks) {
      for (const e of r.emplacements) {
        if (!articleCorrespond(e.article, q)) continue;
        const cur = parArticle.get(e.article.id) ?? { designation: e.article.designation, cases: [] };
        cur.cases.push({ rackId: r.id, niveau: e.niveau, travee: e.travee, rack: r.nom, quantite: e.quantite });
        parArticle.set(e.article.id, cur);
      }
    }
    return [...parArticle.entries()].slice(0, 8).map(([id, v]) => ({ id, ...v }));
  }, [data, recherche]);

  useEffect(() => {
    const cases = resultats.flatMap((r) => r.cases);
    scene.current?.marquer(recherche.trim().length >= 2 ? cases : mode === "ventes" ? surbrillance : []);
  }, [resultats, recherche, data, surbrillance, mode]);

  // Admin seulement, et sur le web seulement : l'application du téléphone n'a pas le plan 3D.
  if (Capacitor.isNativePlatform()) return <Navigate to="/stock" replace />;
  if (user && user.role !== "ADMIN") return <Navigate to="/factures" replace />;

  const changerVue = (v: VueEntrepot, nom: string) => {
    setMarche(false);
    setVue(nom);
    scene.current?.vue(v);
  };
  const quitterMarche = () => {
    scene.current?.arreterMarche();
    setMarche(false);
  };
  const basculerMarche = () => {
    if (marche) return quitterMarche();
    scene.current?.demarrerMarche();
    setMarche(true);
    setVue("marche");
    toast({ message: t("ZQSD ou flèches pour avancer, glisser pour regarder, Échap pour sortir."), duration: 4200, position: "top", cssClass: "rc-toast" });
  };

  const choisir = (s: SelectionEntrepot) => {
    setSelection(s);
    scene.current?.selectionner(s);
    scene.current?.focaliser(s);
    setMarche(false);
  };

  const rangerTout = async () => {
    try {
      const { ranges } = await rangerAuto();
      toast({ message: t("{n} articles rangés par catégorie.", { n: ranges }), duration: 2600, position: "top", cssClass: "rc-toast" });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Opération impossible"));
    }
  };

  return (
    <IonPage>
      {/* Web : pas d'en-tête, le plan prend tout l'écran (le menu latéral dit où l'on est). Petit écran : retour. */}
      {!web && <AppHeader backHref="/stock" title={t("Entrepôt 3D")} />}
      <IonContent scrollY={false} className="rc-entrepot-page">
        {erreur && <PageNotice actionLabel={t("Réessayer")} onAction={() => void charger()}>{erreur}</PageNotice>}
        <div className="rc-entrepot">
          <div className="rc-entrepot__scene" ref={conteneur} />
          {nuit && !webglIndisponible && (
            <button
              type="button"
              className={`rc-entrepot__lampe${lampe ? " rc-entrepot__lampe--allumee" : ""}`}
              aria-pressed={lampe}
              aria-label={lampe ? t("Éteindre la lumière") : t("Allumer la lumière")}
              title={lampe ? t("Éteindre la lumière") : t("Allumer la lumière")}
              onClick={() => setLampe((v) => !v)}
            >
              <IonIcon icon={lampe ? bulb : bulbOutline} aria-hidden="true" />
            </button>
          )}

          {webglIndisponible && (
            <div className="rc-entrepot__vide">
              <EmptyState icon={cubeOutline} title={t("La 3D n'est pas disponible")} message={t("Ce navigateur ne permet pas l'affichage 3D (WebGL).")} />
            </div>
          )}
          {!data && !erreur && !webglIndisponible && (
            <div className="rc-entrepot__vide">
              <Spinner />
            </div>
          )}

          <div className="rc-entrepot__barre">
            <div className="rc-entrepot__vues" role="group" aria-label={t("Point de vue")}>
              {([
                ["ensemble", t("Ensemble")],
                ["dessus", t("Dessus")],
                ["interieur", t("Intérieur")],
              ] as [NomVue, string][]).map(([v, label]) => (
                <button key={v} type="button" className={`rc-entrepot__puce${vue === v && !marche ? " rc-entrepot__puce--on" : ""}`} onClick={() => changerVue(v, v)}>
                  {label}
                </button>
              ))}
              {allees.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`rc-entrepot__puce${vue === `allee-${a}` && !marche ? " rc-entrepot__puce--on" : ""}`}
                  onClick={() => changerVue({ allee: a }, `allee-${a}`)}
                >
                  {libelleMur(a)}
                </button>
              ))}
              <button type="button" className={`rc-entrepot__puce rc-entrepot__puce--marche${marche ? " rc-entrepot__puce--on" : ""}`} onClick={basculerMarche} aria-pressed={marche}>
                <IonIcon icon={walkOutline} aria-hidden="true" /> {marche ? t("Quitter la marche") : t("Marcher")}
              </button>
            </div>

            <div className="rc-entrepot__ligne">
            <div className="rc-entrepot__recherche">
              <Field
                label={t("Où est cet article ?")}
                hideLabel
                value={recherche}
                onChange={setRecherche}
                placeholder={t("Où est cet article ?")}
                prefix={<IonIcon icon={searchOutline} aria-hidden="true" />}
                suffix={recherche ? <IconButton icon={closeOutline} label={t("Effacer la recherche")} size="sm" onClick={() => setRecherche("")} /> : undefined}
              />
              {recherche.trim().length >= 2 && (
                <ul className="rc-entrepot__resultats">
                  {resultats.length === 0 ? (
                    <li className="rc-entrepot__resultat rc-entrepot__resultat--vide">{t("Aucun emplacement trouvé.")}</li>
                  ) : (
                    resultats.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          className="rc-entrepot__resultat"
                          onClick={() => choisir({ type: "case", rackId: r.cases[0].rackId, niveau: r.cases[0].niveau, travee: r.cases[0].travee })}
                        >
                          <strong>{r.designation}</strong>
                          <span>{r.cases.slice(0, 4).map((c) => `${c.rack}·${c.niveau + 1}.${c.travee + 1}`).join("  ")}{r.cases.length > 4 ? "…" : ""}</span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          {/* Camions : accès rapide (aussi cliquables dans la scène). */}
          {data && comptes && (
            <div className="rc-entrepot__legende" role="group" aria-label={t("Couleurs du plan")}>
              {(
                [
                  ["stock", t("Stock")],
                  ["ventes", t("Ventes")],
                  ["peremption", t("Expiration")],
                ] as ["stock" | "ventes" | "peremption", string][]
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  className={`rc-entrepot__puce rc-entrepot__puce--petite${mode === m ? " rc-entrepot__puce--on" : ""}`}
                  aria-pressed={mode === m}
                  onClick={() => {
                    setMode(m);
                    setSurbrillance([]);
                    setFiltrePeremption(null);
                    if (m === "stock") setCouleurs(true);
                  }}
                >
                  {label}
                </button>
              ))}
              {mode === "ventes" && (
                <>
                  {([7, 30, 90, 365] as const).map((j) => (
                    <button
                      key={j}
                      type="button"
                      className={`rc-entrepot__puce rc-entrepot__puce--petite${jours === j ? " rc-entrepot__puce--choisie" : ""}`}
                      aria-pressed={jours === j}
                      onClick={() => setJours(j)}
                    >
                      {j === 365 ? t("12 mois") : t("{n} j", { n: j })}
                    </button>
                  ))}
                  {(["ca", "marge", "surstock"] as Metrique[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`rc-entrepot__puce rc-entrepot__puce--petite${metrique === m ? " rc-entrepot__puce--on" : ""}`}
                      aria-pressed={metrique === m}
                      onClick={() => setMetrique(m)}
                    >
                      {m === "ca" ? t("Chiffre d'affaires") : m === "marge" ? t("Marge") : t("Surstock")}
                    </button>
                  ))}
                </>
              )}
              <button type="button" className="rc-entrepot__direct" onClick={() => void actualiser()} disabled={actualisation} aria-label={t("Actualiser le plan")}>
                <span className="rc-entrepot__direct-point" aria-hidden="true" />
                {t("En direct")} · {new Date(data.genereLe).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                <IonIcon icon={refreshOutline} aria-hidden="true" />
              </button>
            </div>
          )}
            </div>
          {mode === "ventes" && (
            <div className="rc-entrepot__echelle" aria-label={t("Échelle de la carte de chaleur")}>
              <span className="rc-entrepot__degrade" style={{ background: DEGRADE_CHALEUR }} aria-hidden="true" />
              <span className="rc-entrepot__echelle-bornes">
                <span>{metrique === "surstock" ? t("Peu immobilisé") : t("Peu vendu")}</span>
                <span>{metrique === "surstock" ? t("Beaucoup immobilisé") : t("Meilleures ventes")}</span>
              </span>
            </div>
          )}
          </div>

          {marche && (
            <div className="rc-entrepot__pad" aria-label={t("Déplacement")}>
              {(
                [
                  ["↑", 1, 0, "pad-haut"],
                  ["←", 0, -1, "pad-gauche"],
                  ["↓", -1, 0, "pad-bas"],
                  ["→", 0, 1, "pad-droite"],
                ] as [string, number, number, string][]
              ).map(([flèche, avant, cote, classe]) => (
                <button
                  key={classe}
                  type="button"
                  className={`rc-entrepot__pad-bouton rc-entrepot__${classe}`}
                  aria-label={flèche}
                  onPointerDown={() => scene.current?.deplacer(avant, cote)}
                  onPointerUp={() => scene.current?.deplacer(0, 0)}
                  onPointerLeave={() => scene.current?.deplacer(0, 0)}
                  onPointerCancel={() => scene.current?.deplacer(0, 0)}
                >
                  {flèche}
                </button>
              ))}
            </div>
          )}

          {data && (
            <aside className="rc-entrepot__panneau" aria-label={t("Détail")}>
              <PanneauEntrepot
                data={data}
                selection={selection}
                onSelect={(s) => {
                  setSelection(s);
                  scene.current?.selectionner(s);
                }}
                onChange={charger}
                onFocus={(s) => scene.current?.focaliser(s)}
                onGenerer={() => setGenererOuvert(true)}
                onBatiment={() => setBatimentOuvert(true)}
                onRangerAuto={() => void rangerTout()}
                onOuvrirCamion={() => navigate("/stock?lieu=camion")}
                onCree={(id) => choisir({ type: "rack", rackId: id })}
                analyse={analyse}
                metrique={metrique}
                peremption={analysePeremption}
                filtrePeremption={filtrePeremption}
                onFiltrePeremption={setFiltrePeremption}
                onOuvrirDates={() => navigate("/stock/peremptions")}
                onSurligner={setSurbrillance}
                filtre={filtre}
                onFiltre={(s) => {
                  setFiltre(s);
                  if (s) setCouleurs(true);
                }}
                onVoirCase={choisir}
              />
            </aside>
          )}
        </div>

        {data && (
          <>
            <GenererSheet
              isOpen={genererOuvert}
              existe={data.racks.length > 0}
              onDismiss={() => setGenererOuvert(false)}
              onFait={async () => {
                setGenererOuvert(false);
                setSelection(null);
                await charger();
                scene.current?.vue("ensemble");
              }}
            />
            <BatimentSheet isOpen={batimentOuvert} data={data} onDismiss={() => setBatimentOuvert(false)} onFait={async () => { setBatimentOuvert(false); await charger(); }} />
          </>
        )}
      </IonContent>
    </IonPage>
  );
}

/* ---------------------------------------------------------------- Feuilles */

function GenererSheet({ isOpen, existe, onDismiss, onFait }: { isOpen: boolean; existe: boolean; onDismiss: () => void; onFait: () => void | Promise<void> }) {
  const [v, setV] = useState({ niveaux: "4", travees: "6" });
  const [confirmer, setConfirmer] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const n = (k: keyof typeof v) => Math.round(Number(v[k]));
  const valide = (["niveaux", "travees"] as const).every((k) => n(k) >= 1) && n("niveaux") <= 8 && n("travees") <= 12;

  const lancer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      await genererDisposition({ niveaux: n("niveaux"), travees: n("travees"), remplacer: existe });
      await onFait();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Opération impossible"));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <>
      <Sheet isOpen={isOpen} title={t("Disposition automatique")} height="auto" onDismiss={onDismiss}>
        <div className="rc-sheet__form">
          <div className="rc-fields">
            <p className="rc-footnote">{t("Place les étagères le long du fond et des côtés, et dans la chambre froide du coin ; la façade des portes et le centre restent libres. Le bâtiment s'agrandit si besoin.")}</p>
            <div className="rc-fields__row">
              <Field label={t("Étages")} type="number" inputMode="numeric" value={v.niveaux} onChange={(x) => setV((s) => ({ ...s, niveaux: x }))} hint="1 – 8" />
              <Field label={t("Cases de large")} type="number" inputMode="numeric" value={v.travees} onChange={(x) => setV((s) => ({ ...s, travees: x }))} hint="1 – 12" />
            </div>
            {erreur && <PageNotice>{erreur}</PageNotice>}
            <Button size="lg" block icon={footstepsOutline} loading={envoi} disabled={!valide} onClick={() => (existe ? setConfirmer(true) : void lancer())}>
              {existe ? t("Remplacer la disposition") : t("Générer la disposition")}
            </Button>
          </div>
        </div>
      </Sheet>
      <IonAlert
        isOpen={confirmer}
        onDidDismiss={() => setConfirmer(false)}
        header={t("Remplacer la disposition ?")}
        message={t("Les étagères actuelles et les emplacements rangés sont supprimés (le stock du dépôt ne change pas).")}
        buttons={[
          { text: t("Annuler"), role: "cancel" },
          { text: t("Remplacer"), role: "destructive", handler: () => { void lancer(); } },
        ]}
      />
    </>
  );
}

function BatimentSheet({ isOpen, data, onDismiss, onFait }: { isOpen: boolean; data: EntrepotData; onDismiss: () => void; onFait: () => void | Promise<void> }) {
  const [largeur, setLargeur] = useState("");
  const [profondeur, setProfondeur] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => {
    if (isOpen) {
      setLargeur(String(data.entrepot.largeur));
      setProfondeur(String(data.entrepot.profondeur));
      setErreur(null);
    }
  }, [isOpen, data.entrepot.largeur, data.entrepot.profondeur]);
  const l = Number(largeur);
  const p = Number(profondeur);
  const valide = l >= 10 && l <= 200 && p >= 10 && p <= 200;
  return (
    <Sheet isOpen={isOpen} title={t("Dimensions du bâtiment")} height="auto" onDismiss={onDismiss}>
      <div className="rc-sheet__form">
        <div className="rc-fields">
          <div className="rc-fields__row">
            <Field label={t("Largeur (m)")} type="number" inputMode="decimal" value={largeur} onChange={setLargeur} hint="10 – 200" />
            <Field label={t("Profondeur (m)")} type="number" inputMode="decimal" value={profondeur} onChange={setProfondeur} hint="10 – 200" />
          </div>
          {erreur && <PageNotice>{erreur}</PageNotice>}
          <Button
            size="lg"
            block
            disabled={!valide}
            onClick={() =>
              void modifierBatiment(l, p)
                .then(onFait)
                .catch((err) => setErreur(err instanceof ApiError ? err.message : t("Opération impossible")))
            }
          >
            {t("Enregistrer")}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
