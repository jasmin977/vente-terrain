import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { IonContent, IonPage, useIonViewWillEnter } from "@ionic/react";
import { addOutline, checkmarkOutline } from "ionicons/icons";
import { listArticles } from "../api/articles";
import { createChargement, createEntreeDepot, getNumeroSuivant, getStockCamion, getStockDepot } from "../api/stock";
import { listUsers } from "../api/auth";
import type { Article } from "../types/article";
import type { UserSummary } from "../types/auth";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import ArticleImage from "../components/ArticleImage";
import ArticlePickerModal from "./ArticlePickerModal";
import ChampDateExpiration from "../components/ChampDateExpiration";
import FlecheVariation from "../components/FlecheVariation";
import { formatAmount, formatColis, pieces, joinMeta } from "../utils/format";
import {
  ActionBar,
  AppHeader,
  Button,
  Field,
  Group,
  LineItem,
  Money,
  Row,
  PageNotice,
  PickerField,
  PickerSheet,
  Section,
  Stepper,
} from "../ui";
import { suiviPeremption } from "../utils/peremption";
import { arrondir, htDepuisMarge, htDepuisTTC, margeDepuis, ttcDepuisHT } from "../utils/tarifs";
import { useCategories } from "../utils/useCategories";
import { t } from "../i18n";

/** Quantité saisie en colis + pièces (ex. 30 colis + 3 pièces). */
interface Line {
  articleId: string;
  colis: number;
  pieces: number;
  /** Bon d'entrée : date d'expiration des pièces reçues (AAAA-MM-JJ), facultative. */
  date?: string;
  /** Bon d'entrée : prix d'achat HT facturé (texte saisi) ; vide = prix actuel de l'article. */
  achat?: string;
  /** Bon d'entrée : prix de vente TTC modifié à la main (sinon le prix actuel est gardé). */
  ttc?: string;
  /** Bon d'entrée : marge (% du prix d'achat) saisie à la main ; elle fixe le prix de vente. */
  marge?: string;
}

type Kind = "chargement" | "retour" | "entree";

// Libellés de chaque bon : titre de l'écran, champ N° et type de numérotation.
const BONS = {
  entree: { titre: "B° Entrée", numero: "N° bon d'entrée", type: "ENTREE" },
  chargement: { titre: "B° Chargement", numero: "N° bon de sortie", type: "SORTIE" },
  retour: { titre: "B° Retour", numero: "N° bon de retour", type: "RETOUR" },
} as const;

/**
 * Bons saisis par l'admin :
 * - kind="entree"     : réception de marchandise au dépôt (bon d'entrée) ;
 * - kind="chargement" : dépôt → camion d'un vendeur (bon de chargement / sortie) ;
 * - kind="retour"     : camion → dépôt (bon de retour).
 * Le N° est proposé automatiquement (2026-0001…) et reste modifiable.
 */
export default function ChargementForm({ kind = "chargement" }: { kind?: Kind }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const entree = kind === "entree";
  const sens = kind === "retour" ? "RETOUR" : "CHARGEMENT";
  const bon = BONS[kind];
  const { categories } = useCategories();

  const [vendeurs, setVendeurs] = useState<UserSummary[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [depot, setDepot] = useState<Map<string, number>>(new Map());
  const [camion, setCamion] = useState<Map<string, number>>(new Map());
  const [vendeurId, setVendeurId] = useState<string | undefined>(undefined);
  const [reference, setReference] = useState("");
  const [lignes, setLignes] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [vendeurSheet, setVendeurSheet] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // L'écran reste monté entre deux visites : on recharge les stocks à chaque
  // entrée pour ne pas afficher les quantités d'avant le dernier mouvement.
  const [visite, setVisite] = useState(0);
  useIonViewWillEnter(() => setVisite((v) => v + 1));

  useEffect(() => {
    (async () => {
      try {
        const [users, arts, stockDepot] = await Promise.all([listUsers(), listArticles(), getStockDepot()]);
        setVendeurs(users.filter((u) => u.role === "VENDEUR" && u.actif));
        setArticles(arts);
        setDepot(new Map(stockDepot.map((d) => [d.articleId, Number(d.quantite)])));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t("Impossible de charger les données"));
      }
    })();
  }, [visite]);

  // Pour un retour, on affiche ce que l'app attend dans le camion.
  useEffect(() => {
    if (entree || !vendeurId) return;
    getStockCamion(vendeurId)
      .then((s) => setCamion(new Map(s.map((i) => [i.articleId, Number(i.quantite)]))))
      .catch(() => setCamion(new Map()));
  }, [entree, vendeurId, visite]);

  // N° proposé à chaque arrivée sur l'écran, sauf si un N° est déjà saisi.
  useEffect(() => {
    getNumeroSuivant(bon.type)
      .then(({ numero }) => setReference((r) => r || numero))
      .catch(() => undefined); // l'admin peut toujours le saisir
  }, [visite, bon.type]);

  // Ouvert depuis la vue d'un camion : vendeur présélectionné.
  useEffect(() => {
    const depuis = (location.state as { vendeurId?: string } | null)?.vendeurId;
    if (!entree && depuis) setVendeurId((v) => v ?? depuis);
  }, [location.state, entree, visite]);

  const articleMap = useMemo(() => new Map(articles.map((a) => [a.id, a])), [articles]);
  const colisage = (articleId: string) => Number(articleMap.get(articleId)?.colisage) || 1;
  const enUnites = (l: Line) => l.colis * colisage(l.articleId) + l.pieces;

  // Nouvelle ligne : 1 colis (ou 1 pièce pour un article vendu à l'unité).
  const handlePicked = (ids: string[]) => {
    setLignes((current) =>
      ids.map(
        (id) =>
          current.find((l) => l.articleId === id) ??
          (colisage(id) > 1 ? { articleId: id, colis: 1, pieces: 0 } : { articleId: id, colis: 0, pieces: 1 })
      )
    );
    setPickerOpen(false);
  };

  const updateLine = (articleId: string, champ: "colis" | "pieces", valeur: number) =>
    setLignes((ls) => ls.map((l) => (l.articleId === articleId ? { ...l, [champ]: Math.max(0, Math.trunc(valeur) || 0) } : l)));
  const updateLigne = (articleId: string, champs: Partial<Line>) =>
    setLignes((ls) => ls.map((l) => (l.articleId === articleId ? { ...l, ...champs } : l)));
  const updateDate = (articleId: string, date: string) => setLignes((ls) => ls.map((l) => (l.articleId === articleId ? { ...l, date } : l)));
  const removeLine = (articleId: string) => setLignes((ls) => ls.filter((l) => l.articleId !== articleId));

  const sortDuDepot = !entree && sens === "CHARGEMENT";
  const manqueDepot = (l: Line) => sortDuDepot && enUnites(l) > (depot.get(l.articleId) ?? 0);
  const totalUnites = lignes.reduce((s, l) => s + enUnites(l), 0);

  const nombre = (texte: string | undefined) => (texte === undefined || texte.trim() === "" ? undefined : Number(texte.replace(",", ".")));
  /**
   * Prix d'une ligne de bon d'entrée. Un nouveau prix d'achat ne change JAMAIS le prix de vente tout seul :
   * le prix de vente actuel reste, la marge se recalcule, et l'admin choisit : revenir à l'ancienne marge
   * (suggestion), saisir un autre prix de vente TTC, ou saisir sa marge.
   */
  const prixLigne = (l: Line) => {
    const a = articleMap.get(l.articleId);
    if (!entree || !a) return null;
    const achatActuel = Number(a.prixAchat ?? 0);
    const tva = Number(a.tva);
    const fodec = Number(a.fodec ?? 0);
    const venteActuelle = Number(a.prixVente);
    const achat = nombre(l.achat) ?? achatActuel;
    const change = Math.abs(achat - achatActuel) > 1e-9;
    const ttcActuel = ttcDepuisHT(venteActuelle, tva, fodec);
    const margeActuelle = margeDepuis(venteActuelle, achatActuel);
    const ttcSaisi = change ? nombre(l.ttc) : undefined;
    const ttc = ttcSaisi ?? ttcActuel;
    const ht = ttcSaisi === undefined ? venteActuelle : htDepuisTTC(ttcSaisi, tva, fodec);
    const ttcAncienneMarge =
      change && margeActuelle !== undefined ? ttcDepuisHT(htDepuisMarge(achat, margeActuelle, tva, fodec), tva, fodec) : undefined;
    const quantite = enUnites(l);
    return {
      achatActuel,
      achat,
      change,
      ecart: arrondir(achat - achatActuel, 3),
      margeActuelle,
      marge: margeDepuis(ht, achat),
      ttcActuel,
      ttc,
      ht,
      ttcAncienneMarge,
      total: arrondir(quantite * achat, 3),
      totalTTC: arrondir(quantite * ttcDepuisHT(achat, tva, fodec), 3),
      invalide: !(achat >= 0) || !(ttc >= 0),
    };
  };
  const totalHT = entree ? arrondir(lignes.reduce((s, l) => s + (prixLigne(l)?.total ?? 0), 0), 3) : 0;
  const totalTTC = entree ? arrondir(lignes.reduce((s, l) => s + (prixLigne(l)?.totalTTC ?? 0), 0), 3) : 0;

  const missing =
    !entree && !vendeurId
      ? t("Choisissez un vendeur")
      : !reference.trim()
      ? t("Saisissez le N° du bon")
      : lignes.length === 0
      ? t("Ajoutez au moins un article")
      : lignes.some((l) => !(enUnites(l) > 0))
      ? t("Vérifiez les quantités")
      : lignes.some((l) => prixLigne(l)?.invalide)
      ? t("Vérifiez les prix")
      : lignes.some(manqueDepot)
      ? t("Stock dépôt insuffisant pour un article")
      : null;

  const handleSubmit = async () => {
    if (missing) return;
    setError(null);
    setSaving(true);
    try {
      // Envoyé en pièces : colis × colisage + pièces.
      const payload = lignes.map((l) => ({
        articleId: l.articleId,
        quantite: enUnites(l),
        unite: "UNITE" as const,
        ...(entree && l.date ? { dateExpiration: l.date } : {}),
        ...(entree && prixLigne(l)?.change
          ? { prixAchat: arrondir(prixLigne(l)!.achat, 6), prixVente: prixLigne(l)!.ht }
          : {}),
      }));
      const ref = reference.trim() || undefined;
      if (entree) await createEntreeDepot({ reference: ref, lignes: payload });
      else
        await createChargement({
          vendeurId: vendeurId!,
          sens,
          reference: ref,
          lignes: payload,
        });
      // Formulaire vierge pour le prochain mouvement.
      setLignes([]);
      setReference("");
      setVendeurId(undefined);
      navigate("/stock");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Échec de l'enregistrement"));
    } finally {
      setSaving(false);
    }
  };

  if (user?.role !== "ADMIN") return <Navigate to="/factures" replace />;

  const vendeur = vendeurs.find((v) => v.id === vendeurId);
  const reperes = (articleId: string) => {
    const d = depot.get(articleId) ?? 0;
    if (entree) return t("Dépôt : {q}", { q: `${d} ${pieces(d)}` });
    if (sens === "RETOUR") {
      const c = camion.get(articleId) ?? 0;
      return vendeurId ? t("Camion (théorique) : {q}", { q: `${c} ${pieces(c)}` }) : null;
    }
    return t("Dépôt : {q}", { q: `${d} ${pieces(d)}` });
  };
  const submitLabel = entree ? t("Enregistrer le bon d'entrée") : kind === "chargement" ? t("Valider le bon de chargement") : t("Valider le bon de retour");
  const champNumero = (
    <Field
      label={t(bon.numero)}
      value={reference}
      onChange={setReference}
      required
      hint={t("Proposé automatiquement, modifiable.")}
    />
  );

  return (
    <IonPage>
      <AppHeader backHref="/stock" title={t(bon.titre)} />

      <IonContent>
        {error && <PageNotice>{error}</PageNotice>}

        {entree ? (
          <Section label={t("Réception")}>
            <div className="rc-fields">
              {champNumero}
              <p className="rc-footnote">{t("Les quantités reçues s'ajoutent au stock du dépôt.")}</p>
            </div>
          </Section>
        ) : (
          <>
            <Section label={kind === "chargement" ? t("Dépôt → camion") : t("Camion → dépôt")}>
              <div className="rc-fields">
                <PickerField
                  label={t("Camion du vendeur")}
                  required
                  placeholder={t("Choisir un vendeur")}
                  value={vendeur?.nom}
                  meta={vendeur?.code}
                  onOpen={() => setVendeurSheet(true)}
                />
                {champNumero}
              </div>
            </Section>
          </>
        )}

        <Section label={t("Articles")} aside={lignes.length > 0 ? `${lignes.length} · ${totalUnites} ${pieces(totalUnites)}` : undefined}>
          {lignes.length > 0 && (
            <Group>
              {lignes.map((l) => {
                const article = articleMap.get(l.articleId);
                const name = article?.designation ?? t("Article");
                const c = colisage(l.articleId);
                const u = enUnites(l);
                const dispo = depot.get(l.articleId) ?? 0;
                return (
                  <LineItem
                    key={l.articleId}
                    leading={<ArticleImage src={article?.img} alt="" size={44} />}
                    title={name}
                    meta={joinMeta([t("Colis de {n}", { n: c }), reperes(l.articleId)])}
                    error={
                      manqueDepot(l)
                        ? t("Le dépôt n'a que {q} ({colis}).", {
                            q: `${dispo} ${pieces(dispo)}`,
                            colis: formatColis(dispo, c),
                          })
                        : undefined
                    }
                    removeLabel={t("Retirer {nom}", { nom: name })}
                    onRemove={() => removeLine(l.articleId)}
                    control={
                      <div className="rc-line__ctl">
                      <div className="rc-qtysplit">
                        {c > 1 && (
                          <div className="rc-qtysplit__item">
                            <span className="rc-qtysplit__label" aria-hidden="true">
                              {t("Colis")}
                            </span>
                            <Stepper
                              label={t("Quantité {nom} en colis", {
                                nom: name,
                              })}
                              min={0}
                              value={l.colis}
                              error={manqueDepot(l) || !(u > 0)}
                              onStep={(d) => updateLine(l.articleId, "colis", l.colis + d)}
                              onInput={(q) => updateLine(l.articleId, "colis", q)}
                            />
                          </div>
                        )}
                        <div className="rc-qtysplit__item">
                          <span className="rc-qtysplit__label" aria-hidden="true">
                            {t("Pièces")}
                          </span>
                          <Stepper
                            label={t("Quantité {nom} en pièces", { nom: name })}
                            min={0}
                            value={l.pieces}
                            error={manqueDepot(l) || !(u > 0)}
                            onStep={(d) => updateLine(l.articleId, "pieces", l.pieces + d)}
                            onInput={(q) => updateLine(l.articleId, "pieces", q)}
                          />
                        </div>
                      </div>
                      {entree && prixLigne(l) && (
                        <PrixLigne
                          prix={prixLigne(l)!}
                          achat={l.achat}
                          ttc={l.ttc}
                          marge={l.marge}
                          tva={Number(article?.tva ?? 0)}
                          fodec={Number(article?.fodec ?? 0)}
                          onChange={(champs) => updateLigne(l.articleId, champs)}
                        />
                      )}
                      {entree && suiviPeremption(categories, article?.categorieId) && (
                        <ChampDateExpiration
                          label={t("Date d'expiration (facultatif)")}
                          value={l.date ?? ""}
                          onChange={(v) => updateDate(l.articleId, v)}
                        />
                      )}
                      </div>
                    }
                    amount={
                      <span className="rc-line__totaux">
                        <span className="rc-qty">
                          = <span className="rc-qty__n">{u}</span> {pieces(u)}
                        </span>
                        {entree && prixLigne(l) && <Money value={prixLigne(l)!.total} size="lg" />}
                      </span>
                    }
                  />
                );
              })}
            </Group>
          )}

          <Button
            variant="secondary"
            size="lg"
            block
            icon={addOutline}
            onClick={() => setPickerOpen(true)}
            disabled={articles.length === 0}
          >
            {lignes.length > 0 ? t("Ajouter ou retirer des articles") : t("Choisir des articles")}
          </Button>
        </Section>

        {entree && lignes.length > 0 && (
          <Section label={t("Total du bon")}>
            <Group>
              <Row compact label={t("Total HT")} trailing={<Money value={totalHT} />} />
              <Row compact label={t("TVA et FODEC")} trailing={<Money value={arrondir(totalTTC - totalHT, 3)} />} />
              <Row compact label={t("Total TTC")} trailing={<Money value={totalTTC} size="lg" />} />
            </Group>
          </Section>
        )}
      </IonContent>

      <ActionBar hint={missing}>
        <Button size="lg" block icon={checkmarkOutline} disabled={Boolean(missing)} loading={saving} onClick={handleSubmit}>
          {submitLabel}
        </Button>
      </ActionBar>

      <ArticlePickerModal
        isOpen={pickerOpen}
        articles={articles}
        selectedIds={lignes.map((l) => l.articleId)}
        onConfirm={handlePicked}
        onDismiss={() => setPickerOpen(false)}
        confirmLabel={t("Valider la sélection")}
        renderTrailing={(a) => (
          <span className="rc-row__note">
            dépôt <strong>{depot.get(a.id) ?? 0}</strong>
          </span>
        )}
      />

      <PickerSheet
        isOpen={vendeurSheet}
        title={t("Vendeur")}
        value={vendeurId}
        onDismiss={() => setVendeurSheet(false)}
        onSelect={(v) => {
          setVendeurId(v);
          setVendeurSheet(false);
        }}
        options={vendeurs.map((v) => ({
          value: v.id,
          label: v.nom,
          meta: v.code,
          keywords: v.code,
        }))}
      />
    </IonPage>
  );
}

type PrixDeLigne = {
  achatActuel: number;
  achat: number;
  change: boolean;
  ecart: number;
  margeActuelle: number | undefined;
  marge: number | undefined;
  ttcActuel: number;
  ttc: number;
  ttcAncienneMarge: number | undefined;
};

/**
 * Prix d'une ligne de bon d'entrée : prix d'achat (flèche rouge/verte et écart quand il change), marge à droite,
 * prix de vente TTC (grisé tant que le prix d'achat est inchangé) et suggestion de revenir à l'ancienne marge.
 */
function PrixLigne({
  prix,
  achat,
  ttc,
  marge,
  tva,
  fodec,
  onChange,
}: {
  prix: PrixDeLigne;
  achat: string | undefined;
  ttc: string | undefined;
  marge: string | undefined;
  tva: number;
  fodec: number;
  onChange: (champs: Partial<Line>) => void;
}) {
  const hausse = prix.ecart > 0;
  const signe = hausse ? "+" : "−";
  const margeAffichee = marge ?? (prix.marge === undefined ? "" : String(prix.marge));
  return (
    <div className="rc-prixligne">
      <div className="rc-fields__row">
        <div className="rc-prixligne__achat">
          {prix.change && (
            <span className="rc-prixligne__fleche">
              <FlecheVariation sens={hausse ? "hausse" : "baisse"} label={hausse ? t("Prix d'achat en hausse") : t("Prix d'achat en baisse")} />
            </span>
          )}
          <Field
            label={t("Prix d'achat HT")}
            type="number"
            inputMode="decimal"
            value={achat ?? String(prix.achatActuel)}
            // Un autre prix d'achat : le prix de vente revient au prix actuel (jamais modifié tout seul).
            onChange={(v) => onChange({ achat: v, ttc: undefined, marge: undefined })}
            suffix="TND"
            hint={
              prix.change ? (
                <span className={`rc-variation-texte rc-variation-texte--${hausse ? "hausse" : "baisse"}`}>
                  {signe}
                  {formatAmount(Math.abs(prix.ecart))} {t("TND")} {t("par rapport à {p}", { p: formatAmount(prix.achatActuel) })}
                </span>
              ) : undefined
            }
          />
        </div>
        <Field
          label={t("Marge")}
          type="number"
          inputMode="decimal"
          value={margeAffichee}
          disabled={!prix.change}
          onChange={(v) => {
            const m = Number(v.replace(",", "."));
            onChange(
              v.trim() !== "" && Number.isFinite(m)
                ? { marge: v, ttc: String(ttcDepuisHT(htDepuisMarge(prix.achat, m, tva, fodec), tva, fodec)) }
                : { marge: v },
            );
          }}
          suffix="%"
          hint={prix.change && prix.margeActuelle !== undefined ? t("Avant : {n} %", { n: prix.margeActuelle }) : t("Sur le prix d'achat")}
        />
      </div>
      <Field
        label={t("Prix de vente TTC")}
        type="number"
        inputMode="decimal"
        value={ttc ?? String(prix.ttc)}
        disabled={!prix.change}
        onChange={(v) => onChange({ ttc: v, marge: undefined })}
        suffix="TND"
        hint={prix.change ? undefined : t("Modifiable quand le prix d'achat change")}
      />
      {prix.change && prix.ttcAncienneMarge !== undefined && Math.abs(prix.ttcAncienneMarge - prix.ttc) > 0.0005 && (
        <Button
          variant="secondary"
          block
          onClick={() => onChange({ ttc: String(prix.ttcAncienneMarge), marge: undefined })}
        >
          {t("Garder l'ancienne marge ({n} %) : {p} TND", { n: prix.margeActuelle ?? 0, p: formatAmount(prix.ttcAncienneMarge) })}
        </Button>
      )}
    </div>
  );
}
