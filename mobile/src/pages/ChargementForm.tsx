import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { IonContent, IonPage, useIonViewWillEnter } from "@ionic/react";
import { addOutline, checkmarkOutline } from "ionicons/icons";
import { listArticles } from "../api/articles";
import { createChargement, createEntreeDepot, getStockCamion, getStockDepot } from "../api/stock";
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
  Segmented,
  Stepper,
} from "../ui";
import { t } from "../i18n";

/** Quantité saisie en colis + pièces (ex. 30 colis + 3 pièces). */
interface Line {
  articleId: string;
  colis: number;
  pieces: number;
}

type Sens = "CHARGEMENT" | "RETOUR";

/**
 * Mouvements de stock saisis par l'admin :
 * - kind="chargement" : dépôt → camion (ou retour camion → dépôt) pour un vendeur ;
 * - kind="entree"     : réception de marchandise au dépôt.
 */
export default function ChargementForm({ kind = "chargement" }: { kind?: "chargement" | "entree" }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const entree = kind === "entree";

  const [vendeurs, setVendeurs] = useState<UserSummary[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [depot, setDepot] = useState<Map<string, number>>(new Map());
  const [camion, setCamion] = useState<Map<string, number>>(new Map());
  const [vendeurId, setVendeurId] = useState<string | undefined>(undefined);
  const [sens, setSens] = useState<Sens>("CHARGEMENT");
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
      setSens("CHARGEMENT");
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
  const submitLabel = entree ? t("Enregistrer l'entrée") : sens === "CHARGEMENT" ? t("Valider le chargement") : t("Valider le retour");

  return (
    <IonPage>
      <AppHeader backHref="/stock" title={entree ? t("Entrée dépôt") : t("Chargement camion")} />

      <IonContent>
        {error && <PageNotice>{error}</PageNotice>}

        {entree ? (
          <Section label={t("Réception")}>
            <Field
              label={t("Référence")}
              placeholder={t("N° de bon de livraison (facultatif)")}
              value={reference}
              onChange={setReference}
              hint={t("Les quantités reçues s'ajoutent au stock du dépôt.")}
            />
          </Section>
        ) : (
          <>
            <Section label={t("Sens")}>
              <Segmented
                label={t("Sens du mouvement")}
                value={sens}
                onChange={setSens}
                options={[
                  {
                    value: "CHARGEMENT",
                    label: t("Chargement"),
                    hint: t("dépôt → camion"),
                  },
                  {
                    value: "RETOUR",
                    label: t("Retour"),
                    hint: t("camion → dépôt"),
                  },
                ]}
              />
            </Section>
            <Section label={t("Vendeur")}>
              <div className="rc-fields">
                <PickerField
                  label={t("Camion du vendeur")}
                  required
                  placeholder={t("Choisir un vendeur")}
                  value={vendeur?.nom}
                  meta={vendeur?.code}
                  onOpen={() => setVendeurSheet(true)}
                />
                <Field
                  label={t("Référence")}
                  placeholder={sens === "CHARGEMENT" ? t("N° de bon de chargement (facultatif)") : t("N° de bon de retour (facultatif)")}
                  value={reference}
                  onChange={setReference}
                />
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
