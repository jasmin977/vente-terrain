// État de la caisse : appairage, configuration, caissier connecté, session et ticket en cours, file d'envoi.
// Tout est enregistré sur le disque à chaque changement : une coupure de courant ne perd ni le ticket en cours
// ni les tickets pas encore envoyés.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import bcrypt from "bcryptjs";
import { appairer, envoyer, ErreurServeur, normaliserServeur, telechargerConfig } from "./lib/api";
import { lire, ecrire } from "./lib/stockage";
import { indexCodes } from "./lib/ticket";
import { arrondir, uuid } from "./lib/format";
import type { Appairage, ArticleCaisse, Caissier, ConfigCaisse, Droit, EtatLocal, FileEnvoi, MouvementLocal, Paiement, Reglages, SessionLocale, TicketEnCours, TicketValide } from "./types";

const ETAT_VIDE: EtatLocal = { session: null, ticket: null, attente: [], dernierNumeroTicket: 0, dernierNumeroZ: 0, tickets: [], mouvements: [] };
const FILE_VIDE: FileEnvoi = { sessions: {}, tickets: [], mouvements: [] };
const REGLAGES_DEFAUT: Reglages = { imprimante: null, imprimerAuto: true };
const INTERVALLE_ENVOI = 15_000;
const INTERVALLE_CONFIG = 5 * 60_000;

interface Valeur {
  pret: boolean;
  appairage: Appairage | null;
  config: ConfigCaisse | null;
  erreurConfig: string | null;
  articles: Map<string, ArticleCaisse>;
  codes: Map<string, ArticleCaisse>;
  caissier: Caissier | null;
  etat: EtatLocal;
  reglages: Reglages;
  enLigne: boolean;
  aEnvoyer: number;
  rejets: { id: string; erreur: string }[];
  derniereSync: string | null;
  appairerCaisse: (serveur: string, code: string) => Promise<void>;
  oublierAppairage: () => Promise<void>;
  rafraichirConfig: () => Promise<void>;
  /** Caissier dont c'est le code (null : code inconnu). */
  identifier: (code: string) => Promise<Caissier | null>;
  connecter: (c: Caissier) => void;
  deconnecter: () => void;
  ouvrirSession: (fondCaisse: number) => void;
  majTicket: (fn: (t: TicketEnCours | null) => TicketEnCours | null) => void;
  nouveauTicket: (type: "VENTE" | "RETOUR") => TicketEnCours;
  validerTicket: (donnees: Pick<TicketValide, "lignes" | "remise" | "total" | "designations" | "type"> & { paiements: Paiement[]; rendu: number }) => TicketValide;
  mettreEnAttente: () => void;
  reprendre: (id: string) => void;
  ajouterMouvement: (type: MouvementLocal["type"], montant: number, motif: string | null) => void;
  /** especesComptees : null pour une clôture à l'aveugle (le responsable saisit le montant remis). */
  cloturer: (especesComptees: number | null) => SessionLocale;
  synchroniser: () => Promise<void>;
  changerReglages: (r: Partial<Reglages>) => void;
}

const Contexte = createContext<Valeur | null>(null);
export const useCaisse = () => {
  const v = useContext(Contexte);
  if (!v) throw new Error("useCaisse hors du fournisseur");
  return v;
};

/** A-t-il le droit ? */
export const peut = (c: Caissier | null, d: Droit) => Boolean(c?.droits[d]);

export function FournisseurCaisse({ children }: { children: ReactNode }) {
  const [pret, setPret] = useState(false);
  const [appairage, setAppairage] = useState<Appairage | null>(null);
  const [config, setConfig] = useState<ConfigCaisse | null>(null);
  const [erreurConfig, setErreurConfig] = useState<string | null>(null);
  const [caissier, setCaissier] = useState<Caissier | null>(null);
  const [etat, setEtatBrut] = useState<EtatLocal>(ETAT_VIDE);
  const [file, setFileBrut] = useState<FileEnvoi>(FILE_VIDE);
  const [reglages, setReglages] = useState<Reglages>(REGLAGES_DEFAUT);
  const [enLigne, setEnLigne] = useState(false);
  const [rejets, setRejets] = useState<{ id: string; erreur: string }[]>([]);
  const [derniereSync, setDerniereSync] = useState<string | null>(null);

  // Références à jour pour les fonctions appelées depuis les minuteries.
  const etatRef = useRef(etat);
  const fileRef = useRef(file);
  const appairageRef = useRef(appairage);
  const configRef = useRef(config);
  appairageRef.current = appairage;
  configRef.current = config;
  const envoiEnCours = useRef(false);

  const setEtat = useCallback((fn: (e: EtatLocal) => EtatLocal) => {
    const e = fn(etatRef.current);
    etatRef.current = e;
    setEtatBrut(e);
    void ecrire("etat", e);
  }, []);
  const setFile = useCallback((fn: (f: FileEnvoi) => FileEnvoi) => {
    const f = fn(fileRef.current);
    fileRef.current = f;
    setFileBrut(f);
    void ecrire("file", f);
  }, []);

  /** Session ouverte sur le serveur (caisse réinstallée) reprise si la caisse n'en a pas. */
  const adopterSession = useCallback(
    (c: ConfigCaisse) => {
      if (etatRef.current.session || !c.sessionOuverte) return;
      const s = c.sessionOuverte;
      setEtat((e) => ({ ...e, session: { id: s.id, caissierId: s.caissierId, ouverteLe: s.ouverteLe, fondCaisse: Number(s.fondCaisse) }, tickets: [], mouvements: [] }));
    },
    [setEtat],
  );

  const rafraichirConfig = useCallback(async () => {
    const a = appairageRef.current;
    if (!a) return;
    try {
      const c = await telechargerConfig(a);
      setConfig(c);
      setErreurConfig(null);
      setEnLigne(true);
      void ecrire("config", c);
      adopterSession(c);
    } catch (err) {
      setEnLigne(false);
      // Caisse dissociée ou supprimée par l'admin : retour à l'appairage seulement s'il n'y a rien à envoyer.
      if (err instanceof ErreurServeur && err.statut === 401) setErreurConfig(err.message);
      else if (!configRef.current) setErreurConfig(err instanceof Error ? err.message : "Configuration indisponible");
    }
  }, [adopterSession]);

  // Chargement depuis le disque.
  useEffect(() => {
    void (async () => {
      const [a, c, e, f, r] = await Promise.all([
        lire<Appairage>("appairage"),
        lire<ConfigCaisse>("config"),
        lire<EtatLocal>("etat"),
        lire<FileEnvoi>("file"),
        lire<Reglages>("reglages"),
      ]);
      if (e) {
        etatRef.current = { ...ETAT_VIDE, ...e };
        setEtatBrut(etatRef.current);
      }
      if (f) {
        fileRef.current = { ...FILE_VIDE, ...f };
        setFileBrut(fileRef.current);
      }
      if (r) setReglages({ ...REGLAGES_DEFAUT, ...r });
      setAppairage(a);
      appairageRef.current = a;
      setConfig(c);
      configRef.current = c;
      setPret(true);
      if (a) void rafraichirConfig();
    })();
  }, [rafraichirConfig]);

  const synchroniser = useCallback(async () => {
    const a = appairageRef.current;
    const f = fileRef.current;
    if (!a || envoiEnCours.current) return;
    const envoi: FileEnvoi = {
      // La session ouverte est toujours renvoyée (sans effet si déjà connue) : ses tickets la retrouvent.
      sessions: { ...(etatRef.current.session ? { [etatRef.current.session.id]: etatRef.current.session } : {}), ...f.sessions },
      tickets: f.tickets.slice(0, 200),
      mouvements: f.mouvements.slice(0, 200),
    };
    envoiEnCours.current = true;
    try {
      const r = await envoyer(a, envoi);
      setEnLigne(true);
      setDerniereSync(new Date().toISOString());
      setRejets(r.erreurs);
      const tickets = new Set(r.tickets);
      const mouvements = new Set(r.mouvements);
      const envoyees = new Map(Object.entries(envoi.sessions).map(([id, s]) => [id, JSON.stringify(s)]));
      setFile((x) => ({
        // Une session modifiée pendant l'envoi (clôture) reste dans la file pour le prochain envoi.
        sessions: Object.fromEntries(Object.entries(x.sessions).filter(([id, s]) => !(r.sessions.includes(id) && envoyees.get(id) === JSON.stringify(s)))),
        tickets: x.tickets.filter((t) => !tickets.has(t.id)),
        mouvements: x.mouvements.filter((m) => !mouvements.has(m.id)),
      }));
      if (r.renumerotes.length) {
        const n = new Map(r.renumerotes.map((x) => [x.id, x.numero]));
        setEtat((e) => ({
          ...e,
          tickets: e.tickets.map((t) => (n.has(t.id) ? { ...t, numero: n.get(t.id)! } : t)),
          dernierNumeroTicket: Math.max(e.dernierNumeroTicket, ...n.values()),
        }));
      }
    } catch (err) {
      setEnLigne(false);
      if (err instanceof ErreurServeur && err.statut === 401) setErreurConfig(err.message);
    } finally {
      envoiEnCours.current = false;
    }
  }, [setEtat, setFile]);

  // Envois réguliers, configuration rafraîchie toutes les 5 minutes.
  useEffect(() => {
    if (!appairage) return;
    const e = setInterval(() => void synchroniser(), INTERVALLE_ENVOI);
    const c = setInterval(() => void rafraichirConfig(), INTERVALLE_CONFIG);
    void synchroniser();
    return () => {
      clearInterval(e);
      clearInterval(c);
    };
  }, [appairage, synchroniser, rafraichirConfig]);

  const appairerCaisse = useCallback(
    async (serveur: string, code: string) => {
      const base = normaliserServeur(serveur);
      const r = await appairer(base, code.replace(/\D/g, ""));
      const a: Appairage = { serveur: base, ...r };
      await ecrire("appairage", a);
      appairageRef.current = a;
      setAppairage(a);
      setErreurConfig(null);
      await rafraichirConfig();
    },
    [rafraichirConfig],
  );

  const oublierAppairage = useCallback(async () => {
    await ecrire("appairage", null);
    await ecrire("config", null);
    setAppairage(null);
    setConfig(null);
    setCaissier(null);
    setErreurConfig(null);
  }, []);

  // Codes déjà vérifiés pendant cette exécution (bcrypt est lent : ~0,1 s par caissier).
  const codesConnus = useRef(new Map<string, string>());
  const identifier = useCallback(async (code: string) => {
    const c = configRef.current;
    if (!c) return null;
    const connu = codesConnus.current.get(code);
    if (connu) {
      const k = c.caissiers.find((x) => x.id === connu);
      if (k) return k;
    }
    for (const k of c.caissiers) {
      if (await bcrypt.compare(code, k.codeHash)) {
        codesConnus.current.set(code, k.id);
        return k;
      }
    }
    return null;
  }, []);

  const ouvrirSession = useCallback(
    (fondCaisse: number) => {
      if (!caissier) return;
      const s: SessionLocale = { id: uuid(), caissierId: caissier.id, ouverteLe: new Date().toISOString(), fondCaisse: arrondir(fondCaisse) };
      setEtat((e) => ({ ...e, session: s, tickets: [], mouvements: [] }));
      setFile((f) => ({ ...f, sessions: { ...f.sessions, [s.id]: s } }));
      void synchroniser();
    },
    [caissier, setEtat, setFile, synchroniser],
  );

  const majTicket = useCallback((fn: (t: TicketEnCours | null) => TicketEnCours | null) => setEtat((e) => ({ ...e, ticket: fn(e.ticket) })), [setEtat]);
  const nouveauTicket = useCallback((type: "VENTE" | "RETOUR"): TicketEnCours => ({ id: uuid(), type, ouvertLe: new Date().toISOString(), lignes: [], remise: 0 }), []);

  const validerTicket: Valeur["validerTicket"] = useCallback(
    (d) => {
      const e = etatRef.current;
      if (!e.session || !caissier || !e.ticket) throw new Error("Aucune session ouverte");
      const numero = Math.max(e.dernierNumeroTicket, configRef.current?.dernierNumeroTicket ?? 0) + 1;
      const t: TicketValide = {
        id: e.ticket.id,
        sessionId: e.session.id,
        caissierId: caissier.id,
        numero,
        date: new Date().toISOString(),
        type: d.type,
        remise: d.remise,
        rendu: arrondir(d.rendu),
        lignes: d.lignes,
        paiements: d.paiements.map((p) => ({ ...p, montant: arrondir(p.montant) })),
        total: d.total,
        designations: d.designations,
      };
      setEtat((x) => ({ ...x, ticket: null, dernierNumeroTicket: numero, tickets: [...x.tickets, t] }));
      setFile((f) => ({ ...f, tickets: [...f.tickets, t] }));
      setTimeout(() => void synchroniser(), 300);
      return t;
    },
    [caissier, setEtat, setFile, synchroniser],
  );

  const mettreEnAttente = useCallback(() => setEtat((e) => (e.ticket && e.ticket.lignes.length ? { ...e, attente: [...e.attente, e.ticket], ticket: null } : e)), [setEtat]);
  const reprendre = useCallback(
    (id: string) =>
      setEtat((e) => {
        const t = e.attente.find((x) => x.id === id);
        if (!t) return e;
        // Le ticket en cours (s'il a des articles) prend la place de celui qu'on reprend.
        const reste = e.attente.filter((x) => x.id !== id);
        return { ...e, ticket: t, attente: e.ticket && e.ticket.lignes.length ? [...reste, e.ticket] : reste };
      }),
    [setEtat],
  );

  const ajouterMouvement = useCallback(
    (type: MouvementLocal["type"], montant: number, motif: string | null) => {
      const s = etatRef.current.session;
      if (!s) return;
      const m: MouvementLocal = { id: uuid(), sessionId: s.id, type, montant: arrondir(montant), motif, date: new Date().toISOString() };
      setEtat((e) => ({ ...e, mouvements: [...e.mouvements, m] }));
      setFile((f) => ({ ...f, mouvements: [...f.mouvements, m] }));
      void synchroniser();
    },
    [setEtat, setFile, synchroniser],
  );

  const cloturer = useCallback(
    (especesComptees: number | null) => {
      const e = etatRef.current;
      if (!e.session) throw new Error("Aucune session ouverte");
      const numeroZ = Math.max(e.dernierNumeroZ, configRef.current?.dernierNumeroZ ?? 0) + 1;
      const s: SessionLocale = { ...e.session, clotureeLe: new Date().toISOString(), numeroZ, especesComptees: especesComptees === null ? null : arrondir(especesComptees) };
      setFile((f) => ({ ...f, sessions: { ...f.sessions, [s.id]: s } }));
      setEtat((x) => ({ ...x, session: null, ticket: null, attente: [], dernierNumeroZ: numeroZ, tickets: [], mouvements: [] }));
      void synchroniser();
      return s;
    },
    [setEtat, setFile, synchroniser],
  );

  const changerReglages = useCallback((r: Partial<Reglages>) => {
    setReglages((x) => {
      const n = { ...x, ...r };
      void ecrire("reglages", n);
      return n;
    });
  }, []);

  const articles = useMemo(() => new Map((config?.articles ?? []).map((a) => [a.id, a])), [config]);
  const codes = useMemo(() => indexCodes(config?.articles ?? []), [config]);
  const aEnvoyer = file.tickets.length + file.mouvements.length + Object.keys(file.sessions).length;

  const valeur: Valeur = {
    pret,
    appairage,
    config,
    erreurConfig,
    articles,
    codes,
    caissier,
    etat,
    reglages,
    enLigne,
    aEnvoyer,
    rejets,
    derniereSync,
    appairerCaisse,
    oublierAppairage,
    rafraichirConfig,
    identifier,
    connecter: setCaissier,
    deconnecter: () => setCaissier(null),
    ouvrirSession,
    majTicket,
    nouveauTicket,
    validerTicket,
    mettreEnAttente,
    reprendre,
    ajouterMouvement,
    cloturer,
    synchroniser,
    changerReglages,
  };
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}
