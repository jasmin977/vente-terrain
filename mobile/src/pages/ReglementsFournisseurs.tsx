import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { IonAlert, IonContent, IonPage, useIonViewWillEnter } from "@ionic/react";
import { addOutline, cashOutline, checkmarkDoneOutline, printOutline, swapHorizontalOutline, walletOutline } from "ionicons/icons";
import { ApiError } from "../api/client";
import { deleteReglementFournisseur, listFournisseurs, listImpayesFournisseurs, listReglementsFournisseurs } from "../api/achats";
import type { DocumentImpaye, Fournisseur, ImpayesFournisseur, ReglementFournisseur, TypeAchat } from "../types/achat";
import type { ModePaiement } from "../types/facture";
import { useAuth } from "../auth/AuthContext";
import ReglementSheet from "../components/achats/ReglementSheet";
import ImputerAvanceSheet from "../components/achats/ImputerAvanceSheet";
import ImpressionEffetSheet from "../components/effets/ImpressionEffetSheet";
import type { ValeursEffet } from "../types/effet";
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
} from "../ui";
import type { ColonneDonnees } from "../ui";
import { modePaiementLabel } from "../utils/labels";
import { formatDate, toLocalDateString } from "../utils/format";
import { t, tn } from "../i18n";

type FiltreType = "tous" | TypeAchat;
const TOUS = "__tous__";
const MODES: ModePaiement[] = ["ESPECES", "CHEQUE", "VIREMENT", "TRAITE"];

const premierDuMois = () => {
  const d = new Date();
  return toLocalDateString(new Date(d.getFullYear(), d.getMonth(), 1));
};

/**
 * Fournisseurs › Règlements : en haut ce qu'on doit encore (par fournisseur, document par document),
 * en bas les règlements faits, avec leurs filtres.
 */
export default function ReglementsFournisseurs() {
  const { user } = useAuth();
  const [info, setInfo] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);

  // Reste à payer
  const [impayes, setImpayes] = useState<ImpayesFournisseur[]>([]);
  const [filtreType, setFiltreType] = useState<FiltreType>("tous");
  const [rechercheImpayes, setRechercheImpayes] = useState("");
  const [ouvert, setOuvert] = useState<ImpayesFournisseur | null>(null);
  const [imputer, setImputer] = useState(false);

  // Règlements faits
  const [reglements, setReglements] = useState<ReglementFournisseur[]>([]);
  // Chèque / traite à (ré)imprimer depuis la liste.
  const [aImprimer, setAImprimer] = useState<ReglementFournisseur | null>(null);
  const [du, setDu] = useState(premierDuMois());
  const [au, setAu] = useState("");
  const [fournisseurId, setFournisseurId] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<ModePaiement | undefined>(undefined);
  const [pickerFournisseur, setPickerFournisseur] = useState(false);
  const [pickerMode, setPickerMode] = useState(false);
  const [aSupprimer, setASupprimer] = useState<ReglementFournisseur | null>(null);

  // Saisie d'un règlement : sur un document précis, ou libre (fournisseur + document au choix).
  const [saisie, setSaisie] = useState<{ document?: DocumentImpaye; fournisseur?: ImpayesFournisseur["fournisseur"] } | null>(null);

  const chargerImpayes = useCallback(async () => {
    try {
      setImpayes(await listImpayesFournisseurs(filtreType === "tous" ? undefined : filtreType));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible de charger les impayés"));
    }
  }, [filtreType]);

  const chargerReglements = useCallback(async () => {
    try {
      setReglements(await listReglementsFournisseurs({ fournisseurId, mode, dateFrom: du || undefined, dateTo: au || undefined }));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible de charger les règlements"));
    }
  }, [fournisseurId, mode, du, au]);

  useEffect(() => {
    chargerImpayes();
  }, [chargerImpayes]);
  useEffect(() => {
    chargerReglements();
  }, [chargerReglements]);
  useEffect(() => {
    listFournisseurs().then(setFournisseurs).catch(() => undefined);
  }, []);
  useIonViewWillEnter(() => {
    chargerImpayes();
    chargerReglements();
  }, [chargerImpayes, chargerReglements]);

  // La fenêtre d'un fournisseur suit les chiffres rechargés (après un règlement ou une imputation).
  useEffect(() => {
    setOuvert((o) => (o ? impayes.find((g) => g.fournisseur.id === o.fournisseur.id) ?? null : null));
  }, [impayes]);

  const toutRecharger = async () => {
    await Promise.all([chargerImpayes(), chargerReglements()]);
  };

  // Le détail ouvert suit les données rechargées (un document réglé disparaît de la liste).
  useEffect(() => {
    if (!ouvert) return;
    const maj = impayes.find((g) => g.fournisseur.id === ouvert.fournisseur.id) ?? null;
    if (maj !== ouvert) setOuvert(maj);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [impayes]);

  const impayesAffiches = useMemo(() => {
    const q = rechercheImpayes.trim().toLowerCase();
    return q ? impayes.filter((g) => String(g.fournisseur.ref) === q || g.fournisseur.nom.toLowerCase().includes(q)) : impayes;
  }, [impayes, rechercheImpayes]);

  const totalDu = impayesAffiches.reduce((s, g) => s + g.totalDu, 0);
  const totalRegle = reglements.reduce((s, r) => s + Number(r.montant), 0);
  const fournisseur = fournisseurs.find((f) => f.id === fournisseurId);

  const supprimer = async (r: ReglementFournisseur) => {
    setErreur(null);
    try {
      await deleteReglementFournisseur(r.id);
      setInfo(t("Règlement supprimé : le montant redevient à payer."));
      await toutRecharger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible de supprimer le règlement"));
    }
  };

  const colonnesImpayes: ColonneDonnees<ImpayesFournisseur>[] = [
    { id: "ref", titre: t("N°"), rendu: (g) => (g.fournisseur.divers ? "—" : g.fournisseur.ref), tri: (g) => g.fournisseur.ref, largeur: "70px" },
    { id: "nom", titre: t("Fournisseur"), principale: true, rendu: (g) => nomFournisseur(g.fournisseur, null, false), tri: (g) => g.fournisseur.nom, souple: true },
    { id: "nb", titre: t("Documents"), rendu: (g) => tn(g.documents.length, "{n} impayé", "{n} impayés"), tri: (g) => g.documents.length, largeur: "130px" },
    { id: "ancien", titre: t("Plus ancien"), rendu: (g) => formatDate(g.plusAncien), tri: (g) => new Date(g.plusAncien).getTime(), largeur: "130px" },
    { id: "avances", titre: t("Avances"), rendu: (g) => (g.avances > 0 ? <Money value={g.avances} /> : "—"), tri: (g) => g.avances, aligne: "end", largeur: "130px" },
    { id: "du", titre: t("Reste à payer"), rendu: (g) => <Money value={g.totalDu} tone="warning" />, tri: (g) => g.totalDu, aligne: "end", largeur: "150px" },
  ];

  const colonnesDocuments: ColonneDonnees<DocumentImpaye>[] = [
    { id: "type", titre: t("Type"), rendu: (d) => (d.type === "BL" ? t("BL") : t("Facture")), tri: (d) => d.type, largeur: "72px" },
    { id: "numero", titre: t("N°"), principale: true, rendu: (d) => (d.fournisseurLibre ? `${d.numero} · ${d.fournisseurLibre}` : d.numero), tri: (d) => d.numero },
    { id: "date", titre: t("Date"), rendu: (d) => formatDate(d.date), tri: (d) => new Date(d.date).getTime(), largeur: "100px" },
    { id: "ttc", titre: t("Net à payer"), rendu: (d) => <Money value={Number(d.montantTTC) + Number(d.timbre ?? 0)} />, aligne: "end", largeur: "118px" },
    { id: "paye", titre: t("Payé"), rendu: (d) => <Money value={d.paye} />, aligne: "end", largeur: "108px" },
    { id: "reste", titre: t("Reste"), rendu: (d) => <Money value={d.reste} tone="warning" />, tri: (d) => d.reste, aligne: "end", largeur: "118px" },
    { id: "statut", titre: "", rendu: (d) => <StatutPaiementTag statut={d.statut} />, largeur: "100px" },
    {
      id: "regler",
      titre: "",
      rendu: (d) => (
        <Button
          variant="secondary"
          icon={cashOutline}
          onClick={(e) => {
            e.stopPropagation();
            setSaisie({ document: d, fournisseur: ouvert?.fournisseur });
          }}
        >
          {t("Régler")}
        </Button>
      ),
      largeur: "104px",
    },
  ];

  const colonnesReglements: ColonneDonnees<ReglementFournisseur>[] = [
    { id: "date", titre: t("Date"), rendu: (r) => formatDate(r.date), tri: (r) => new Date(r.date).getTime(), largeur: "110px" },
    { id: "fournisseur", titre: t("Fournisseur"), principale: true, rendu: (r) => nomFournisseur(r.fournisseur, r.achat?.fournisseurLibre, false), tri: (r) => r.fournisseur?.nom ?? "", souple: true },
    {
      id: "document",
      titre: t("Document"),
      rendu: (r) => (r.achat ? `${r.achat.type === "BL" ? "BL" : r.achat.type === "ENTREE" ? t("B° Entrée") : t("Facture")} ${r.achat.numero}` : t("Avance sur compte")),
      tri: (r) => r.achat?.numero ?? "",
      largeur: "170px",
    },
    { id: "mode", titre: t("Mode"), rendu: (r) => modePaiementLabel[r.mode], tri: (r) => r.mode, largeur: "110px" },
    { id: "ref", titre: t("N° chèque / traite / réf."), rendu: (r) => r.reference || "—", tri: (r) => r.reference ?? "", largeur: "170px" },
    {
      id: "echeance",
      titre: t("Échéance"),
      rendu: (r) => (r.echeance ? formatDate(r.echeance) : "—"),
      tri: (r) => (r.echeance ? new Date(r.echeance).getTime() : 0),
      largeur: "110px",
    },
    { id: "montant", titre: t("Montant"), rendu: (r) => <Money value={Number(r.montant)} />, tri: (r) => Number(r.montant), aligne: "end", largeur: "140px" },
    {
      id: "impression",
      titre: "",
      rendu: (r) =>
        r.mode === "CHEQUE" || r.mode === "TRAITE" ? (
          <Button
            variant={r.imprimeLe ? "ghost" : "secondary"}
            icon={printOutline}
            onClick={(e) => {
              e.stopPropagation();
              setAImprimer(r);
            }}
          >
            {r.imprimeLe ? t("Réimprimer") : t("Imprimer")}
          </Button>
        ) : null,
      largeur: "150px",
    },
  ];

  if (user && user.role !== "ADMIN") return <Navigate to="/factures" replace />;

  // Document à régler, au format attendu par la fenêtre de règlement.
  const documentARegler = saisie?.document && saisie.fournisseur
    ? {
        id: saisie.document.id,
        type: saisie.document.type,
        numero: saisie.document.numero,
        date: saisie.document.date,
        montantTTC: saisie.document.montantTTC,
        reste: saisie.document.reste,
        fournisseurId: saisie.fournisseur.id,
        fournisseur: saisie.fournisseur,
      }
    : null;

  return (
    <IonPage className="rc-page--large">
      <AppHeader large eyebrow={t("Fournisseurs")} title={t("Règlements fournisseurs")} actions={<AccountButton />} />
      <IonContent>
        <Fab icon={addOutline} label={t("Nouveau règlement")} onClick={() => setSaisie({})} />
        <div className="rc-transfo">
          {info && (
            <PageNotice tone="info" icon={checkmarkDoneOutline} actionLabel={t("Fermer")} onAction={() => setInfo(null)}>
              {info}
            </PageNotice>
          )}
          {erreur && <PageNotice actionLabel={t("Fermer")} onAction={() => setErreur(null)}>{erreur}</PageNotice>}

          {/* ---- Reste à payer ---- */}
          <section className="rc-achat__section" aria-label={t("Reste à payer")}>
            <div className="rc-achat__titre-section">
              <h2 className="rc-transfo__titre">{t("Reste à payer")}</h2>
              <span className="rc-achat__total-section">
                <Money value={totalDu} size="lg" tone={totalDu > 0 ? "warning" : "default"} />
                <small>{tn(impayesAffiches.length, "{n} fournisseur", "{n} fournisseurs")}</small>
              </span>
            </div>
            <div className="rc-achat__barre">
              <div className="rc-achat__filtres">
                <SearchField value={rechercheImpayes} onChange={setRechercheImpayes} placeholder={t("N° ou nom du fournisseur…")} label={t("Rechercher un fournisseur")} />
              </div>
              <Segmented
                label={t("Documents")}
                value={filtreType}
                onChange={setFiltreType}
                options={[
                  { value: "tous", label: t("Tous") },
                  { value: "BL", label: t("BL") },
                  { value: "FACTURE", label: t("Factures") },
                ]}
              />
            </div>
            {impayesAffiches.length === 0 ? (
              <EmptyState icon={walletOutline} title={t("Rien à payer.")} message={t("Tous les documents des fournisseurs sont réglés.")} />
            ) : (
              <div className="rc-achat__table">
                <TableauDonnees
                  label={t("Fournisseurs à payer")}
                  lignes={impayesAffiches}
                  colonnes={colonnesImpayes}
                  cle={(g) => g.fournisseur.id}
                  onOuvrir={(g) => setOuvert(g)}
                  triInitial={{ colonne: "du", inverse: true }}
                  pied={
                    <span className="rc-transfo__pied">
                      <strong>{tn(impayesAffiches.reduce((s, g) => s + g.documents.length, 0), "{n} document impayé", "{n} documents impayés")}</strong>
                      <span>
                        {t("Total")} <Money value={totalDu} size="md" />
                      </span>
                    </span>
                  }
                />
              </div>
            )}
          </section>

          {/* ---- Règlements faits ---- */}
          <section className="rc-achat__section" aria-label={t("Règlements effectués")}>
            <div className="rc-achat__titre-section">
              <h2 className="rc-transfo__titre">{t("Règlements effectués")}</h2>
              <span className="rc-achat__total-section">
                <Money value={totalRegle} size="lg" />
                <small>{tn(reglements.length, "{n} règlement", "{n} règlements")}</small>
              </span>
            </div>
            <div className="rc-achat__barre">
              <div className="rc-achat__filtres">
                <Field label={t("Du")} hideLabel prefix={<span className="rc-bl__prefixe">{t("Du")}</span>} type="date" value={du} max={au || undefined} onChange={setDu} />
                <Field label={t("Au")} hideLabel prefix={<span className="rc-bl__prefixe">{t("Au")}</span>} type="date" value={au} min={du || undefined} onChange={setAu} />
                <FilterChip
                  label={fournisseur ? nomFournisseur(fournisseur, null, false) : t("Tous les fournisseurs")}
                  active={Boolean(fournisseur)}
                  ariaLabel={t("Filtrer par fournisseur")}
                  onOpen={() => setPickerFournisseur(true)}
                />
                <FilterChip
                  label={mode ? modePaiementLabel[mode] : t("Tous les modes")}
                  active={Boolean(mode)}
                  ariaLabel={t("Filtrer par mode de paiement")}
                  onOpen={() => setPickerMode(true)}
                />
              </div>
            </div>
            {reglements.length === 0 ? (
              <EmptyState icon={cashOutline} title={t("Aucun règlement sur cette période.")} />
            ) : (
              <div className="rc-achat__table">
                <TableauDonnees
                  label={t("Règlements effectués")}
                  lignes={reglements}
                  colonnes={colonnesReglements}
                  cle={(r) => r.id}
                  chevron={false}
                  onOuvrir={(r) => setASupprimer(r)}
                  triInitial={{ colonne: "date", inverse: true }}
                  pied={
                    <span className="rc-transfo__pied">
                      <strong>{tn(reglements.length, "{n} règlement", "{n} règlements")}</strong>
                      <span>
                        {t("Total")} <Money value={totalRegle} size="md" />
                      </span>
                    </span>
                  }
                />
              </div>
            )}
          </section>
        </div>

        {/* Documents impayés d'un fournisseur */}
        <Sheet isOpen={ouvert !== null} title={ouvert ? nomFournisseur(ouvert.fournisseur) : ""} large onDismiss={() => setOuvert(null)}>
          {ouvert && (
            <div className="rc-achat__form">
              <div className="rc-achat__entete">
                <div>
                  <span className="rc-achat__etiquette">{t("Reste à payer")}</span>
                  <Money value={ouvert.totalDu} size="lg" tone="warning" />
                </div>
                <div>
                  <span className="rc-achat__etiquette">{t("Avances sans document")}</span>
                  <Money value={ouvert.avances} size="lg" />
                </div>
                <div>
                  <span className="rc-achat__etiquette">{t("Solde")}</span>
                  <Money value={ouvert.solde} size="lg" />
                </div>
              </div>
              {ouvert.avances > 0 && (
                <div className="rc-avance">
                  <span>
                    <strong>
                      <Money value={ouvert.avances} size="md" />
                    </strong>{" "}
                    {t("d'avance non imputée : déjà versés, pas encore rattachés à un document.")}
                  </span>
                  <Button icon={swapHorizontalOutline} onClick={() => setImputer(true)}>
                    {t("Imputer l'avance")}
                  </Button>
                </div>
              )}
              <div className="rc-impayes">
              <TableauDonnees
                label={t("Documents impayés")}
                lignes={ouvert.documents}
                colonnes={colonnesDocuments}
                cle={(d) => d.id}
                chevron={false}
                triInitial={{ colonne: "date" }}
              />
              </div>
            </div>
          )}
        </Sheet>

        {ouvert && (
          <ImputerAvanceSheet
            isOpen={imputer}
            onDismiss={() => setImputer(false)}
            fournisseurId={ouvert.fournisseur.id}
            avance={ouvert.avances}
            documents={ouvert.documents}
            onImpute={(m) => {
              setInfo(t("Avance imputée : {m} TND.", { m: m.toFixed(3) }));
              void toutRecharger();
            }}
          />
        )}

        <ReglementSheet
          isOpen={saisie !== null}
          achat={documentARegler}
          fournisseurId={saisie?.fournisseur?.id}
          onDismiss={() => setSaisie(null)}
          onTermine={(enregistre) => {
            if (enregistre) setInfo(t("Règlement enregistré."));
            toutRecharger();
          }}
        />

        <ImpressionEffetSheet
          isOpen={aImprimer !== null}
          type={aImprimer?.mode === "TRAITE" ? "TRAITE" : "CHEQUE"}
          reglementId={aImprimer?.id}
          compteBancaireId={aImprimer?.compteBancaireId}
          initial={aImprimer ? valeursReimpression(aImprimer) : undefined}
          onDismiss={() => setAImprimer(null)}
          onTermine={(imprime) => {
            if (imprime) toutRecharger();
          }}
        />

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
        <PickerSheet
          isOpen={pickerMode}
          title={t("Mode de paiement")}
          value={mode ?? TOUS}
          onDismiss={() => setPickerMode(false)}
          onSelect={(v) => {
            setMode(v === TOUS ? undefined : (v as ModePaiement));
            setPickerMode(false);
          }}
          options={[{ value: TOUS, label: t("Tous les modes") }, ...MODES.map((m) => ({ value: m, label: modePaiementLabel[m] }))]}
        />
        <IonAlert
          isOpen={aSupprimer !== null}
          onDidDismiss={() => setASupprimer(null)}
          header={t("Supprimer ce règlement ?")}
          message={aSupprimer ? `${aSupprimer.fournisseur?.nom ?? ""} · ${Number(aSupprimer.montant).toFixed(3)} TND · ${formatDate(aSupprimer.date)}` : undefined}
          buttons={[
            { text: t("Non"), role: "cancel" },
            {
              text: t("Supprimer"),
              role: "destructive",
              handler: () => {
                if (aSupprimer) void supprimer(aSupprimer);
              },
            },
          ]}
        />
      </IonContent>
    </IonPage>
  );
}

/** Réimpression : les valeurs déjà imprimées (lieu, date, payeur…), sinon celles du règlement. */
function valeursReimpression(r: ReglementFournisseur): Partial<ValeursEffet> {
  const imp = r.impression ?? {};
  const texte = (...cles: string[]) => cles.map((c) => imp[c]).find((x): x is string => typeof x === "string" && x !== "") ?? "";
  const iso = (fr: string) => (/^\d{2}\/\d{2}\/\d{4}$/.test(fr) ? fr.split("/").reverse().join("-") : "");
  return {
    numero: r.reference ?? "",
    montant: Number(r.montant),
    ordre: texte("ordre1", "ordre") || (r.fournisseur?.divers ? r.achat?.fournisseurLibre ?? "" : r.fournisseur?.nom ?? ""),
    echeance: r.echeance ? toLocalDateString(new Date(r.echeance)) : "",
    ...(iso(texte("dateCreation1", "dateCreation")) ? { dateCreation: iso(texte("dateCreation1", "dateCreation")) } : {}),
    ...(texte("lieu1", "lieu") ? { lieu: texte("lieu1", "lieu") } : {}),
    ...(texte("payeur") ? { payeur: texte("payeur") } : {}),
  };
}
