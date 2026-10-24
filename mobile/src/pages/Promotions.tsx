import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { IonContent, IonIcon, IonPage, useIonViewWillEnter } from "@ionic/react";
import { addOutline, cubeOutline, giftOutline, pricetagsOutline } from "ionicons/icons";
import { ApiError } from "../api/client";
import { listPromotions } from "../api/promotions";
import type { Promotion, StatutPromotion, TypePromotion } from "../types/promotion";
import { useAuth } from "../auth/AuthContext";
import { AccountButton, AppHeader, EmptyState, Fab, FilterChip, PageNotice, PickerSheet, Segmented, Sheet, TableauDonnees, Tag } from "../ui";
import type { ColonneDonnees } from "../ui";
import { STATUTS_PROMO, libelleTypePromotion } from "../utils/promotions";
import { formatDate, parseLocalDate } from "../utils/format";
import { t, tn } from "../i18n";

type Filtre = "tous" | StatutPromotion;
const TOUS = "__tous__";


const date = (iso: string) => formatDate(parseLocalDate(iso));

/** Commercial › Promotions : prix promo et ventes en lot, en cours, à venir ou terminées. */
export default function Promotions() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [promos, setPromos] = useState<Promotion[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [type, setType] = useState<TypePromotion | undefined>(undefined);
  const [pickerType, setPickerType] = useState(false);
  const [nouvelle, setNouvelle] = useState(false);

  const charger = useCallback(async () => {
    try {
      setPromos(await listPromotions());
      setErreur(null);
    } catch (err) {
      setPromos([]);
      setErreur(err instanceof ApiError ? err.message : t("Impossible de charger les promotions"));
    }
  }, []);
  useEffect(() => {
    void charger();
  }, [charger]);
  useIonViewWillEnter(() => void charger(), [charger]);

  const compte = useMemo(() => {
    const c: Record<StatutPromotion, number> = { EN_COURS: 0, A_VENIR: 0, TERMINEE: 0 };
    for (const p of promos ?? []) c[p.statut]++;
    return c;
  }, [promos]);
  const lignes = (promos ?? []).filter((p) => (filtre === "tous" || p.statut === filtre) && (!type || p.type === type));

  if (user && user.role !== "ADMIN") return <Navigate to="/factures" replace />;

  const colonnes: ColonneDonnees<Promotion>[] = [
    { id: "numero", titre: t("N°"), rendu: (p) => <strong>{p.numero}</strong>, tri: (p) => p.numero, largeur: "130px" },
    { id: "type", titre: t("Type"), rendu: (p) => libelleTypePromotion(p), tri: (p) => libelleTypePromotion(p), largeur: "150px" },
    { id: "libelle", titre: t("Libellé"), principale: true, souple: true, rendu: (p) => p.libelle || "—", tri: (p) => p.libelle ?? "" },
    {
      id: "periode",
      titre: t("Période"),
      rendu: (p) => t("Du {a} au {b}", { a: date(p.dateDebut), b: date(p.dateFin) }),
      tri: (p) => p.dateDebut,
      largeur: "210px",
    },
    { id: "articles", titre: t("Articles"), rendu: (p) => p.lignes.length, tri: (p) => p.lignes.length, aligne: "end", largeur: "100px" },
    {
      id: "resultat",
      titre: t("Résultat"),
      rendu: (p) =>
        p.statut === "A_VENIR" || p.evolution === undefined ? (
          "—"
        ) : p.evolution === null ? (
          <span className="rc-res__neutre">{t("nouveau")}</span>
        ) : (
          <span className={p.evolution > 0 ? "rc-res__hausse" : p.evolution < 0 ? "rc-res__baisse" : "rc-res__neutre"}>
            {p.evolution > 0 ? "▲ +" : p.evolution < 0 ? "▼ " : ""}
            {p.evolution} %
          </span>
        ),
      tri: (p) => p.evolution ?? -Infinity,
      aligne: "end",
      largeur: "120px",
    },
    {
      id: "statut",
      titre: t("Statut"),
      rendu: (p) => (
        <Tag tone={STATUTS_PROMO[p.statut].ton} dot>
          {t(STATUTS_PROMO[p.statut].texte)}
        </Tag>
      ),
      tri: (p) => p.statut,
      largeur: "120px",
    },
  ];

  return (
    <IonPage className="rc-page--large">
      <AppHeader large eyebrow={t("Commercial")} title={t("Liste des promotions")} actions={<AccountButton />} />
      <IonContent>
        <Fab icon={addOutline} label={t("Nouvelle promotion")} onClick={() => setNouvelle(true)} />
        <div className="rc-transfo">
          {erreur && <PageNotice>{erreur}</PageNotice>}
          <div className="rc-achat__barre">
            <Segmented
              label={t("Statut")}
              value={filtre}
              onChange={setFiltre}
              options={[
                { value: "tous", label: t("Toutes"), hint: `${promos?.length ?? 0}` },
                { value: "EN_COURS", label: t("En cours"), hint: `${compte.EN_COURS}` },
                { value: "A_VENIR", label: t("À venir"), hint: `${compte.A_VENIR}` },
                { value: "TERMINEE", label: t("Terminées"), hint: `${compte.TERMINEE}` },
              ]}
            />
            <FilterChip
              label={type === "PRIX" ? t("Prix promo") : type === "LOT" ? t("Vente en lot") : t("Tous les types")}
              active={Boolean(type)}
              ariaLabel={t("Filtrer par type")}
              onOpen={() => setPickerType(true)}
            />
          </div>

          {promos && lignes.length === 0 ? (
            <EmptyState
              icon={pricetagsOutline}
              title={promos.length === 0 ? t("Aucune promotion.") : t("Aucune promotion pour ce filtre.")}
              message={t("Créez un prix promo ou une vente en lot : pendant sa période, elle s'applique d'elle-même sur les BL de vente.")}
            />
          ) : (
            <div className="rc-transfo__zone">
              <TableauDonnees
                label={t("Promotions")}
                lignes={lignes}
                colonnes={colonnes}
                cle={(p) => p.id}
                onOuvrir={(p) => navigate(`/promotions/${p.id}`)}
                triInitial={{ colonne: "periode", inverse: true }}
                pied={<strong>{tn(lignes.length, "{n} promotion", "{n} promotions")}</strong>}
              />
            </div>
          )}
        </div>

        <PickerSheet
          isOpen={pickerType}
          title={t("Type")}
          value={type ?? TOUS}
          onDismiss={() => setPickerType(false)}
          onSelect={(v) => {
            setType(v === TOUS ? undefined : (v as TypePromotion));
            setPickerType(false);
          }}
          options={[
            { value: TOUS, label: t("Tous les types") },
            { value: "PRIX", label: t("Prix promo") },
            { value: "LOT", label: t("Vente en lot") },
          ]}
        />

        <Sheet isOpen={nouvelle} title={t("Nouvelle promotion")} height="auto" onDismiss={() => setNouvelle(false)}>
          <div className="rc-promo-choix">
            <button
              type="button"
              className="rc-promo-choix__tuile"
              onClick={() => {
                setNouvelle(false);
                navigate("/promotions/nouvelle?type=PRIX");
              }}
            >
              <span className="rc-promo-choix__icone">
                <IonIcon icon={pricetagsOutline} />
              </span>
              <strong>{t("Promotion de prix")}</strong>
              <span>{t("Une période et une liste d'articles avec leur nouveau prix de vente, marge affichée.")}</span>
            </button>
            <button
              type="button"
              className="rc-promo-choix__tuile"
              onClick={() => {
                setNouvelle(false);
                navigate("/promotions/nouvelle?type=LOT");
              }}
            >
              <span className="rc-promo-choix__icone">
                <IonIcon icon={giftOutline} />
              </span>
              <strong>{t("Vente en lot")}</strong>
              <span>{t("Article offert, 1 + 1, 2ᵉ à −50 %, N + 1 gratuit ou prix du lot.")}</span>
            </button>
          </div>
          <p className="rc-footnote rc-promo-choix__note">
            <IonIcon icon={cubeOutline} /> {t("Un article ne peut être que dans une seule promotion à la fois.")}
          </p>
        </Sheet>
      </IonContent>
    </IonPage>
  );
}
