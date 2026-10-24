import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Geolocation } from "@capacitor/geolocation";
import { IonContent, IonPage } from "@ionic/react";
import { addOutline, barcodeOutline, personAddOutline, phonePortraitOutline } from "ionicons/icons";
import { createFacture, listArticles, listClients, listPromotionsActives } from "../offline/donnees";
import type { Promotion } from "../types/promotion";
import { appliquerPromotions, htLigne } from "../utils/promotions";
import { listUsers } from "../api/auth";
import type { UserSummary } from "../types/auth";
import { useAuth } from "../auth/AuthContext";
import type { Client } from "../types/client";
import type { Article } from "../types/article";
import type { ModePaiement, TypeVente } from "../types/facture";
import { ApiError } from "../api/client";
import ImportCollecteSheet, { type LigneImportee } from "../components/ImportCollecteSheet";
import ArticleImage from "../components/ArticleImage";
import ScanMultiple, { type ArticleScanne } from "../components/ScanMultiple";
import { scanCameraDisponible } from "../lib/barcode";
import { arrondir, ttcDepuisHT } from "../utils/tarifs";
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
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  // Admin : le bon est fait au nom d'un vendeur, dont le camion livre (son numéro de série, son stock camion).
  const [vendeurs, setVendeurs] = useState<UserSummary[]>([]);
  const [vendeurId, setVendeurId] = useState<string | undefined>(undefined);
  const [vendeurSheet, setVendeurSheet] = useState(false);

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
  // Promotions en cours : appliquées d'elles-mêmes (prix promo, pièces offertes, remises, article offert).
  const [promotions, setPromotions] = useState<Promotion[]>([]);

  useEffect(() => {
    (async () => {
      try {
        // Le vendeur choisit dans tout le catalogue : il ne voit pas le stock
        // théorique de son camion (contrôlé par inventaire côté admin).
        const [c, a] = await Promise.all([listClients(), listArticles()]);
        setClients(c);
        setArticles(a);
        listPromotionsActives()
          .then(setPromotions)
          .catch(() => setPromotions([]));
        if (isAdmin) setVendeurs((await listUsers()).filter((u) => u.role === "VENDEUR" && u.actif));
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
          // HT facturé = HT + FODEC (la TVA s'applique sur les deux) : le total TTC retombe sur le prix de vente.
          prixUnitaire: article ? arrondir(Number(article.prixVente) * (1 + Number(article.fodec ?? 0) / 100), 6) : 0,
          tauxTva: article ? Number(article.tva) : 0,
        };
      })
    );
    setPickerOpen(false);
  };

  // Scan de plusieurs articles à la caméra : ajoutés au bon, quantité additionnée s'ils y sont déjà.
  const [scanMultiple, setScanMultiple] = useState(false);
  const ajouterScannes = (scannes: ArticleScanne[]) => {
    setLignes((ls) => {
      const resultat = [...ls];
      for (const s of scannes) {
        const article = articles.find((a) => a.id === s.articleId);
        if (!article) continue;
        const i = resultat.findIndex((l) => l.articleId === s.articleId);
        if (i >= 0) resultat[i] = { ...resultat[i], quantite: resultat[i].quantite + s.quantite };
        else
          resultat.push({
            articleId: s.articleId,
            quantite: s.quantite,
            prixUnitaire: arrondir(Number(article.prixVente) * (1 + Number(article.fodec ?? 0) / 100), 6),
            tauxTva: Number(article.tva),
          });
      }
      return resultat;
    });
    setScanMultiple(false);
  };

  // Collecte du PDA (admin) : articles reconnus ajoutés au bon, quantité additionnée s'ils y sont déjà.
  const [importPda, setImportPda] = useState(false);
  const importerCollecte = (importees: LigneImportee[]) => {
    let refusees = 0;
    setLignes((ls) => {
      const resultat = [...ls];
      for (const imp of importees) {
        const article = articles.find((a) => a.id === imp.articleId);
        if (!article) {
          refusees++;
          continue;
        }
        const i = resultat.findIndex((l) => l.articleId === imp.articleId);
        if (i >= 0) resultat[i] = { ...resultat[i], quantite: resultat[i].quantite + imp.quantite };
        else
          resultat.push({
            articleId: imp.articleId,
            quantite: imp.quantite,
            prixUnitaire: arrondir(Number(article.prixVente) * (1 + Number(article.fodec ?? 0) / 100), 6),
            tauxTva: Number(article.tva),
          });
      }
      return resultat;
    });
    return refusees;
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

  // Lignes du bon une fois les promotions appliquées : ce qui est enregistré et imprimé.
  const articleMap = useMemo(() => new Map(articles.map((a) => [a.id, a])), [articles]);
  const appliquees = useMemo(() => appliquerPromotions(lignes, promotions, articleMap), [lignes, promotions, articleMap]);
  const offerts = appliquees.slice(lignes.length);

  const { ht: totalHT, tva: totalTVA } = appliquees.reduce(
    (acc, l) => {
      const ht = htLigne(l);
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
      // Position récente acceptée (1 min) et 8 s au plus : sans réseau mobile, un
      // premier repérage GPS peut être long et ne doit pas retarder la vente.
      const pos = await Geolocation.getCurrentPosition({ maximumAge: 60_000, timeout: 8_000 });
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch {
      return null;
    }
  };

  const valid =
    (!isAdmin || vendeurId) &&
    clientId &&
    lignes.length > 0 &&
    lignes.every((l) => l.articleId && l.quantite > 0) &&
    (typeVente === "CREDIT" || modePaiement);

  // Indique au vendeur ce qui manque, au lieu d'un bouton grisé muet.
  const missing = isAdmin && !vendeurId
    ? t("Choisissez le vendeur")
    : !clientId
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
      // L'admin saisit depuis un ordinateur : pas de position GPS (et pas de demande d'autorisation).
      const position = isAdmin ? null : await getCurrentPositionSilently();
      const facture = await createFacture({
        vendeurId: isAdmin ? vendeurId : undefined,
        clientId,
        typeVente,
        modePaiement: typeVente === "COMPTANT" ? modePaiement : undefined,
        latitude: position?.latitude,
        longitude: position?.longitude,
        lignes: appliquees.map((l) => ({
          articleId: l.articleId,
          quantite: l.quantite,
          prixUnitaire: l.prixUnitaire,
          tauxTva: l.tauxTva,
          ...(l.promotionId ? { quantiteOfferte: l.quantiteOfferte, remise: l.remise, promotionId: l.promotionId } : {}),
        })),
      });
      // Impression discrète du ticket : un échec (imprimante éteinte, IP non
      // configurée) ne doit jamais empêcher la vente d'être enregistrée.
      printReceipt(facture);
      navigate(`/factures/${facture.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Échec de la création du bon de livraison"));
    } finally {
      setSaving(false);
    }
  };

  const client = clients.find((c) => c.id === clientId);
  const soldeApres = client ? Number(client.solde) + totaux.ttc : 0;

  return (
    <IonPage>
      <AppHeader backHref="/factures" title={t("Nouveau B° Livraison")} />

      <IonContent>
        {error && <PageNotice>{error}</PageNotice>}

        {isAdmin && (
          <Section label={t("Vendeur")}>
            <PickerField
              label={t("Vendeur (camion de départ)")}
              required
              placeholder={t("Choisir un vendeur")}
              value={vendeurs.find((v) => v.id === vendeurId)?.nom}
              meta={vendeurs.find((v) => v.id === vendeurId)?.code}
              onOpen={() => setVendeurSheet(true)}
            />
          </Section>
        )}

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
              {lignes.map((line, i) => {
                const article = articles.find((a) => a.id === line.articleId);
                const name = article?.designation ?? t("Article");
                const p = appliquees[i];
                const prixChange = p.prixUnitaire !== line.prixUnitaire;
                return (
                  <LineItem
                    key={line.articleId}
                    leading={<ArticleImage src={article?.img} alt={name} size={44} />}
                    title={name}
                    meta={
                      <>
                        {prixChange && <s className="rc-promo-bl__ancien">{formatAmount(ttcDepuisHT(line.prixUnitaire, line.tauxTva))}</s>}
                        {formatAmount(ttcDepuisHT(p.prixUnitaire, p.tauxTva))} {t("TND")}{article?.unit ? ` · ${article.unit}` : ""}
                        {p.promo && (
                          <span className={`rc-promo-bl${p.promotionId ? "" : " rc-promo-bl--attente"}`}>
                            {p.promo.numero} · {p.promo.texte}
                            {p.remise > 0 ? ` · −${formatAmount(p.remise * (1 + p.tauxTva / 100))}` : ""}
                          </span>
                        )}
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
                    amount={<Money value={htLigne(p) * (1 + p.tauxTva / 100)} />}
                  />
                );
              })}
              {/* Articles offerts par une promotion (« article offert ») : ajoutés à 0. */}
              {offerts.map((o) => {
                const article = articles.find((a) => a.id === o.articleId);
                const name = article?.designation ?? t("Article");
                return (
                  <LineItem
                    key={`offert-${o.articleId}`}
                    leading={<ArticleImage src={article?.img} alt={name} size={44} />}
                    title={name}
                    meta={<span className="rc-promo-bl">{o.promo?.numero} · {t("Offert")}</span>}
                    removeLabel={t("Offert par la promotion")}
                    onRemove={() => undefined}
                    control={<Tag tone="positive">{t("{n} offert(s)", { n: o.quantiteOfferte })}</Tag>}
                    amount={<Money value={0} />}
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
          {scanCameraDisponible() && (
            <Button variant="primary" size="lg" block icon={barcodeOutline} onClick={() => setScanMultiple(true)} disabled={!loaded || articles.length === 0}>
              {t("Scanner plusieurs articles")}
            </Button>
          )}
          <ScanMultiple ouvert={scanMultiple} articles={articles} onValider={ajouterScannes} onFermer={() => setScanMultiple(false)} />
          {user?.role === "ADMIN" && (
            <>
              <Button variant="ghost" block icon={phonePortraitOutline} onClick={() => setImportPda(true)} disabled={!loaded || articles.length === 0}>
                {t("Télécharger depuis le PDA")}
              </Button>
              <ImportCollecteSheet isOpen={importPda} onDismiss={() => setImportPda(false)} destination={t("BL de vente")} onImporter={importerCollecte} />
            </>
          )}
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
            {t("Valider le bon de livraison")}
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

      <PickerSheet
        isOpen={vendeurSheet}
        title={t("Vendeur")}
        value={vendeurId}
        onDismiss={() => setVendeurSheet(false)}
        onSelect={(v) => {
          setVendeurId(v);
          setVendeurSheet(false);
        }}
        options={vendeurs.map((v) => ({ value: v.id, label: v.nom, meta: v.code, keywords: v.code }))}
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
