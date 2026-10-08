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
import { formatColis, pieces, joinMeta } from "../utils/format";
import {
  ActionBar,
  AppHeader,
  Button,
  Field,
  Group,
  LineItem,
  PageNotice,
  PickerField,
  PickerSheet,
  Section,
  Stepper,
} from "../ui";
import { t } from "../i18n";

/** Quantité saisie en colis + pièces (ex. 30 colis + 3 pièces). */
interface Line {
  articleId: string;
  colis: number;
  pieces: number;
}

type Kind = "chargement" | "retour" | "entree";

// Libellés de chaque bon : titre de l'écran, champ N° et type de numérotation.
const BONS = {
  entree: { titre: "Bon d'entrée", numero: "N° bon d'entrée", type: "ENTREE" },
  chargement: { titre: "Bon de chargement", numero: "N° bon de sortie", type: "SORTIE" },
  retour: { titre: "Bon de retour", numero: "N° bon de retour", type: "RETOUR" },
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
  const removeLine = (articleId: string) => setLignes((ls) => ls.filter((l) => l.articleId !== articleId));

  const sortDuDepot = !entree && sens === "CHARGEMENT";
  const manqueDepot = (l: Line) => sortDuDepot && enUnites(l) > (depot.get(l.articleId) ?? 0);
  const totalUnites = lignes.reduce((s, l) => s + enUnites(l), 0);

  const missing =
    !entree && !vendeurId
      ? t("Choisissez un vendeur")
      : !reference.trim()
      ? t("Saisissez le N° du bon")
      : lignes.length === 0
      ? t("Ajoutez au moins un article")
      : lignes.some((l) => !(enUnites(l) > 0))
      ? t("Vérifiez les quantités")
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
                    }
                    amount={
                      <span className="rc-qty">
                        = <span className="rc-qty__n">{u}</span> {pieces(u)}
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
