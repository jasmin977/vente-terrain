import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Geolocation } from "@capacitor/geolocation";
import { IonContent, IonPage } from "@ionic/react";
import { addOutline, personAddOutline } from "ionicons/icons";
import { listClients } from "../api/clients";
import { listArticles } from "../api/articles";
import { createFacture } from "../api/factures";
import type { Client } from "../types/client";
import type { Article } from "../types/article";
import type { ModePaiement, TypeVente } from "../types/facture";
import { ApiError } from "../api/client";
import ArticleImage from "../components/ArticleImage";
import ArticlePickerModal from "./ArticlePickerModal";
import ClientQuickSheet from "./ClientQuickSheet";
import { formatAmount, joinMeta } from "../utils/format";
import { modePaiementLabel } from "../utils/labels";
import { printReceipt } from "../utils/receipt";
import {
  ActionBar,
  AppHeader,
  Button,
  Group,
  LineItem,
  Money,
  Notice,
  PageNotice,
  PickerField,
  PickerSheet,
  Section,
  Segmented,
  Stepper,
  Tag,
} from "../ui";
import { t } from "../i18n";

interface Line {
  articleId: string;
  quantite: number;
  prixUnitaire: number;
  tauxTva: number;
}

// TPE n'est plus proposé (non utilisé) ; les anciennes factures TPE restent lisibles.
const modesPaiement: ModePaiement[] = ["ESPECES", "CHEQUE", "VIREMENT"];

export default function FactureForm() {
  const navigate = useNavigate();

  const [clients, setClients] = useState<Client[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [clientId, setClientId] = useState<string | undefined>(undefined);
  const [clientSheet, setClientSheet] = useState(false);
  /** Création rapide d'un client : null = fermée, sinon nom pré-rempli (recherche en cours). */
  const [nouveauClient, setNouveauClient] = useState<string | null>(null);
  const [typeVente, setTypeVente] = useState<TypeVente>("COMPTANT");
  const [modePaiement, setModePaiement] = useState<ModePaiement | undefined>(undefined);
  const [lignes, setLignes] = useState<Line[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Le vendeur choisit dans tout le catalogue : il ne voit pas le stock
        // théorique de son camion (contrôlé par inventaire côté admin).
        const [c, a] = await Promise.all([listClients(), listArticles()]);
        setClients(c);
        setArticles(a);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t("Impossible de charger les données"));
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Le picker est l'unique point d'entrée pour choisir QUELS articles sont
  // dans la facture : on reconstruit les lignes à partir de la sélection,
  // en conservant la quantité/prix déjà saisis pour les articles déjà présents.
  const handlePickerConfirm = (articleIds: string[]) => {
    setLignes((current) =>
      articleIds.map((articleId) => {
        const existing = current.find((l) => l.articleId === articleId);
        if (existing) return existing;
        const article = articles.find((a) => a.id === articleId);
        return {
          articleId,
          quantite: article ? Number(article.colisage) || 1 : 1,
          prixUnitaire: article ? Number(article.prixVente) : 0,
          tauxTva: article ? Number(article.tva) : 0,
        };
      })
    );
    setPickerOpen(false);
  };

  const updateLine = (articleId: string, patch: Partial<Line>) =>
    setLignes((ls) => ls.map((l) => (l.articleId === articleId ? { ...l, ...patch } : l)));

  const changeQuantite = (articleId: string, delta: number) =>
    setLignes((ls) =>
      ls.map((l) =>
        l.articleId === articleId
          ? { ...l, quantite: Math.max(1, l.quantite + delta) }
          : l
      )
    );

  const removeLine = (articleId: string) => setLignes((ls) => ls.filter((l) => l.articleId !== articleId));

  const { ht: totalHT, tva: totalTVA } = lignes.reduce(
    (acc, l) => {
      const ht = l.quantite * l.prixUnitaire;
      const tva = (ht * l.tauxTva) / 100;
      return { ht: acc.ht + ht, tva: acc.tva + tva };
    },
    { ht: 0, tva: 0 }
  );
  const totaux = { ht: totalHT, tva: totalTVA, ttc: totalHT + totalTVA };

  // La position est capturée automatiquement à la validation, sans action ni
  // indication pour le vendeur : l'admin s'en sert ensuite pour localiser sur
  // une carte où chaque vente a eu lieu. Un échec (GPS désactivé, permission
  // refusée) ne doit jamais bloquer la création de la facture.
  const getCurrentPositionSilently = async (): Promise<{ latitude: number; longitude: number } | null> => {
    try {
      try {
        await Geolocation.requestPermissions();
      } catch {
        // non supporté sur le web
      }
      const pos = await Geolocation.getCurrentPosition();
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch {
      return null;
    }
  };

  const valid =
    clientId &&
    lignes.length > 0 &&
    lignes.every((l) => l.articleId && l.quantite > 0) &&
    (typeVente === "CREDIT" || modePaiement);

  // Indique au vendeur ce qui manque, au lieu d'un bouton grisé muet.
  const missing = !clientId
    ? t("Choisissez un client")
    : lignes.length === 0
      ? t("Ajoutez au moins un article")
      : typeVente === "COMPTANT" && !modePaiement
          ? t("Choisissez le mode de paiement")
          : lignes.some((l) => !(l.quantite > 0))
            ? t("Vérifiez les quantités")
            : null;

  const handleSubmit = async () => {
    if (!valid || !clientId) return;
    setError(null);
    setSaving(true);
    try {
      const position = await getCurrentPositionSilently();
      const facture = await createFacture({
        clientId,
        typeVente,
        modePaiement: typeVente === "COMPTANT" ? modePaiement : undefined,
        latitude: position?.latitude,
        longitude: position?.longitude,
        lignes,
      });
      // Impression discrète du ticket : un échec (imprimante éteinte, IP non
      // configurée) ne doit jamais empêcher la vente d'être enregistrée.
      printReceipt(facture);
      navigate(`/factures/${facture.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Échec de la création de la facture"));
    } finally {
      setSaving(false);
    }
  };

  const client = clients.find((c) => c.id === clientId);
  const soldeApres = client ? Number(client.solde) + totaux.ttc : 0;

  return (
    <IonPage>
      <AppHeader backHref="/factures" title={t("Nouvelle facture")} />

      <IonContent>
        {error && <PageNotice>{error}</PageNotice>}

        <Section label={t("Client")}>
          <PickerField
            label={t("Client")}
            required
            placeholder={loaded ? t("Choisir un client") : t("Chargement des clients…")}
            value={client?.nomCommerce}
            meta={client && joinMeta([client.code, client.ville])}
            onOpen={() => setClientSheet(true)}
          />
        </Section>

        <Section label={t("Règlement")}>
          <Segmented
            label={t("Type de vente")}
            value={typeVente}
            onChange={setTypeVente}
            options={[
              { value: "COMPTANT", label: t("Comptant") },
              { value: "CREDIT", label: t("Crédit") },
            ]}
          />
          {typeVente === "COMPTANT" && (
            <div className="rc-field">
              <span className="rc-field__label" id="mode-paiement-label">
                {t("Mode de paiement")}
                <span className="rc-field__req" aria-hidden="true">
                  *
                </span>
              </span>
              <Segmented
                label={t("Mode de paiement")}
                variant="tiles"
                wrap
                value={modePaiement}
                onChange={setModePaiement}
                options={modesPaiement.map((m) => ({ value: m, label: modePaiementLabel[m] }))}
              />
            </div>
          )}
          {typeVente === "CREDIT" && client && (
            <Notice tone="info">{t("Solde après cette vente : {solde} TND.", { solde: formatAmount(soldeApres) })}</Notice>
          )}
        </Section>

        <Section label={t("Articles")} aside={lignes.length > 0 ? `${lignes.length}` : undefined}>
          {lignes.length > 0 && (
            <Group>
              {lignes.map((line) => {
                const article = articles.find((a) => a.id === line.articleId);
                const name = article?.designation ?? t("Article");
                return (
                  <LineItem
                    key={line.articleId}
                    leading={<ArticleImage src={article?.img} alt={name} size={44} />}
                    title={name}
                    meta={
                      <>
                        {formatAmount(line.prixUnitaire)} {t("TND")}{article?.unit ? ` · ${article.unit}` : ""}
                      </>
                    }
                    removeLabel={t("Retirer {nom}", { nom: name })}
                    onRemove={() => removeLine(line.articleId)}
                    control={
                      <Stepper
                        label={t("Quantité {nom}", { nom: name })}
                        value={line.quantite}
                        onStep={(d) => changeQuantite(line.articleId, d)}
                        onInput={(q) => updateLine(line.articleId, { quantite: q })}
                      />
                    }
                    amount={<Money value={line.quantite * line.prixUnitaire * (1 + line.tauxTva / 100)} />}
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
            disabled={!loaded || articles.length === 0}
          >
            {lignes.length > 0 ? t("Ajouter ou retirer des articles") : t("Ajouter des articles")}
          </Button>
        </Section>
      </IonContent>

      <ActionBar hint={missing}>
        <div className="rc-actionbar__row">
          <div className="rc-total" aria-live="polite">
            <span className="rc-total__label">{t("Total TTC")}</span>
            <Money value={totaux.ttc} size="lg" />
            <span className="rc-total__detail">
              {t("HT {ht} · TVA {tva}", { ht: formatAmount(totaux.ht), tva: formatAmount(totaux.tva) })}
            </span>
          </div>
          <Button
            size="lg"
            disabled={!valid}
            loading={saving}
            onClick={handleSubmit}
            style={{ flex: "0 0 auto" }}
          >
            {t("Valider la facture")}
          </Button>
        </div>
      </ActionBar>

      <ArticlePickerModal
        isOpen={pickerOpen}
        articles={articles}
        selectedIds={lignes.map((l) => l.articleId)}
        onConfirm={handlePickerConfirm}
        onDismiss={() => setPickerOpen(false)}
      />

      <PickerSheet
        isOpen={clientSheet}
        title={t("Choisir un client")}
        searchPlaceholder={t("Commerce, code, ville…")}
        emptyLabel={t("Aucun client trouvé.")}
        value={clientId}
        onDismiss={() => setClientSheet(false)}
        onSelect={(id) => {
          setClientId(id);
          setClientSheet(false);
        }}
        action={{
          label: t("Nouveau client"),
          icon: personAddOutline,
          onClick: (query) => {
            setNouveauClient(query);
            setClientSheet(false);
          },
        }}
        options={clients.map((c) => ({
          value: c.id,
          label: c.nomCommerce,
          meta: joinMeta([c.code, c.ville]),
          keywords: `${c.code} ${c.ville ?? ""} ${c.responsable ?? ""}`,
          // Rappel au vendeur : ce client a déjà un crédit en cours.
          trailing:
            Number(c.solde) > 0 ? (
              <span className="rc-row__credit">
                <Tag tone="warning">{t("Crédit")}</Tag>
                <Money value={c.solde} size="sm" />
              </span>
            ) : undefined,
        }))}
      />

      <ClientQuickSheet
        isOpen={nouveauClient !== null}
        nomInitial={nouveauClient ?? undefined}
        onDismiss={() => setNouveauClient(null)}
        onCreated={(client) => {
          setClients((cs) => [...cs, client].sort((a, b) => a.nomCommerce.localeCompare(b.nomCommerce)));
          setClientId(client.id);
          setNouveauClient(null);
        }}
      />
    </IonPage>
  );
}
