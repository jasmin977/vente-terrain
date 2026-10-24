import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { IonContent, IonPage, useIonViewWillEnter } from "@ionic/react";
import { addOutline, checkmarkDoneOutline, imageOutline, settingsOutline, walletOutline } from "ionicons/icons";
import { IonIcon } from "@ionic/react";
import { ApiError } from "../api/client";
import { listCategoriesDepense, listDepenses } from "../api/depenses";
import { listFournisseurs } from "../api/achats";
import { listUsers } from "../api/auth";
import type { CategorieDepense, Depense } from "../types/depense";
import type { Fournisseur } from "../types/achat";
import type { UserSummary } from "../types/auth";
import type { ModePaiement } from "../types/facture";
import { useAuth } from "../auth/AuthContext";
import DepenseFormSheet from "../components/depenses/DepenseFormSheet";
import CategoriesDepenseSheet from "../components/depenses/CategoriesDepenseSheet";
import { nomFournisseur } from "../components/achats/nomFournisseur";
import { AccountButton, AppHeader, BarRanking, Button, EmptyState, Fab, Field, FilterChip, Money, PageNotice, PickerSheet, TableauDonnees, useHauteurRestante } from "../ui";
import type { BarRankingItem, ColonneDonnees } from "../ui";
import { modePaiementLabel } from "../utils/labels";
import { formatDate, toLocalDateString } from "../utils/format";
import { t, tn } from "../i18n";

const TOUS = "__tous__";
const MODES: ModePaiement[] = ["ESPECES", "CHEQUE", "VIREMENT", "TRAITE"];
const premierDuMois = () => {
  const d = new Date();
  return toLocalDateString(new Date(d.getFullYear(), d.getMonth(), 1));
};

/** Dépenses › Liste des dépenses : filtres, total de la période, répartition par catégorie, puis le tableau. */
export default function Depenses() {
  const { user } = useAuth();
  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [categories, setCategories] = useState<CategorieDepense[]>([]);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [vendeurs, setVendeurs] = useState<UserSummary[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [du, setDu] = useState(premierDuMois());
  const [au, setAu] = useState("");
  const [categorieId, setCategorieId] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<ModePaiement | undefined>(undefined);
  const [vendeurId, setVendeurId] = useState<string | undefined>(undefined);
  const [picker, setPicker] = useState<"categorie" | "mode" | "vendeur" | null>(null);

  const [fiche, setFiche] = useState<{ depense: Depense | null } | null>(null);
  const [gestionCategories, setGestionCategories] = useState(false);
  const zone = useRef<HTMLDivElement>(null);
  useHauteurRestante(zone);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      setDepenses(await listDepenses({ dateFrom: du || undefined, dateTo: au || undefined, categorieId, mode, vendeurId }));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible de charger les dépenses"));
    } finally {
      setChargement(false);
    }
  }, [du, au, categorieId, mode, vendeurId]);

  const chargerCategories = () => listCategoriesDepense().then(setCategories).catch(() => undefined);

  useEffect(() => {
    setChargement(true);
    charger();
  }, [charger]);
  useEffect(() => {
    chargerCategories();
    listFournisseurs().then(setFournisseurs).catch(() => undefined);
    listUsers()
      .then((l) => setVendeurs(l.filter((u) => u.role === "VENDEUR")))
      .catch(() => undefined);
  }, []);
  useIonViewWillEnter(() => {
    charger();
  }, [charger]);

  const total = useMemo(() => depenses.reduce((s, d) => s + Number(d.montant), 0), [depenses]);
  const parCategorie: BarRankingItem[] = useMemo(() => {
    const m = new Map<string, { label: string; value: number; nb: number }>();
    for (const d of depenses) {
      const c = m.get(d.categorieId) ?? { label: d.categorie.nom, value: 0, nb: 0 };
      c.value += Number(d.montant);
      c.nb += 1;
      m.set(d.categorieId, c);
    }
    return [...m.entries()]
      .sort((a, b) => b[1].value - a[1].value)
      .map(([id, c]) => ({
        id,
        label: c.label,
        value: c.value,
        display: <Money value={c.value} size="sm" />,
        sub: `${tn(c.nb, "{n} dépense", "{n} dépenses")} · ${total > 0 ? Math.round((c.value / total) * 100) : 0} %`,
      }));
  }, [depenses, total]);

  const categorie = categories.find((c) => c.id === categorieId);
  const vendeur = vendeurs.find((v) => v.id === vendeurId);
  const payeA = (d: Depense) => (d.fournisseur ? nomFournisseur(d.fournisseur, null, false) : d.beneficiaire || "—");

  const colonnes: ColonneDonnees<Depense>[] = [
    { id: "date", titre: t("Date"), rendu: (d) => formatDate(d.date), tri: (d) => new Date(d.date).getTime(), largeur: "110px" },
    { id: "categorie", titre: t("Catégorie"), rendu: (d) => d.categorie.nom, tri: (d) => d.categorie.nom, largeur: "180px" },
    {
      id: "description",
      titre: t("Description"),
      principale: true,
      rendu: (d) => (
        <span className="rc-achat__solde">
          {d.description}
          {d.photo && <IonIcon icon={imageOutline} aria-label={t("Reçu joint")} />}
        </span>
      ),
      tri: (d) => d.description,
      souple: true,
    },
    { id: "beneficiaire", titre: t("Payé à"), rendu: payeA, tri: payeA, largeur: "170px" },
    { id: "camion", titre: t("Camion"), rendu: (d) => d.vendeur?.nom ?? "—", tri: (d) => d.vendeur?.nom ?? "", largeur: "130px" },
    { id: "mode", titre: t("Mode"), rendu: (d) => (d.reference ? `${modePaiementLabel[d.mode]} · ${d.reference}` : modePaiementLabel[d.mode]), tri: (d) => d.mode, largeur: "170px" },
    { id: "montant", titre: t("Montant"), rendu: (d) => <Money value={Number(d.montant)} />, tri: (d) => Number(d.montant), aligne: "end", largeur: "130px" },
  ];

  if (user && user.role !== "ADMIN") return <Navigate to="/factures" replace />;

  return (
    <IonPage className="rc-page--large">
      <AppHeader large eyebrow={t("Dépenses")} title={t("Liste des dépenses")} actions={<AccountButton />} />
      <IonContent>
        <Fab icon={addOutline} label={t("Nouvelle dépense")} onClick={() => setFiche({ depense: null })} />
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
              <FilterChip label={categorie ? categorie.nom : t("Toutes les catégories")} active={Boolean(categorie)} ariaLabel={t("Filtrer par catégorie")} onOpen={() => setPicker("categorie")} />
              <FilterChip label={mode ? modePaiementLabel[mode] : t("Tous les modes")} active={Boolean(mode)} ariaLabel={t("Filtrer par mode de paiement")} onOpen={() => setPicker("mode")} />
              <FilterChip label={vendeur ? vendeur.nom : t("Tous les camions")} active={Boolean(vendeur)} ariaLabel={t("Filtrer par camion")} onOpen={() => setPicker("vendeur")} />
            </div>
            <Button variant="ghost" icon={settingsOutline} onClick={() => setGestionCategories(true)}>
              {t("Catégories")}
            </Button>
          </div>

          <div className="rc-depense__haut">
            <div className="rc-achat__kpis rc-depense__total">
              <div>
                <span className="rc-achat__etiquette">{t("Total des dépenses")}</span>
                <Money value={total} size="xl" />
                <small>{tn(depenses.length, "{n} dépense", "{n} dépenses")}</small>
              </div>
            </div>
            {parCategorie.length > 0 && (
              <section className="rc-dash-card rc-depense__repartition" aria-label={t("Par catégorie")}>
                <header className="rc-dash-card__tete">
                  <h3 className="rc-dash-card__titre">{t("Par catégorie")}</h3>
                </header>
                <BarRanking label={t("Dépenses par catégorie")} items={parCategorie} tone="accent" />
              </section>
            )}
          </div>

          {!chargement && depenses.length === 0 ? (
            <EmptyState icon={walletOutline} title={t("Aucune dépense sur cette période.")} message={t("Ajoutez-en avec « Nouvelle dépense ».")} />
          ) : (
            <div ref={zone} className="rc-transfo__zone">
              <TableauDonnees
                label={t("Dépenses")}
                lignes={depenses}
                colonnes={colonnes}
                cle={(d) => d.id}
                chevron={false}
                onOuvrir={(d) => setFiche({ depense: d })}
                triInitial={{ colonne: "date", inverse: true }}
                pied={
                  <span className="rc-transfo__pied">
                    <strong>{tn(depenses.length, "{n} dépense", "{n} dépenses")}</strong>
                    <span>
                      {t("Total")} <Money value={total} size="md" />
                    </span>
                  </span>
                }
              />
            </div>
          )}
        </div>

        <DepenseFormSheet
          isOpen={fiche !== null}
          depense={fiche?.depense}
          categories={categories}
          fournisseurs={fournisseurs}
          vendeurs={vendeurs}
          onDismiss={() => setFiche(null)}
          onEnregistre={(message) => {
            setInfo(message);
            charger();
          }}
          onGererCategories={() => setGestionCategories(true)}
        />
        <CategoriesDepenseSheet isOpen={gestionCategories} onDismiss={() => setGestionCategories(false)} onChange={chargerCategories} />

        <PickerSheet
          isOpen={picker === "categorie"}
          title={t("Catégorie")}
          value={categorieId ?? TOUS}
          onDismiss={() => setPicker(null)}
          onSelect={(v) => {
            setCategorieId(v === TOUS ? undefined : v);
            setPicker(null);
          }}
          options={[{ value: TOUS, label: t("Toutes les catégories") }, ...categories.map((c) => ({ value: c.id, label: c.nom }))]}
        />
        <PickerSheet
          isOpen={picker === "mode"}
          title={t("Mode de paiement")}
          value={mode ?? TOUS}
          onDismiss={() => setPicker(null)}
          onSelect={(v) => {
            setMode(v === TOUS ? undefined : (v as ModePaiement));
            setPicker(null);
          }}
          options={[{ value: TOUS, label: t("Tous les modes") }, ...MODES.map((m) => ({ value: m, label: modePaiementLabel[m] }))]}
        />
        <PickerSheet
          isOpen={picker === "vendeur"}
          title={t("Camion / vendeur")}
          value={vendeurId ?? TOUS}
          onDismiss={() => setPicker(null)}
          onSelect={(v) => {
            setVendeurId(v === TOUS ? undefined : v);
            setPicker(null);
          }}
          options={[{ value: TOUS, label: t("Tous les camions") }, ...vendeurs.map((v) => ({ value: v.id, label: v.nom, meta: v.code, keywords: v.code }))]}
        />
      </IonContent>
    </IonPage>
  );
}
