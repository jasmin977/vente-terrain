import { useEffect, useMemo, useState } from "react";
import { calculatorOutline, chevronBackOutline, chevronDown, chevronForwardOutline, closeOutline, refreshOutline, sparklesOutline } from "ionicons/icons";
import { IonIcon } from "@ionic/react";
import { ApiError } from "../api/client";
import { transformerEnFacture } from "../api/factures";
import { listAchats } from "../api/achats";
import type { Facture } from "../types/facture";
import { Button, Field, IconButton, Money, Notice, PageNotice, SearchField, Sheet, Tag, TableauDonnees } from "../ui";
import type { ColonneDonnees } from "../ui";
import { getLocale, t, tn } from "../i18n";
import { formatDate, parseLocalDate, toLocalDateString } from "../utils/format";
import { aUnMf, planifier, type BonPlan, type FacturePlan, type ResultatPlan } from "../utils/transformationIntelligente";

const FRAIS_PAR_FACTURE = 1; // TND

type Etape = "parametres" | "apercu";

const premierDuMois = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const dernierDuMois = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const nombre = (texte: string) => Number(texte.replace(",", ".").replace(/\s/g, "")) || 0;

interface Props {
  isOpen: boolean;
  onDismiss: () => void;
  /** Bons de livraison encore à facturer (la liste de l'écran). */
  bons: Facture[];
  /** Appelé quand des factures ont été créées (nombre créé), même si la création s'est arrêtée en cours. */
  onTermine: (nbCreees: number) => void;
}

/** Transformation intelligente : l'admin donne la période, le total visé, le plafond par facture et les clients ;
 *  le système prépare un aperçu de factures groupées par client, puis les crée une à une. */
export default function TransformationIntelligente({ isOpen, onDismiss, bons, onTermine }: Props) {
  const aujourdhui = toLocalDateString(new Date());
  const [etape, setEtape] = useState<Etape>("parametres");
  const [mois, setMois] = useState(() => premierDuMois(new Date()));
  const [cibleTxt, setCibleTxt] = useState("");
  // Total visé = factures d'achat du mois (TTC) + une marge (5 % par défaut). Modifiable à la main.
  const [margeTxt, setMargeTxt] = useState("5");
  const [achatsMois, setAchatsMois] = useState<{ total: number; nb: number } | null>(null);
  const [cibleManuelle, setCibleManuelle] = useState(false);
  const [plafondTxt, setPlafondTxt] = useState("1000");
  const [minimumTxt, setMinimumTxt] = useState("0");
  const [clientsOuverts, setClientsOuverts] = useState(false);
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const [recherche, setRecherche] = useState("");
  const [plan, setPlan] = useState<ResultatPlan | null>(null);
  const [creation, setCreation] = useState<{ fait: number; total: number } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setEtape("parametres");
      setPlan(null);
      setErreur(null);
      setCreation(null);
      // À chaque ouverture, le total visé repart du calcul (achats du mois + marge).
      setCibleManuelle(false);
    }
  }, [isOpen]);

  // Les clients qui ont des BL à facturer, avec leur nombre de BL et leur total.
  const clients = useMemo(() => {
    const m = new Map<string, { id: string; nom: string; ref?: number; mf: boolean; nb: number; total: number }>();
    for (const b of bons) {
      if (b.statut === "ANNULEE") continue;
      const c = m.get(b.clientId) ?? { id: b.clientId, nom: b.client?.nomCommerce ?? b.clientId, ref: b.client?.ref, mf: aUnMf(b.client?.code), nb: 0, total: 0 };
      c.nb += 1;
      c.total += Number(b.montantTTC);
      m.set(b.clientId, c);
    }
    return [...m.values()].sort((a, b) => (a.ref ?? 1e9) - (b.ref ?? 1e9) || a.nom.localeCompare(b.nom));
  }, [bons]);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return q ? clients.filter((c) => String(c.ref ?? "") === q || c.nom.toLowerCase().includes(q)) : clients;
  }, [clients, recherche]);

  // Période : un mois entier, jamais après aujourd'hui (pas de facture datée dans le futur).
  const debut = toLocalDateString(premierDuMois(mois));
  const finBrute = toLocalDateString(dernierDuMois(mois));
  const fin = finBrute > aujourdhui ? aujourdhui : finBrute;
  const periodeValide = debut <= fin;

  const cible = nombre(cibleTxt);
  const marge = nombre(margeTxt);
  const cibleCalculee = achatsMois ? Math.round(achatsMois.total * (1 + marge / 100) * 1000) / 1000 : null;

  // Factures d'achat du mois choisi (factures fournisseurs, sans les BL), rechargées à chaque mois.
  useEffect(() => {
    if (!isOpen) return;
    let annule = false;
    setAchatsMois(null);
    listAchats({ type: "FACTURE", dateFrom: debut, dateTo: finBrute })
      .then((l) => {
        if (!annule) setAchatsMois({ total: Math.round(l.reduce((s, a) => s + Number(a.montantTTC), 0) * 1000) / 1000, nb: l.length });
      })
      .catch(() => !annule && setAchatsMois({ total: 0, nb: 0 }));
    return () => {
      annule = true;
    };
  }, [isOpen, debut, finBrute]);

  // Tant que l'admin ne l'a pas changé, le total visé suit le calcul (mois, marge).
  useEffect(() => {
    if (!cibleManuelle && cibleCalculee !== null) setCibleTxt(cibleCalculee > 0 ? cibleCalculee.toFixed(3) : "");
  }, [cibleCalculee, cibleManuelle]);
  const plafond = nombre(plafondTxt);
  const minimum = nombre(minimumTxt);
  const pret = periodeValide && cible > 0 && plafond > 0 && minimum <= plafond;

  const basculerClient = (id: string) =>
    setChoisis((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const calculer = () => {
    const bonsPlan: BonPlan[] = bons
      .filter((b) => b.statut !== "ANNULEE")
      .map((b) => ({
        id: b.id,
        numero: b.numero,
        clientId: b.clientId,
        clientNom: b.client?.nomCommerce ?? b.clientId,
        clientRef: b.client?.ref,
        mf: aUnMf(b.client?.code),
        date: toLocalDateString(new Date(b.date)),
        total: Number(b.montantTTC),
      }));
    setPlan(planifier(bonsPlan, { debut, fin, cible, plafond, minimum, prioritaires: choisis }));
    setErreur(null);
    setEtape("apercu");
  };

  const creer = async () => {
    if (!plan || plan.factures.length === 0) return;
    // Dans l'ordre des dates : les numéros AAAA/001 suivent alors les dates.
    const liste = [...plan.factures];
    setErreur(null);
    setCreation({ fait: 0, total: liste.length });
    let fait = 0;
    try {
      for (const f of liste) {
        await transformerEnFacture({ date: f.date, bonIds: f.bons.map((b) => b.id) });
        fait += 1;
        setCreation({ fait, total: liste.length });
      }
      onTermine(fait);
      onDismiss();
    } catch (err) {
      setErreur(
        `${err instanceof ApiError ? err.message : t("Création impossible")} — ${tn(fait, "{n} facture créée avant l'arrêt", "{n} factures créées avant l'arrêt")}.`,
      );
      if (fait > 0) onTermine(fait);
    } finally {
      setCreation(null);
    }
  };

  const colonnes: ColonneDonnees<FacturePlan>[] = [
    { id: "date", titre: t("Date"), rendu: (f) => formatDate(parseLocalDate(f.date)), tri: (f) => f.date, largeur: "110px" },
    { id: "ref", titre: t("N° client"), rendu: (f) => f.clientRef ?? "—", tri: (f) => f.clientRef ?? 0, largeur: "100px" },
    { id: "mf", titre: t("MF"), rendu: (f) => (f.mf ? t("Oui") : "—"), tri: (f) => Number(f.mf), largeur: "70px" },
    { id: "client", titre: t("Client"), principale: true, rendu: (f) => f.clientNom, tri: (f) => f.clientNom, souple: true },
    {
      id: "bons",
      titre: t("Bons de livraison"),
      rendu: (f) => (
        <span title={f.bons.map((b) => b.numero).join(", ")}>
          {f.bons.length <= 3 ? f.bons.map((b) => b.numero).join(", ") : `${f.bons.slice(0, 2).map((b) => b.numero).join(", ")} +${f.bons.length - 2}`}
        </span>
      ),
      souple: true,
    },
    { id: "total", titre: t("Total TTC"), rendu: (f) => <Money value={f.total} />, tri: (f) => f.total, aligne: "end", largeur: "130px" },
  ];

  const libelleMois = mois.toLocaleDateString(getLocale(), { month: "long", year: "numeric" });
  const moisSuivantFutur = premierDuMois(new Date(mois.getFullYear(), mois.getMonth() + 1, 1)) > new Date();

  const footer =
    etape === "parametres" ? (
      <div className="rc-smart__pied">
        <Button size="lg" icon={sparklesOutline} disabled={!pret} onClick={calculer}>
          {t("Générer l'aperçu")}
        </Button>
      </div>
    ) : (
      <div className="rc-smart__pied">
        <Button variant="secondary" size="lg" disabled={creation !== null} onClick={() => setEtape("parametres")}>
          {t("Modifier")}
        </Button>
        <Button size="lg" loading={creation !== null} disabled={!plan || plan.factures.length === 0} onClick={creer}>
          {creation
            ? t("Création {a}/{b}…", { a: creation.fait, b: creation.total })
            : tn(plan?.factures.length ?? 0, "Créer {n} facture", "Créer {n} factures")}
        </Button>
      </div>
    );

  return (
    <Sheet isOpen={isOpen} title={t("Transformation intelligente")} large onDismiss={onDismiss} footer={footer}>
      <div className="rc-smart">
        {erreur && <PageNotice>{erreur}</PageNotice>}

        {etape === "parametres" ? (
          <>
            <section className="rc-smart__bloc">
              <h3 className="rc-smart__titre">{t("Mois")}</h3>
              <div className="rc-daystep">
                <IconButton
                  icon={chevronBackOutline}
                  className="rc-flip"
                  label={t("Mois précédent")}
                  variant="filled"
                  onClick={() => setMois((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                />
                <p className="rc-daystep__label">{libelleMois}</p>
                <IconButton
                  icon={chevronForwardOutline}
                  className="rc-flip"
                  label={t("Mois suivant")}
                  variant="filled"
                  disabled={moisSuivantFutur}
                  onClick={() => setMois((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                />
              </div>
              {finBrute > aujourdhui && periodeValide && (
                <Notice tone="info">{t("Les factures seront datées jusqu'à aujourd'hui ({d}) au plus tard.", { d: formatDate(parseLocalDate(fin)) })}</Notice>
              )}
              {!periodeValide && <Notice tone="warning">{t("La période est vide.")}</Notice>}
            </section>

            <section className="rc-smart__bloc">
              <h3 className="rc-smart__titre">{t("Montants")}</h3>
              {/* Total visé : achats facturés du mois + marge. */}
              <div className="rc-smart__calcul">
                <IonIcon icon={calculatorOutline} aria-hidden="true" />
                <div className="rc-smart__calcul-corps">
                  <span>
                    {achatsMois === null ? (
                      t("Calcul des factures d'achat du mois…")
                    ) : (
                      <>
                        {tn(achatsMois.nb, "{n} facture d'achat en {m}", "{n} factures d'achat en {m}").replace("{m}", libelleMois)} :{" "}
                        <Money value={achatsMois.total} size="sm" /> TTC
                      </>
                    )}
                  </span>
                  <span className="rc-smart__calcul-formule">
                    <Money value={achatsMois?.total ?? 0} size="sm" /> +
                    <Field label={t("Marge")} hideLabel inputMode="decimal" value={margeTxt} onChange={setMargeTxt} suffix="%" />
                    = <strong>{cibleCalculee !== null ? <Money value={cibleCalculee} size="md" /> : "—"}</strong>
                  </span>
                </div>
                {cibleManuelle && (
                  <Button variant="ghost" icon={refreshOutline} onClick={() => setCibleManuelle(false)}>
                    {t("Reprendre le calcul")}
                  </Button>
                )}
              </div>
              {achatsMois?.nb === 0 && <Notice tone="warning">{t("Aucune facture d'achat ce mois-ci : saisissez le total visé à la main.")}</Notice>}
              <div className="rc-smart__ligne">
                <Field
                  label={t("Total à ne pas dépasser (TND)")}
                  inputMode="decimal"
                  value={cibleTxt}
                  placeholder="0.000"
                  onChange={(v) => {
                    setCibleTxt(v);
                    setCibleManuelle(true);
                  }}
                  hint={
                    cibleManuelle
                      ? t("Saisi à la main. La somme de toutes les factures s'en approche sans le dépasser.")
                      : t("Achats du mois + {p} %. La somme de toutes les factures s'en approche sans le dépasser.", { p: marge })
                  }
                />
                <Field
                  label={t("Maximum par facture (TND)")}
                  inputMode="decimal"
                  value={plafondTxt}
                  onChange={setPlafondTxt}
                  hint={t("Une facture regroupe des BL d'un même client sous ce montant.")}
                />
                <Field
                  label={t("Minimum par facture (TND)")}
                  inputMode="decimal"
                  value={minimumTxt}
                  onChange={setMinimumTxt}
                  error={minimum > plafond ? t("Le minimum dépasse le maximum.") : undefined}
                  hint={t("Si le total d'un client est plus petit, ses BL sont ignorés (0 = aucun minimum).")}
                />
              </div>
            </section>

            <section className="rc-smart__bloc">
              <button
                type="button"
                className="rc-smart__bascule"
                aria-expanded={clientsOuverts}
                onClick={() => setClientsOuverts((o) => !o)}
              >
                <span className="rc-smart__titre">
                  {t("Clients prioritaires")} <small>{choisis.size}/{clients.length}</small>
                </span>
                <IonIcon icon={chevronDown} aria-hidden="true" className={clientsOuverts ? "rc-smart__chevron rc-smart__chevron--ouvert" : "rc-smart__chevron"} />
              </button>
              <p className="rc-footnote">
                {t("Tous les BL des clients cochés seront facturés avant la fin du mois, en un minimum de factures. Les autres clients complètent le total, ceux qui ont un MF en premier.")}
              </p>
              {choisis.size > 0 && (
                <ul className="rc-smart__puces" aria-label={t("Clients sélectionnés")}>
                  {clients
                    .filter((c) => choisis.has(c.id))
                    .map((c) => (
                      <li key={c.id}>
                        <span className="rc-smart__puce">
                          {c.ref ? `${c.ref} · ` : ""}
                          {c.nom}
                          <button type="button" aria-label={t("Retirer {nom}", { nom: c.nom })} onClick={() => basculerClient(c.id)}>
                            <IonIcon icon={closeOutline} aria-hidden="true" />
                          </button>
                        </span>
                      </li>
                    ))}
                </ul>
              )}
              {clientsOuverts && (
                <div className="rc-smart__panneau">
                  <div className="rc-smart__tete">
                    <SearchField value={recherche} onChange={setRecherche} placeholder={t("N° client ou nom…")} label={t("Rechercher un client")} />
                    <div className="rc-smart__actions">
                      <Button variant="secondary" onClick={() => setChoisis(new Set(visibles.map((c) => c.id)))}>
                        {t("Tout sélectionner")}
                      </Button>
                      <Button variant="secondary" disabled={choisis.size === 0} onClick={() => setChoisis(new Set())}>
                        {t("Aucun")}
                      </Button>
                    </div>
                  </div>
                  <ul className="rc-smart__clients">
                    {visibles.map((c) => (
                      <li key={c.id}>
                        <label className="rc-smart__client">
                          <input type="checkbox" className="rc-transfo__case" checked={choisis.has(c.id)} onChange={() => basculerClient(c.id)} />
                          <span className="rc-smart__ref">{c.ref ?? "—"}</span>
                          <span className="rc-smart__nom">
                            {c.nom} {!c.mf && <Tag tone="warning">{t("Sans MF")}</Tag>}
                          </span>
                          <span className="rc-smart__meta">
                            {tn(c.nb, "{n} BL", "{n} BL")} · <Money value={c.total} size="sm" />
                          </span>
                        </label>
                      </li>
                    ))}
                    {visibles.length === 0 && <li className="rc-footnote">{t("Aucun client.")}</li>}
                  </ul>
                </div>
              )}
            </section>
          </>
        ) : (
          plan && (
            <>
              <div className="rc-smart__resume">
                <div>
                  <span className="rc-smart__etiquette">{t("Factures")}</span>
                  <strong>{plan.factures.length}</strong>
                  <small>
                    {plan.nbBons} BL · {t("frais ≈ {m} TND", { m: plan.factures.length * FRAIS_PAR_FACTURE })}
                  </small>
                </div>
                <div>
                  <span className="rc-smart__etiquette">{t("Total prévu")}</span>
                  <strong>
                    <Money value={plan.total} size="lg" />
                  </strong>
                  <small>
                    {t("sur")} <Money value={cible} size="sm" /> · {t("écart")} <Money value={plan.ecart} size="sm" />
                  </small>
                </div>
                <div>
                  <span className="rc-smart__etiquette">{t("Période")}</span>
                  <strong>{formatDate(parseLocalDate(debut))} – {formatDate(parseLocalDate(fin))}</strong>
                  <small>{t("max {m} TND par facture", { m: plafond })}</small>
                </div>
              </div>

              {plan.disponible < cible && (
                <Notice tone="warning">
                  {t("Les BL disponibles des clients choisis ne totalisent que {m} TND : le total visé ne peut pas être atteint.", { m: plan.disponible.toFixed(3) })}
                </Notice>
              )}
              {plan.prioritairesNonFactures.length > 0 && (
                <Notice tone="warning">
                  {tn(
                    plan.prioritairesNonFactures.length,
                    "{n} BL des clients prioritaires ne tient pas dans le total visé et ne sera pas facturé.",
                    "{n} BL des clients prioritaires ne tiennent pas dans le total visé et ne seront pas facturés.",
                  )}
                </Notice>
              )}
              {plan.ignores.length > 0 && (
                <Notice tone="info">
                  {tn(
                    plan.ignores.length,
                    "{n} BL ignoré : sa facture serait sous le minimum de {m} TND.",
                    "{n} BL ignorés : leurs factures seraient sous le minimum de {m} TND.",
                  ).replace("{m}", String(minimum))}
                </Notice>
              )}
              {plan.tropGros.length > 0 && (
                <Notice tone="warning">
                  {tn(
                    plan.tropGros.length,
                    "{n} BL dépasse à lui seul le maximum par facture : il sera facturé seul ({l}).",
                    "{n} BL dépassent à eux seuls le maximum par facture : ils seront facturés seuls ({l}).",
                  ).replace("{l}", plan.tropGros.slice(0, 4).map((b) => `${b.numero} · ${b.total.toFixed(3)} TND`).join(", ") + (plan.tropGros.length > 4 ? "…" : ""))}
                </Notice>
              )}

              {plan.factures.length === 0 ? (
                <Notice tone="info">{t("Aucune facture possible avec ces réglages.")}</Notice>
              ) : (
                <div className="rc-smart__table">
                  <TableauDonnees
                    label={t("Factures prévues")}
                    lignes={plan.factures}
                    colonnes={colonnes}
                    cle={(f) => f.cle}
                    chevron={false}
                    triInitial={{ colonne: "date", inverse: false }}
                    pied={
                      <span className="rc-transfo__pied">
                        <strong>{tn(plan.factures.length, "{n} facture", "{n} factures")}</strong>
                        <span>
                          {t("Total")} <Money value={plan.total} size="md" />
                        </span>
                      </span>
                    }
                  />
                </div>
              )}
            </>
          )
        )}
      </div>
    </Sheet>
  );
}
