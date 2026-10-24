import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { IonContent, IonPage, useIonViewWillEnter } from "@ionic/react";
import { addOutline, checkmarkDoneOutline, documentTextOutline, swapHorizontalOutline } from "ionicons/icons";
import { ApiError } from "../api/client";
import { listAchats, listFournisseurs, transformerBlEnFacture } from "../api/achats";
import type { Achat, AchatDetail, Fournisseur, TypeAchat } from "../types/achat";
import { useAuth } from "../auth/AuthContext";
import AchatFormSheet from "../components/achats/AchatFormSheet";
import AchatDetailSheet from "../components/achats/AchatDetailSheet";
import ReglementSheet from "../components/achats/ReglementSheet";
import StatutPaiementTag from "../components/achats/StatutPaiementTag";
import { nomFournisseur } from "../components/achats/nomFournisseur";
import {
  AccountButton,
  AppHeader,
  Button,
  EmptyState,
  Fab,
  Field,
  FilterChip,
  Money,
  PageNotice,
  PickerSheet,
  SearchField,
  Segmented,
  Sheet,
  TableauDonnees,
  useHauteurRestante,
} from "../ui";
import type { ColonneDonnees } from "../ui";
import { formatDate, toLocalDateString } from "../utils/format";
import { t, tn } from "../i18n";

type FiltreStatut = "tous" | "impaye" | "paye";
const TOUS = "__tous__";

/** Achats › Liste des BL ou des factures fournisseurs, avec leur état de paiement. */
export default function AchatsListe({ type }: { type: TypeAchat }) {
  const { user } = useAuth();
  const bl = type === "BL";
  const entree = type === "ENTREE";
  // Libellés selon le type : BL, facture ou B° Entrée.
  const L = {
    titre: bl ? t("Liste des B° Livraison") : entree ? t("Liste des B° Entrée") : t("Liste des factures"),
    nouveau: bl ? t("Nouveau B° Livraison") : entree ? t("Nouveau B° Entrée") : t("Nouvelle facture"),
    numero: bl ? t("N° BL") : entree ? t("N° B° Entrée") : t("N° de facture"),
    recherche: bl ? t("N° BL…") : entree ? t("N° ou note…") : t("N° de facture…"),
    vide: bl ? t("Aucun BL fournisseur.") : entree ? t("Aucun B° Entrée.") : t("Aucune facture fournisseur."),
    tableau: bl ? t("BL fournisseurs") : entree ? t("B° Entrée") : t("Factures fournisseurs"),
    total: type === "FACTURE" ? t("Net à payer") : t("Total TTC"),
  };
  const aujourdhui = toLocalDateString(new Date());

  const [achats, setAchats] = useState<Achat[]>([]);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [du, setDu] = useState("");
  const [au, setAu] = useState("");
  const [fournisseurId, setFournisseurId] = useState<string | undefined>(undefined);
  const [pickerFournisseur, setPickerFournisseur] = useState(false);
  const [statut, setStatut] = useState<FiltreStatut>("tous");
  const [recherche, setRecherche] = useState("");

  const [creation, setCreation] = useState(false);
  const [aRegler, setARegler] = useState<{ achat: Achat | AchatDetail; apresCreation: boolean } | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);

  // BL : sélection (Ctrl / Maj + clic) puis « Transformer en facture ».
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const [transformation, setTransformation] = useState(false);
  const [numeroFacture, setNumeroFacture] = useState("");
  const [dateFacture, setDateFacture] = useState(aujourdhui);
  const [enTransformation, setEnTransformation] = useState(false);
  const [erreurTransformation, setErreurTransformation] = useState<string | null>(null);

  const zone = useRef<HTMLDivElement>(null);
  useHauteurRestante(zone);


  const charger = useCallback(async () => {
    setErreur(null);
    try {
      setAchats(await listAchats({ type, fournisseurId, dateFrom: du || undefined, dateTo: au || undefined, statut: statut === "tous" ? undefined : statut }));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible de charger les documents"));
    } finally {
      setChargement(false);
    }
  }, [type, fournisseurId, du, au, statut]);

  useEffect(() => {
    setChargement(true);
    charger();
  }, [charger]);
  useIonViewWillEnter(() => {
    charger();
    listFournisseurs().then(setFournisseurs).catch(() => undefined);
  }, [charger]);
  useEffect(() => {
    listFournisseurs().then(setFournisseurs).catch(() => undefined);
  }, []);

  const affiches = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return q ? achats.filter((a) => a.numero.toLowerCase().includes(q) || (a.notes ?? "").toLowerCase().includes(q)) : achats;
  }, [achats, recherche]);

  const totaux = useMemo(() => {
    const comptes = affiches.filter((a) => a.statut !== "FACTURE");
    return {
      ttc: affiches.reduce((s, a) => s + Number(a.montantTTC) + Number(a.timbre ?? 0), 0),
      paye: comptes.reduce((s, a) => s + a.paye, 0),
      reste: comptes.reduce((s, a) => s + a.reste, 0),
    };
  }, [affiches]);

  const fournisseur = fournisseurs.find((f) => f.id === fournisseurId);
  const selection = affiches.filter((a) => choisis.has(a.id));
  const fournisseursSelection = new Set(selection.map((a) => a.fournisseurId));
  const transformable = bl && selection.length > 0 && fournisseursSelection.size === 1 && selection.every((a) => !a.factureId);

  const basculer = (id: string) =>
    setChoisis((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const transformer = async () => {
    setEnTransformation(true);
    setErreurTransformation(null);
    try {
      const f = await transformerBlEnFacture({ bonIds: selection.map((a) => a.id), numero: numeroFacture.trim(), date: dateFacture });
      setTransformation(false);
      setChoisis(new Set());
      setInfo(t("Facture fournisseur n° {n} créée à partir de {m} BL.", { n: f.numero, m: selection.length }));
      await charger();
    } catch (err) {
      setErreurTransformation(err instanceof ApiError ? err.message : t("Transformation impossible"));
    } finally {
      setEnTransformation(false);
    }
  };

  const colonnes: ColonneDonnees<Achat>[] = [
    ...(bl
      ? [
          {
            id: "choix",
            titre: "",
            rendu: (a: Achat) => (
              <input
                type="checkbox"
                className="rc-transfo__case"
                checked={choisis.has(a.id)}
                disabled={Boolean(a.factureId)}
                aria-label={t("Sélectionner le BL {n}", { n: a.numero })}
                onClick={(e) => e.stopPropagation()}
                onChange={() => basculer(a.id)}
              />
            ),
            largeur: "44px",
          } as ColonneDonnees<Achat>,
        ]
      : []),
    { id: "numero", titre: L.numero, principale: true, rendu: (a) => a.numero, tri: (a) => a.numero },
    { id: "date", titre: t("Date"), rendu: (a) => formatDate(a.date), tri: (a) => new Date(a.date).getTime(), largeur: "120px" },
    entree
      ? { id: "note", titre: t("Note"), rendu: (a) => a.notes || "—", tri: (a) => a.notes ?? "", souple: true }
      : {
          id: "fournisseur",
          titre: t("Fournisseur"),
          rendu: (a) => nomFournisseur(a.fournisseur, a.fournisseurLibre, false),
          tri: (a) => nomFournisseur(a.fournisseur, a.fournisseurLibre, false),
          souple: true,
        },
    {
      id: "ttc",
      titre: L.total,
      rendu: (a) => <Money value={Number(a.montantTTC) + Number(a.timbre ?? 0)} />,
      tri: (a) => Number(a.montantTTC) + Number(a.timbre ?? 0),
      aligne: "end",
      largeur: "140px",
    },
    { id: "paye", titre: t("Payé"), rendu: (a) => (a.statut === "FACTURE" ? "—" : <Money value={a.paye} />), tri: (a) => a.paye, aligne: "end", largeur: "130px" },
    { id: "reste", titre: t("Reste"), rendu: (a) => (a.statut === "FACTURE" ? "—" : <Money value={a.reste} tone={a.reste > 0 ? "warning" : "default"} />), tri: (a) => a.reste, aligne: "end", largeur: "130px" },
    { id: "statut", titre: t("Paiement"), rendu: (a) => <StatutPaiementTag statut={a.statut} numeroFacture={a.facture?.numero} />, tri: (a) => a.statut, largeur: "170px" },
  ];

  if (user && user.role !== "ADMIN") return <Navigate to="/factures" replace />;

  return (
    <IonPage className="rc-page--large">
      <AppHeader large eyebrow={entree ? t("Stock") : t("Achats")} title={L.titre} actions={<AccountButton />} />
      <IonContent>
        <Fab icon={addOutline} label={L.nouveau} onClick={() => setCreation(true)} />
        <div className="rc-transfo">
          {info && (
            <PageNotice tone="info" icon={checkmarkDoneOutline} actionLabel={t("Fermer")} onAction={() => setInfo(null)}>
              {info}
            </PageNotice>
          )}
          {erreur && <PageNotice actionLabel={t("Réessayer")} onAction={() => { setChargement(true); charger(); }}>{erreur}</PageNotice>}

          <div className="rc-achat__barre">
            <div className="rc-achat__filtres">
              <Field label={t("Du")} hideLabel prefix={<span className="rc-bl__prefixe">{t("Du")}</span>} type="date" value={du} max={au || undefined} onChange={setDu} />
              <Field label={t("Au")} hideLabel prefix={<span className="rc-bl__prefixe">{t("Au")}</span>} type="date" value={au} min={du || undefined} onChange={setAu} />
              <SearchField value={recherche} onChange={setRecherche} placeholder={L.recherche} label={t("Rechercher par numéro")} />
              {!entree && (
                <FilterChip
                  label={fournisseur ? nomFournisseur(fournisseur, null, false) : t("Tous les fournisseurs")}
                  active={Boolean(fournisseur)}
                  ariaLabel={t("Filtrer par fournisseur")}
                  onOpen={() => setPickerFournisseur(true)}
                />
              )}
            </div>
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
          </div>

          <div className="rc-achat__kpis">
            <div>
              <span className="rc-achat__etiquette">{L.total}</span>
              <Money value={totaux.ttc} size="lg" />
              <small>{tn(affiches.length, "{n} document", "{n} documents")}</small>
            </div>
            <div>
              <span className="rc-achat__etiquette">{t("Payé")}</span>
              <Money value={totaux.paye} size="lg" />
            </div>
            <div>
              <span className="rc-achat__etiquette">{t("Reste à payer")}</span>
              <Money value={totaux.reste} size="lg" tone={totaux.reste > 0 ? "warning" : "default"} />
            </div>
          </div>

          {bl && choisis.size > 0 && (
            <div className="rc-factures__selection" role="toolbar" aria-label={t("BL sélectionnés")}>
              <strong>{tn(choisis.size, "{n} BL sélectionné", "{n} BL sélectionnés")}</strong>
              <div className="rc-factures__boutons">
                {fournisseursSelection.size > 1 && <span className="rc-footnote">{t("Choisissez des BL d'un seul fournisseur.")}</span>}
                <Button
                  icon={swapHorizontalOutline}
                  disabled={!transformable}
                  onClick={() => {
                    setNumeroFacture("");
                    setDateFacture(aujourdhui);
                    setErreurTransformation(null);
                    setTransformation(true);
                  }}
                >
                  {t("Transformer en facture")}
                </Button>
                <Button variant="ghost" onClick={() => setChoisis(new Set())}>
                  {t("Désélectionner")}
                </Button>
              </div>
            </div>
          )}

          {!chargement && affiches.length === 0 ? (
            <EmptyState
              icon={documentTextOutline}
              title={L.vide}
              message={t("Les documents saisis apparaîtront ici.")}
            />
          ) : (
            <div ref={zone} className="rc-transfo__zone">
              <TableauDonnees
                label={L.tableau}
                lignes={affiches}
                colonnes={colonnes}
                cle={(a) => a.id}
                chevron={false}
                selectionnee={(a) => choisis.has(a.id)}
                attenuee={(a) => a.statut === "FACTURE"}
                onOuvrir={(a, e) => (bl && (e.ctrlKey || e.metaKey || e.shiftKey) && !a.factureId ? basculer(a.id) : setOuvert(a.id))}
                triInitial={{ colonne: "date", inverse: true }}
                pied={
                  <span className="rc-transfo__pied">
                    <strong>{tn(affiches.length, "{n} document", "{n} documents")}</strong>
                    <span>
                      {t("Total")} <Money value={totaux.ttc} size="md" />
                    </span>
                  </span>
                }
              />
            </div>
          )}
        </div>

        <PickerSheet
          isOpen={pickerFournisseur}
          title={t("Fournisseur")}
          value={fournisseurId ?? TOUS}
          onDismiss={() => setPickerFournisseur(false)}
          onSelect={(v) => {
            setFournisseurId(v === TOUS ? undefined : v);
            setPickerFournisseur(false);
          }}
          options={[{ value: TOUS, label: t("Tous les fournisseurs") }, ...fournisseurs.map((f) => ({ value: f.id, label: nomFournisseur(f), keywords: String(f.ref) }))]}
        />

        <AchatFormSheet
          isOpen={creation}
          type={type}
          onDismiss={() => setCreation(false)}
          onCree={(achat) => {
            charger();
            setARegler({ achat, apresCreation: true });
          }}
        />

        <ReglementSheet
          isOpen={aRegler !== null}
          achat={aRegler?.achat}
          apresCreation={aRegler?.apresCreation}
          onDismiss={() => setARegler(null)}
          onTermine={(enregistre) => {
            if (enregistre) setInfo(t("Règlement enregistré."));
            charger();
            if (ouvert) {
              // Rouvre le détail pour qu'il affiche le nouveau règlement.
              const id = ouvert;
              setOuvert(null);
              setTimeout(() => setOuvert(id), 0);
            }
          }}
        />

        <AchatDetailSheet achatId={ouvert} onDismiss={() => setOuvert(null)} onChange={charger} onRegler={(achat) => setARegler({ achat, apresCreation: false })} />

        <Sheet
          isOpen={transformation}
          title={t("Transformer en facture fournisseur")}
          height="auto"
          onDismiss={() => setTransformation(false)}
          footer={
            <div className="rc-achat__pied">
              <Button size="lg" icon={swapHorizontalOutline} loading={enTransformation} disabled={!dateFacture || !numeroFacture.trim()} onClick={transformer}>
                {t("Créer la facture")}
              </Button>
            </div>
          }
        >
          <div className="rc-achat__form">
            {erreurTransformation && <PageNotice>{erreurTransformation}</PageNotice>}
            <div className="rc-achat__resume">
              <span>{tn(selection.length, "{n} BL", "{n} BL")} · {selection[0]?.fournisseur.nom}</span>
              <span>{selection.map((a) => a.numero).join(", ")}</span>
              <span>
                {t("Total TTC")} <Money value={selection.reduce((s, a) => s + Number(a.montantTTC), 0)} size="sm" /> · {t("Timbre")} <Money value={1} size="sm" />
              </span>
              <strong>
                {t("Net à payer")} <Money value={selection.reduce((s, a) => s + Number(a.montantTTC), 0) + 1} size="md" />
              </strong>
            </div>
            <div className="rc-achat__ligne2">
              <Field label={t("N° de facture (papier du fournisseur)")} value={numeroFacture} onChange={setNumeroFacture} required />
              <Field label={t("Date de la facture")} type="date" value={dateFacture} max={aujourdhui} onChange={(v) => setDateFacture(v || aujourdhui)} required />
            </div>
            <p className="rc-footnote">{t("Les règlements déjà faits sur ces BL passent sur la facture. Les BL ne seront plus modifiables.")}</p>
          </div>
        </Sheet>
      </IonContent>
    </IonPage>
  );
}
