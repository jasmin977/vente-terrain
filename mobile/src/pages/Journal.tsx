import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { IonContent, IonPage, useIonViewWillEnter } from "@ionic/react";
import { documentTextOutline, downloadOutline, eyeOutline, gridOutline, printOutline } from "ionicons/icons";
import { ApiError } from "../api/client";
import { getJournal, type LigneJournalMontant, type LigneJournalStock, type TauxTva, type TypeJournal } from "../api/journaux";
import { listClients } from "../api/clients";
import { listUsers } from "../api/auth";
import { listFournisseurs } from "../api/achats";
import { useAuth } from "../auth/AuthContext";
import { nomFournisseur } from "../components/achats/nomFournisseur";
import ApercuDocumentSheet, { type DocumentApercu } from "../components/ApercuDocumentSheet";
import AchatDetailSheet from "../components/achats/AchatDetailSheet";
import { AccountButton, AppHeader, Button, EmptyState, Field, FilterChip, IconButton, Money, PageNotice, PickerSheet, Segmented, Spinner, Tag } from "../ui";
import { formatDate, formatLongDate, parseLocalDate, toLocalDateString } from "../utils/format";
import { imprimerJournal, telechargerJournalCsv, telechargerJournalPdf, type JournalExport } from "../utils/journalExport";
import { t, tn } from "../i18n";

type Ligne = LigneJournalMontant | LigneJournalStock;
interface Colonne {
  titre: string;
  droite?: boolean;
  /** Affichage à l'écran. */
  rendu: (l: Ligne) => ReactNode;
  /** Texte pour le PDF et l'Excel. */
  texte: (l: Ligne) => string;
  /** Colonne additionnée (sous-totaux du jour, total). */
  somme?: (l: Ligne) => number;
  /** Colonne du client / fournisseur / camion : retirée quand on groupe par eux (le nom est alors l'en-tête du groupe). */
  tiers?: boolean;
}

/** Regroupement des lignes : par jour, ou par client (ventes) / fournisseur (achats) / camion (stock). */
type Groupement = "jour" | "tiers";
const LIBELLE_TIERS: Record<TypeJournal, string> = { ventes: "Client", achats: "Fournisseur", stock: "Camion" };

const nb = (n: number) => n.toFixed(3).replace(".", ",");
const TOUS = "__tous__";
const montant = (l: Ligne) => l as LigneJournalMontant;
const stock = (l: Ligne) => l as LigneJournalStock;

/** Nom court de chaque type de document, devant son numéro (« BL n° 26/0001 »). */
const NOM_DOCUMENT: Record<TypeJournal, Record<string, string>> = {
  ventes: { BL: "BL", FACTURE: "Facture" },
  achats: { BL: "BL", FACTURE: "Facture", ENTREE: "B° Entrée" },
  stock: { SORTIE: "B° Sortie", RETOUR: "B° Retour" },
};

/** Les trois journaux : types de documents, colonnes et filtre propres à chacun. */
const CONFIG: Record<TypeJournal, { titre: string; types: { valeur: string; label: string }[] }> = {
  ventes: { titre: "Journal des ventes", types: [{ valeur: "BL", label: "BL de vente" }, { valeur: "FACTURE", label: "Factures de vente" }] },
  achats: {
    titre: "Journal des achats",
    types: [
      { valeur: "BL", label: "BL fournisseur" },
      { valeur: "FACTURE", label: "Factures fournisseur" },
      { valeur: "ENTREE", label: "B° Entrée" },
    ],
  },
  stock: { titre: "Journal du stock", types: [{ valeur: "SORTIE", label: "B° Sortie" }, { valeur: "RETOUR", label: "B° Retour" }] },
};

function bornes(raccourci: "jour" | "mois" | "moisDernier" | "annee") {
  const d = new Date();
  if (raccourci === "jour") return { du: toLocalDateString(d), au: toLocalDateString(d) };
  if (raccourci === "mois") return { du: toLocalDateString(new Date(d.getFullYear(), d.getMonth(), 1)), au: toLocalDateString(d) };
  if (raccourci === "moisDernier")
    return { du: toLocalDateString(new Date(d.getFullYear(), d.getMonth() - 1, 1)), au: toLocalDateString(new Date(d.getFullYear(), d.getMonth(), 0)) };
  return { du: toLocalDateString(new Date(d.getFullYear(), 0, 1)), au: toLocalDateString(d) };
}

/** Réglages gardés d'une visite à l'autre (période et types cochés), propres à chaque journal. */
function lireReglages(type: TypeJournal) {
  try {
    const r = JSON.parse(localStorage.getItem(`journal.${type}`) ?? "null");
    if (r && typeof r.du === "string" && Array.isArray(r.types)) return { groupement: "jour" as Groupement, ...r } as { du: string; au: string; types: string[]; groupement: Groupement };
  } catch {
    // stockage indisponible
  }
  return { ...bornes("mois"), types: CONFIG[type].types.map((x) => x.valeur), groupement: "jour" as Groupement };
}

/**
 * Éditions › journal des ventes, des achats ou du stock : choisir la période et les types de documents ; les documents
 * s'affichent jour par jour avec un sous-total, puis le total, les totaux par type et (ventes, achats) la TVA par taux.
 */
export default function Journal({ type }: { type: TypeJournal }) {
  const { user } = useAuth();
  const config = CONFIG[type];
  const initial = useMemo(() => lireReglages(type), [type]);
  const [du, setDu] = useState(initial.du);
  const [au, setAu] = useState(initial.au);
  const [types, setTypes] = useState<Set<string>>(new Set(initial.types));
  const [groupement, setGroupement] = useState<Groupement>(initial.groupement);
  const [filtre, setFiltre] = useState<string | undefined>(undefined);
  const [statut, setStatut] = useState<"tous" | "impaye" | "paye">("tous");
  const [vendeurFiltre, setVendeurFiltre] = useState<string | undefined>(undefined);
  const [choix, setChoix] = useState<{ value: string; label: string; meta?: string }[]>([]);
  const [vendeurs, setVendeurs] = useState<{ value: string; label: string }[]>([]);
  const [picker, setPicker] = useState<"filtre" | "vendeur" | null>(null);
  // Aperçu d'un document (l'œil de chaque ligne) : fenêtre par-dessus le journal.
  const [apercu, setApercu] = useState<DocumentApercu | null>(null);
  const [achatOuvert, setAchatOuvert] = useState<string | null>(null);

  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [parTaux, setParTaux] = useState<TauxTva[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(`journal.${type}`, JSON.stringify({ du, au, types: [...types], groupement }));
    } catch {
      // stockage indisponible
    }
  }, [type, du, au, types, groupement]);

  // Listes des filtres : clients (ventes), fournisseurs (achats), vendeurs / camions (ventes, stock).
  useEffect(() => {
    if (type === "ventes") listClients().then((l) => setChoix(l.map((c) => ({ value: c.id, label: c.nomCommerce, meta: c.ref ? `N° ${c.ref}` : undefined })))).catch(() => undefined);
    if (type === "achats") listFournisseurs().then((l) => setChoix(l.map((f) => ({ value: f.id, label: nomFournisseur(f) })))).catch(() => undefined);
    if (type !== "achats")
      listUsers()
        .then((l) => setVendeurs(l.filter((u) => u.role === "VENDEUR").map((u) => ({ value: u.id, label: u.nom }))))
        .catch(() => undefined);
  }, [type]);

  const charger = useCallback(async () => {
    if (types.size === 0) {
      setLignes([]);
      setParTaux([]);
      setChargement(false);
      return;
    }
    setChargement(true);
    setErreur(null);
    const commun = { dateFrom: du || undefined, dateTo: au || undefined, types: [...types].join(",") };
    try {
      if (type === "stock") {
        const r = await getJournal("stock", { ...commun, vendeurId: vendeurFiltre });
        setLignes(r.lignes);
        setParTaux([]);
      } else {
        const r = await getJournal(type, {
          ...commun,
          ...(type === "ventes" ? { clientId: filtre, vendeurId: vendeurFiltre } : { fournisseurId: filtre, statut: statut === "tous" ? undefined : statut }),
        });
        setLignes(r.lignes);
        setParTaux(r.parTaux);
      }
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible de charger le journal"));
    } finally {
      setChargement(false);
    }
  }, [type, du, au, types, filtre, vendeurFiltre, statut]);

  useEffect(() => {
    charger();
  }, [charger]);
  useIonViewWillEnter(() => {
    charger();
  }, [charger]);

  const nomDocument = (l: Ligne) => `${t(NOM_DOCUMENT[type][l.type] ?? l.type)} n° ${l.numero}`;
  const etiquette = (l: Ligne) => {
    const m = montant(l);
    if (m.annule) return <Tag tone="danger">{t("Annulé")}</Tag>;
    if (m.factureNumero) return <Tag tone="info">{t("Facturé · {n}", { n: m.factureNumero })}</Tag>;
    return null;
  };

  const colonnesBase: Colonne[] =
    type === "stock"
      ? [
          { titre: t("Document"), rendu: (l) => nomDocument(l), texte: (l) => nomDocument(l) },
          { titre: t("Camion"), rendu: (l) => l.tiers, texte: (l) => l.tiers, tiers: true },
          { titre: t("Articles"), droite: true, rendu: (l) => stock(l).nbArticles, texte: (l) => String(stock(l).nbArticles), somme: (l) => stock(l).nbArticles },
          { titre: t("Pièces"), droite: true, rendu: (l) => stock(l).pieces, texte: (l) => String(stock(l).pieces), somme: (l) => stock(l).pieces },
          { titre: t("Valeur achat HT"), droite: true, rendu: (l) => <Money value={stock(l).valeurAchat} />, texte: (l) => nb(stock(l).valeurAchat), somme: (l) => stock(l).valeurAchat },
          { titre: t("Valeur vente HT"), droite: true, rendu: (l) => <Money value={stock(l).valeurVente} />, texte: (l) => nb(stock(l).valeurVente), somme: (l) => stock(l).valeurVente },
        ]
      : [
          {
            titre: t("Document"),
            rendu: (l) => (
              <span className="rc-journal__numero">
                {nomDocument(l)} {etiquette(l)}
              </span>
            ),
            texte: (l) =>
              montant(l).annule ? `${nomDocument(l)} (annulé)` : montant(l).factureNumero ? `${nomDocument(l)} (facturé ${montant(l).factureNumero})` : nomDocument(l),
          },
          { titre: type === "ventes" ? t("Client") : t("Fournisseur / note"), rendu: (l) => l.tiers, texte: (l) => l.tiers, tiers: true },
          { titre: t("HT"), droite: true, rendu: (l) => <Money value={montant(l).ht} />, texte: (l) => nb(montant(l).ht), somme: (l) => montant(l).ht },
          { titre: t("TVA"), droite: true, rendu: (l) => <Money value={montant(l).tva} />, texte: (l) => nb(montant(l).tva), somme: (l) => montant(l).tva },
          { titre: t("TTC"), droite: true, rendu: (l) => <Money value={montant(l).ttc} />, texte: (l) => nb(montant(l).ttc), somme: (l) => montant(l).ttc },
          ...(type === "achats"
            ? [
                { titre: t("Payé"), droite: true, rendu: (l: Ligne) => (montant(l).paye === undefined ? "—" : <Money value={montant(l).paye!} />), texte: (l: Ligne) => (montant(l).paye === undefined ? "" : nb(montant(l).paye!)), somme: (l: Ligne) => montant(l).paye ?? 0 },
                { titre: t("Reste"), droite: true, rendu: (l: Ligne) => (montant(l).reste === undefined ? "—" : <Money value={montant(l).reste!} tone={montant(l).reste! > 0 ? "warning" : "default"} />), texte: (l: Ligne) => (montant(l).reste === undefined ? "" : nb(montant(l).reste!)), somme: (l: Ligne) => montant(l).reste ?? 0 },
              ]
            : []),
        ];

  const colonnes: Colonne[] =
    groupement === "jour"
      ? colonnesBase
      : [
          { titre: t("Date"), rendu: (l) => formatDate(l.date), texte: (l) => formatDate(l.date) },
          ...colonnesBase.filter((c) => !c.tiers),
        ];

  // Groupe d'une ligne : son jour, ou son client / fournisseur / camion (un B° Entrée n'a pas de fournisseur).
  const nomGroupe = (l: Ligne) => (type === "achats" && l.type === "ENTREE" ? t("B° Entrée (sans fournisseur)") : l.tiers || "—");

  // Regroupement (par jour, ou par client / fournisseur / camion), avec le sous-total des documents comptés.
  const groupes = useMemo(() => {
    const m = new Map<string, Ligne[]>();
    for (const l of lignes) {
      const cle = groupement === "jour" ? toLocalDateString(new Date(l.date)) : nomGroupe(l);
      m.set(cle, [...(m.get(cle) ?? []), l]);
    }
    return [...m.entries()]
      .sort((a, b) => (groupement === "jour" ? a[0].localeCompare(b[0]) : a[0].localeCompare(b[0], "fr", { sensitivity: "base" })))
      .map(([cle, ls]) => ({
        cle,
        libelle: groupement === "jour" ? `${formatLongDate(parseLocalDate(cle))} · ${formatDate(parseLocalDate(cle))}` : cle,
        lignes: [...ls].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lignes, groupement, type]);
  const libelleSousTotal = groupement === "jour" ? t("Total du jour") : t("Sous-total");
  const somme = (ls: Ligne[], c: Colonne) => ls.filter((l) => l.compte).reduce((s, l) => s + (c.somme?.(l) ?? 0), 0);
  const montantPrincipal = (l: Ligne) => (type === "stock" ? stock(l).valeurVente : montant(l).ttc);
  const parType = config.types
    .filter((x) => types.has(x.valeur))
    .map((x) => {
      const ls = lignes.filter((l) => l.type === x.valeur && l.compte);
      return { label: x.label, nb: ls.length, montant: ls.reduce((s, l) => s + montantPrincipal(l), 0) };
    });
  const totalGeneral = parType.reduce((s, x) => s + x.montant, 0);

  const sousTitre = `${t("Du {a} au {b}", { a: du ? formatDate(parseLocalDate(du)) : "…", b: au ? formatDate(parseLocalDate(au)) : "…" })} · ${config.types
    .filter((x) => types.has(x.valeur))
    .map((x) => x.label)
    .join(", ")}`;

  const exporter = (): JournalExport => ({
    titre: config.titre,
    sousTitre: groupement === "jour" ? sousTitre : `${sousTitre} · ${t("par")} ${t(LIBELLE_TIERS[type]).toLowerCase()}`,
    colonnes: colonnes.map((c) => ({ titre: c.titre, droite: c.droite })),
    jours: groupes.map((j) => ({
      libelle: j.libelle,
      lignes: j.lignes.map((l) => colonnes.map((c) => c.texte(l))),
      sousTotal: colonnes.map((c, i) => (i === 0 ? libelleSousTotal : c.somme ? nb(somme(j.lignes, c)).replace(/,000$/, (x) => (c.titre === t("Articles") || c.titre === t("Pièces") ? "" : x)) : "")),
    })),
    total: colonnes.map((c, i) => (i === 0 ? t("Total") : c.somme ? nb(somme(lignes, c)) : "")),
    parType: [...parType.map((x) => [x.label, String(x.nb), nb(x.montant)]), [t("Total"), String(parType.reduce((s, x) => s + x.nb, 0)), nb(totalGeneral)]],
    parTaux: parTaux.map((x) => [nb(x.base), `${x.taux} %`, nb(x.tva)]),
  });

  const ouvrir = (l: Ligne) => {
    if (type === "achats") setAchatOuvert(l.id);
    else setApercu({ genre: type === "stock" ? "STOCK" : l.type === "BL" ? "BL_VENTE" : "FACTURE_VENTE", id: l.id, titre: nomDocument(l) });
  };

  const basculerType = (v: string) =>
    setTypes((s) => {
      const n = new Set(s);
      if (n.has(v)) n.delete(v);
      else n.add(v);
      return n;
    });

  if (user && user.role !== "ADMIN") return <Navigate to="/factures" replace />;
  const choixFiltre = choix.find((c) => c.value === filtre);
  const vendeur = vendeurs.find((v) => v.value === vendeurFiltre);

  return (
    <IonPage className="rc-page--large">
      <AppHeader large eyebrow={t("Éditions")} title={t(config.titre)} actions={<AccountButton />} />
      <IonContent>
        <div className="rc-transfo">
          {erreur && <PageNotice actionLabel={t("Réessayer")} onAction={charger}>{erreur}</PageNotice>}

          {/* Période */}
          <div className="rc-achat__barre">
            <div className="rc-achat__filtres">
              <Field label={t("Du")} hideLabel prefix={<span className="rc-bl__prefixe">{t("Du")}</span>} type="date" value={du} max={au || undefined} onChange={setDu} />
              <Field label={t("Au")} hideLabel prefix={<span className="rc-bl__prefixe">{t("Au")}</span>} type="date" value={au} min={du || undefined} onChange={setAu} />
              {(
                [
                  ["jour", t("Aujourd'hui")],
                  ["mois", t("Ce mois")],
                  ["moisDernier", t("Mois dernier")],
                  ["annee", t("Cette année")],
                ] as const
              ).map(([cle, label]) => (
                <Button
                  key={cle}
                  variant="ghost"
                  onClick={() => {
                    const b = bornes(cle);
                    setDu(b.du);
                    setAu(b.au);
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Types de documents (cases à cocher) et filtres */}
          <div className="rc-achat__barre">
            <div className="rc-journal__types" role="group" aria-label={t("Types de documents")}>
              {config.types.map((x) => (
                <label key={x.valeur} className={`rc-journal__type${types.has(x.valeur) ? " rc-journal__type--actif" : ""}`}>
                  <input type="checkbox" checked={types.has(x.valeur)} onChange={() => basculerType(x.valeur)} />
                  {t(x.label)}
                </label>
              ))}
            </div>
            <div className="rc-achat__filtres">
              <Segmented
                label={t("Grouper par")}
                value={groupement}
                onChange={setGroupement}
                options={[
                  { value: "jour", label: t("Par jour") },
                  { value: "tiers", label: t("Par {x}", { x: t(LIBELLE_TIERS[type]).toLowerCase() }) },
                ]}
              />
              {type !== "stock" && (
                <FilterChip
                  label={choixFiltre ? choixFiltre.label : type === "ventes" ? t("Tous les clients") : t("Tous les fournisseurs")}
                  active={Boolean(choixFiltre)}
                  ariaLabel={type === "ventes" ? t("Filtrer par client") : t("Filtrer par fournisseur")}
                  onOpen={() => setPicker("filtre")}
                />
              )}
              {type !== "achats" && (
                <FilterChip
                  label={vendeur ? vendeur.label : type === "stock" ? t("Tous les camions") : t("Tous les vendeurs")}
                  active={Boolean(vendeur)}
                  ariaLabel={t("Filtrer par vendeur")}
                  onOpen={() => setPicker("vendeur")}
                />
              )}
              {type === "achats" && (
                <Segmented
                  label={t("Paiement")}
                  value={statut}
                  onChange={setStatut}
                  options={[
                    { value: "tous", label: t("Tous") },
                    { value: "impaye", label: t("Non payés") },
                    { value: "paye", label: t("Payés") },
                  ]}
                />
              )}
            </div>
          </div>

          <div className="rc-journal__actions">
            <span className="rc-footnote">{sousTitre}</span>
            <div className="rc-factures__boutons">
              <Button variant="secondary" icon={printOutline} disabled={lignes.length === 0} onClick={() => imprimerJournal(exporter())}>
                {t("Imprimer")}
              </Button>
              <Button variant="secondary" icon={downloadOutline} disabled={lignes.length === 0} onClick={() => telechargerJournalPdf(exporter())}>
                {t("PDF")}
              </Button>
              <Button variant="secondary" icon={gridOutline} disabled={lignes.length === 0} onClick={() => telechargerJournalCsv(exporter())}>
                {t("Excel")}
              </Button>
            </div>
          </div>

          {chargement ? (
            <Spinner />
          ) : types.size === 0 ? (
            <EmptyState icon={documentTextOutline} title={t("Cochez au moins un type de document.")} />
          ) : lignes.length === 0 ? (
            <EmptyState icon={documentTextOutline} title={t("Aucun document sur cette période.")} />
          ) : (
            <>
              <div className="rc-tdonnees rc-journal">
                <table aria-label={t(config.titre)}>
                  <thead>
                    <tr>
                      {colonnes.map((c) => (
                        <th key={c.titre} scope="col" style={{ textAlign: c.droite ? "end" : "start" }}>
                          {c.titre}
                        </th>
                      ))}
                      <th scope="col" className="rc-journal__oeil" aria-label={t("Voir")} />
                    </tr>
                  </thead>
                  {groupes.map((j) => (
                    <tbody key={j.cle}>
                      <tr className="rc-journal__jour">
                        <th colSpan={colonnes.length + 1} scope="colgroup">
                          <span className="rc-cap">{j.libelle}</span>
                          <small>{tn(j.lignes.filter((l) => l.compte).length, "{n} document", "{n} documents")}</small>
                        </th>
                      </tr>
                      {j.lignes.map((l) => (
                        <tr key={`${l.type}-${l.id}`} className={l.compte ? undefined : "rc-tdonnees__ligne--attenuee"}>
                          {colonnes.map((c) => (
                            <td key={c.titre} style={{ textAlign: c.droite ? "end" : "start" }}>
                              {c.rendu(l)}
                            </td>
                          ))}
                          <td className="rc-journal__oeil">
                            <IconButton icon={eyeOutline} size="sm" label={t("Voir {d}", { d: nomDocument(l) })} onClick={() => ouvrir(l)} />
                          </td>
                        </tr>
                      ))}
                      <tr className="rc-journal__sous-total">
                        {colonnes.map((c, i) => (
                          <td key={c.titre} style={{ textAlign: c.droite ? "end" : "start" }}>
                            {i === 0 ? libelleSousTotal : c.somme ? c.titre === t("Articles") || c.titre === t("Pièces") ? somme(j.lignes, c) : <Money value={somme(j.lignes, c)} /> : ""}
                          </td>
                        ))}
                        <td />
                      </tr>
                    </tbody>
                  ))}
                  <tfoot>
                    <tr className="rc-journal__total">
                      {colonnes.map((c, i) => (
                        <td key={c.titre} style={{ textAlign: c.droite ? "end" : "start" }}>
                          {i === 0 ? t("Total") : c.somme ? c.titre === t("Articles") || c.titre === t("Pièces") ? somme(lignes, c) : <Money value={somme(lignes, c)} size="md" /> : ""}
                        </td>
                      ))}
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="rc-journal__recap">
                <section className="rc-dash-card" aria-label={t("Totaux par type")}>
                  <header className="rc-dash-card__tete">
                    <h3 className="rc-dash-card__titre">{t("Totaux par type")}</h3>
                  </header>
                  <dl className="rc-dash-liste">
                    {parType.map((x) => (
                      <div key={x.label}>
                        <dt>
                          {t(x.label)} <small>({x.nb})</small>
                        </dt>
                        <dd>
                          <Money value={x.montant} />
                        </dd>
                      </div>
                    ))}
                    <div className="rc-dash-liste__total">
                      <dt>{type === "stock" ? t("Total (valeur vente HT)") : t("Total TTC")}</dt>
                      <dd>
                        <Money value={totalGeneral} size="lg" />
                      </dd>
                    </div>
                  </dl>
                </section>
                {parTaux.length > 0 && (
                  <section className="rc-dash-card" aria-label={t("TVA par taux")}>
                    <header className="rc-dash-card__tete">
                      <h3 className="rc-dash-card__titre">{t("TVA par taux")}</h3>
                    </header>
                    <table className="rc-journal__tva">
                      <thead>
                        <tr>
                          <th>{t("Taux")}</th>
                          <th>{t("Base HT")}</th>
                          <th>{t("Montant TVA")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parTaux.map((x) => (
                          <tr key={x.taux}>
                            <td>{x.taux} %</td>
                            <td>
                              <Money value={x.base} />
                            </td>
                            <td>
                              <Money value={x.tva} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                )}
              </div>
              {lignes.some((l) => !l.compte) && (
                <p className="rc-footnote">{t("Les documents en gris (annulés, ou BL déjà comptés dans leur facture) ne sont pas additionnés.")}</p>
              )}
            </>
          )}
        </div>

        <ApercuDocumentSheet document={apercu} onDismiss={() => setApercu(null)} />
        <AchatDetailSheet achatId={achatOuvert} onDismiss={() => setAchatOuvert(null)} onChange={charger} onRegler={() => setAchatOuvert(null)} />

        <PickerSheet
          isOpen={picker === "filtre"}
          title={type === "ventes" ? t("Client") : t("Fournisseur")}
          value={filtre ?? TOUS}
          onDismiss={() => setPicker(null)}
          onSelect={(v) => {
            setFiltre(v === TOUS ? undefined : v);
            setPicker(null);
          }}
          options={[{ value: TOUS, label: type === "ventes" ? t("Tous les clients") : t("Tous les fournisseurs") }, ...choix]}
        />
        <PickerSheet
          isOpen={picker === "vendeur"}
          title={type === "stock" ? t("Camion") : t("Vendeur")}
          value={vendeurFiltre ?? TOUS}
          onDismiss={() => setPicker(null)}
          onSelect={(v) => {
            setVendeurFiltre(v === TOUS ? undefined : v);
            setPicker(null);
          }}
          options={[{ value: TOUS, label: type === "stock" ? t("Tous les camions") : t("Tous les vendeurs") }, ...vendeurs]}
        />
      </IonContent>
    </IonPage>
  );
}
