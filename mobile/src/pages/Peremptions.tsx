import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { IonActionSheet, IonAlert, IonContent, IonPage, useIonToast, useIonViewWillEnter } from "@ionic/react";
import { calendarOutline, scanOutline } from "ionicons/icons";
import { scanCameraDisponible, scannerCodeBarre } from "../lib/barcode";
import { getPeremption, modifierDateLot, retirerLot } from "../api/stock";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import ArticleImage from "../components/ArticleImage";
import DaterLotsSheet from "../components/DaterLotsSheet";
import type { ArticleADater, LotPeremption, Peremption } from "../types/lot";
import { articleCorrespond, articleParCode } from "../utils/articleSearch";
import { dateFr, libelleJours } from "../utils/peremption";
import { joinMeta, pieces } from "../utils/format";
import { AppHeader, EmptyState, Fab, FabSpacer, Group, PageNotice, Row, Section, SearchField, SkeletonList, Tag } from "../ui";
import { t, tn } from "../i18n";

/**
 * Péremptions du dépôt : lots expirés ou à surveiller (à retirer ou vérifier), et pièces
 * encore « sans date » des articles périssables (à dater, en scannant le produit ou à la main).
 */
export default function Peremptions() {
  const { user } = useAuth();
  const [donnees, setDonnees] = useState<Peremption | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [aDater, setADater] = useState<ArticleADater | null>(null);
  // Le dernier produit daté venait d'un scan : on enchaîne avec le suivant.
  const [parScan, setParScan] = useState(false);
  const [toast] = useIonToast();
  const [lot, setLot] = useState<LotPeremption | null>(null);
  const [retrait, setRetrait] = useState<LotPeremption | null>(null);
  const [changement, setChangement] = useState<LotPeremption | null>(null);

  const charger = useCallback(async () => {
    try {
      setDonnees(await getPeremption());
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible de charger les données"));
    }
  }, []);
  useEffect(() => {
    void charger();
  }, [charger]);
  useIonViewWillEnter(() => void charger());

  const executer = async (travail: () => Promise<unknown>) => {
    setErreur(null);
    try {
      await travail();
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Opération impossible"));
    }
  };

  const aDaterFiltres = useMemo(
    () => (donnees?.aDater ?? []).filter((a) => articleCorrespond(a.article, recherche)),
    [donnees, recherche],
  );
  const surveiller = (donnees?.lots ?? []).filter((l) => l.statut !== "OK");
  const expires = surveiller.filter((l) => l.statut === "EXPIRE");
  const proches = surveiller.filter((l) => l.statut === "PROCHE");

  const message = (texte: string) => toast({ message: texte, duration: 3500, position: "top", cssClass: "rc-toast" });

  // Scan rapide : le produit scanné ouvre directement la saisie de sa date.
  // `liste` : données à jour (après un enregistrement, l'état n'est pas encore rechargé).
  const scannerProduit = async (liste: ArticleADater[] = donnees?.aDater ?? []) => {
    const resultat = await scannerCodeBarre();
    if ("error" in resultat) return message(resultat.error);
    if (!("code" in resultat)) return;
    const trouve = articleParCode(liste.map((a) => a.article), resultat.code);
    const cible = trouve && liste.find((a) => a.articleId === trouve.id);
    if (cible) {
      setParScan(true);
      setADater(cible);
    } else message(t("Aucune pièce à dater pour ce code-barres (produit inconnu, déjà daté ou non périssable)."));
  };

  // Recherche par scan dans le champ : mêmes règles, sans enchaîner.
  const surScan = (code: string) => {
    const trouve = articleParCode(donnees?.aDater.map((a) => a.article) ?? [], code);
    const cible = trouve && donnees?.aDater.find((a) => a.articleId === trouve.id);
    if (cible) {
      setParScan(false);
      setADater(cible);
    } else setRecherche(code);
  };

  if (user && user.role !== "ADMIN") return <Navigate to="/factures" replace />;

  const ligneLot = (l: LotPeremption) => (
    <Row
      key={l.id}
      thumb
      leading={<ArticleImage src={l.article.img} alt="" size={44} />}
      title={l.article.designation}
      meta={joinMeta([`${l.quantite} ${pieces(l.quantite)}`, t("Expire le {d}", { d: dateFr(l.dateExpiration) })])}
      trailing={<Tag tone={l.statut === "EXPIRE" ? "danger" : "warning"}>{libelleJours(l.joursRestants)}</Tag>}
      chevron
      onClick={() => setLot(l)}
    />
  );

  return (
    <IonPage>
      <AppHeader backHref="/stock" title={t("Dates d'expiration")} />
      <IonContent>
        {erreur && <PageNotice>{erreur}</PageNotice>}

        {!donnees ? (
          <SkeletonList />
        ) : (
          <>
            {expires.length > 0 && (
              <Section label={t("Expirés")} aside={String(expires.length)}>
                <Group>{expires.map(ligneLot)}</Group>
              </Section>
            )}
            {proches.length > 0 && (
              <Section label={t("À vérifier bientôt")} aside={String(proches.length)}>
                <Group>{proches.map(ligneLot)}</Group>
              </Section>
            )}
            {surveiller.length === 0 && (
              <Section>
                <p className="rc-footnote">{t("Aucun produit daté n'est expiré ou proche de l'expiration.")}</p>
              </Section>
            )}

            <Section
              label={t("À dater")}
              aside={donnees.aDater.length > 0 ? tn(donnees.aDater.length, "{n} article", "{n} articles") : undefined}
            >
              {donnees.aDater.length === 0 ? (
                <p className="rc-footnote">{t("Tous les produits périssables en stock ont une date.")}</p>
              ) : (
                <>
                  <SearchField value={recherche} onChange={setRecherche} placeholder={t("Rechercher ou scanner un produit…")} onScan={surScan} />
                  {aDaterFiltres.length === 0 ? (
                    <EmptyState icon={calendarOutline} title={t("Aucun article")} />
                  ) : (
                    <Group>
                      {aDaterFiltres.slice(0, 60).map((a) => (
                        <Row
                          key={a.articleId}
                          thumb
                          leading={<ArticleImage src={a.article.img} alt="" size={44} />}
                          title={a.article.designation}
                          meta={t("{q} sans date", { q: `${a.quantiteSansDate} ${pieces(a.quantiteSansDate)}` })}
                          chevron
                          onClick={() => {
                            setParScan(false);
                            setADater(a);
                          }}
                        />
                      ))}
                    </Group>
                  )}
                  {aDaterFiltres.length > 60 && <p className="rc-footnote">{t("Affinez la recherche pour voir la suite.")}</p>}
                </>
              )}
            </Section>
          </>
        )}
        {scanCameraDisponible() && (
          <>
            <FabSpacer />
            <Fab icon={scanOutline} label={t("Scanner un produit")} onClick={() => void scannerProduit()} />
          </>
        )}
      </IonContent>

      <DaterLotsSheet
        article={aDater}
        onDismiss={() => setADater(null)}
        onFait={async () => {
          setADater(null);
          await charger();
        }}
        onFaitEtSuivant={
          parScan
            ? async () => {
                setADater(null);
                const frais = await getPeremption();
                setDonnees(frais);
                await scannerProduit(frais.aDater);
              }
            : undefined
        }
      />

      <IonActionSheet
        isOpen={lot !== null}
        onDidDismiss={() => setLot(null)}
        header={lot ? `${lot.article.designation} · ${dateFr(lot.dateExpiration)}` : undefined}
        buttons={[
          { text: t("Retirer du stock (jeté / périmé)"), role: "destructive" as const, handler: () => setRetrait(lot) },
          { text: t("Corriger la date"), handler: () => setChangement(lot) },
          { text: t("Annuler"), role: "cancel" as const },
        ]}
      />

      <IonAlert
        isOpen={retrait !== null}
        onDidDismiss={() => setRetrait(null)}
        header={t("Retirer du stock ?")}
        message={retrait ? t("{q} de « {nom} » quitteront le dépôt.", { q: `${retrait.quantite} ${pieces(retrait.quantite)}`, nom: retrait.article.designation }) : undefined}
        buttons={[
          { text: t("Annuler"), role: "cancel" },
          { text: t("Retirer"), role: "destructive", handler: () => { if (retrait) void executer(() => retirerLot(retrait.id)); } },
        ]}
      />

      <IonAlert
        isOpen={changement !== null}
        onDidDismiss={() => setChangement(null)}
        header={t("Corriger la date")}
        inputs={[{ name: "date", type: "date", value: changement?.dateExpiration }]}
        buttons={[
          { text: t("Annuler"), role: "cancel" },
          {
            text: t("Enregistrer"),
            handler: (d: { date?: string }) => {
              if (changement && d.date) void executer(() => modifierDateLot(changement.id, d.date!));
            },
          },
        ]}
      />
    </IonPage>
  );
}
