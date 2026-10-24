import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { IonAlert, IonContent, IonPage, useIonViewWillEnter } from "@ionic/react";
import { checkmarkDoneOutline, documentTextOutline, downloadOutline, printOutline, trashOutline } from "ionicons/icons";
import {
  getFactureVente,
  listFacturesVente,
  supprimerFactureVente,
  type FactureVente,
  type FactureVenteDetail,
} from "../api/factures";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import TableauBonsFacture from "../components/TableauBonsFacture";
import { imprimerFactureImprimante, telechargerFactureA4 } from "../utils/bonPdf";
import { formatDate, toLocalDateString } from "../utils/format";
import { AccountButton, AppHeader, Button, EmptyState, Field, Money, PageNotice, Sheet, TableauDonnees, useHauteurRestante } from "../ui";
import type { ColonneDonnees } from "../ui";
import { t, tn } from "../i18n";

/** Net à payer d'une facture : TTC + timbre. */
const net = (f: { montantTTC: number; timbre?: number }) => Math.round((Number(f.montantTTC) + Number(f.timbre ?? 1)) * 1000) / 1000;
const arrondi3 = (n: number) => Math.round(n * 1000) / 1000;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ventes › Factures : les factures établies à partir des bons de livraison. */
export default function VentesFactures() {
  const { user } = useAuth();
  const [factures, setFactures] = useState<FactureVente[]>([]);
  const [du, setDu] = useState("");
  const [au, setAu] = useState("");
  const [choisies, setChoisies] = useState<Set<string>>(new Set());
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Téléchargement / impression en série : « Impression 2 / 5 ».
  const [serie, setSerie] = useState<{ action: "telecharger" | "imprimer"; fait: number; total: number } | null>(null);

  const [ouverte, setOuverte] = useState<FactureVenteDetail | null>(null);
  const [travail, setTravail] = useState<"supprimer" | "telecharger" | "imprimer" | null>(null);
  const [erreurPopup, setErreurPopup] = useState<string | null>(null);
  const zoneTableau = useRef<HTMLDivElement>(null);
  useHauteurRestante(zoneTableau);
  const [confirmerSuppression, setConfirmerSuppression] = useState(false);
  const [confirmerSelection, setConfirmerSelection] = useState(false);
  const [suppression, setSuppression] = useState<{ fait: number; total: number } | null>(null);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      setFactures(await listFacturesVente({ dateFrom: du || undefined, dateTo: au || undefined }));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible de charger les factures"));
    } finally {
      setChargement(false);
    }
  }, [du, au]);

  useEffect(() => {
    setChargement(true);
    charger();
  }, [charger]);
  useIonViewWillEnter(() => {
    charger();
  }, [charger]);

  // Une facture supprimée ailleurs ne reste pas cochée.
  useEffect(() => {
    setChoisies((s) => {
      const ids = new Set(factures.map((f) => f.id));
      const reste = new Set([...s].filter((id) => ids.has(id)));
      return reste.size === s.size ? s : reste;
    });
  }, [factures]);

  // Un clic en dehors des lignes, de la barre de sélection et des fenêtres ouvertes désélectionne tout.
  useEffect(() => {
    if (choisies.size === 0) return;
    const dehors = (e: MouseEvent) => {
      const cible = e.target as Element | null;
      if (!cible || !cible.isConnected) return;
      if (cible.closest(".rc-tdonnees tbody tr, .rc-factures__selection, ion-modal, ion-alert, ion-popover, .rc-appbar")) return;
      setChoisies(new Set());
    };
    document.addEventListener("mousedown", dehors);
    return () => document.removeEventListener("mousedown", dehors);
  }, [choisies.size]);

  const basculer = (id: string) =>
    setChoisies((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const ouvrir = async (id: string) => {
    setErreurPopup(null);
    setErreur(null);
    try {
      const f = await getFactureVente(id);
      setOuverte(f);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible de charger la facture"));
    }
  };

  const colonnes: ColonneDonnees<FactureVente>[] = [
    {
      id: "choix",
      titre: "",
      largeur: "48px",
      rendu: (f) => (
        <input
          type="checkbox"
          className="rc-transfo__case"
          checked={choisies.has(f.id)}
          aria-label={t("Sélectionner la facture {numero}", { numero: f.numero })}
          onClick={(e) => e.stopPropagation()}
          onChange={() => basculer(f.id)}
        />
      ),
    },
    { id: "numero", titre: t("N° de facture"), principale: true, rendu: (f) => f.numero, tri: (f) => f.numero },
    { id: "date", titre: t("Date"), rendu: (f) => formatDate(f.date), tri: (f) => new Date(f.date).getTime() + (Number(f.numero.split("/")[1]) || 0), largeur: "180px" },
    { id: "client", titre: t("Client"), rendu: (f) => f.client?.nomCommerce ?? "—", tri: (f) => f.client?.nomCommerce ?? "", souple: true },
    { id: "total", titre: t("Net à payer"), rendu: (f) => <Money value={net(f)} />, tri: (f) => net(f), aligne: "end", largeur: "180px" },
  ];

  const total = factures.reduce((s, f) => s + net(f), 0);

  /** Une facture après l'autre : chaque PDF est généré puis téléchargé / envoyé à l'impression avant de passer à la suivante. */
  const executer = async (action: "telecharger" | "imprimer") => {
    const ids = factures.filter((f) => choisies.has(f.id)).map((f) => f.id);
    if (ids.length === 0) return;
    setErreur(null);
    setInfo(null);
    let fait = 0;
    try {
      for (const id of ids) {
        setSerie({ action, fait, total: ids.length });
        const f = await getFactureVente(id);
        if (action === "telecharger") {
          await telechargerFactureA4(f);
          await pause(450); // laisse le navigateur accepter chaque téléchargement
        } else {
          await imprimerFactureImprimante(f);
          await pause(300);
        }
        fait++;
      }
      setInfo(action === "telecharger" ? t("{n} facture(s) téléchargée(s).", { n: fait }) : t("{n} facture(s) envoyée(s) à l'impression.", { n: fait }));
    } catch (err) {
      setErreur(`${err instanceof ApiError ? err.message : t("Opération interrompue")} (${fait}/${ids.length})`);
    } finally {
      setSerie(null);
    }
  };

  // Supprime toutes les factures cochées, la plus récente d'abord (le numéro libéré est alors réutilisé).
  const supprimerSelection = async () => {
    const aSupprimer = factures
      .filter((f) => choisies.has(f.id))
      .sort((a, b) => b.numero.localeCompare(a.numero, undefined, { numeric: true }));
    if (aSupprimer.length === 0) return;
    setErreur(null);
    setInfo(null);
    let fait = 0;
    try {
      for (const f of aSupprimer) {
        setSuppression({ fait, total: aSupprimer.length });
        await supprimerFactureVente(f.id);
        fait++;
      }
      setInfo(tn(fait, "{n} facture supprimée : ses bons de livraison sont de nouveau disponibles.", "{n} factures supprimées : leurs bons de livraison sont de nouveau disponibles."));
    } catch (err) {
      setErreur(`${err instanceof ApiError ? err.message : t("Opération interrompue")} (${fait}/${aSupprimer.length})`);
    } finally {
      setSuppression(null);
      setChoisies(new Set());
      await charger();
    }
  };

  const executerPopup = async (action: "telecharger" | "imprimer") => {
    if (!ouverte) return;
    setTravail(action);
    setErreurPopup(null);
    try {
      if (action === "telecharger") await telechargerFactureA4(ouverte);
      else await imprimerFactureImprimante(ouverte);
    } catch (err) {
      setErreurPopup(err instanceof Error ? err.message : t("Opération interrompue"));
    } finally {
      setTravail(null);
    }
  };

  const supprimer = async () => {
    if (!ouverte) return;
    const { id, numero, bons } = ouverte;
    setTravail("supprimer");
    setErreurPopup(null);
    try {
      await supprimerFactureVente(id);
      setOuverte(null);
      setInfo(t("Facture {numero} supprimée : ses {n} bons de livraison sont de nouveau disponibles.", { numero, n: bons.length }));
      await charger();
    } catch (err) {
      setErreurPopup(err instanceof ApiError ? err.message : t("Impossible de supprimer la facture"));
    } finally {
      setTravail(null);
    }
  };

  const ordonnees = useMemo(() => factures, [factures]);
  if (user && user.role !== "ADMIN") return <Navigate to="/factures" replace />;
  const occupe = travail !== null;

  return (
    <IonPage className="rc-page--large">
      <AppHeader large eyebrow={t("Ventes")} title={t("Liste des factures")} actions={<AccountButton />} />
      <IonContent>
        <div className="rc-transfo">
          {info && (
            <PageNotice tone="info" icon={checkmarkDoneOutline} actionLabel={t("Fermer")} onAction={() => setInfo(null)}>
              {info}
            </PageNotice>
          )}
          {erreur && <PageNotice actionLabel={t("Réessayer")} onAction={() => { setChargement(true); charger(); }}>{erreur}</PageNotice>}

          <div className="rc-factures__barre">
            <div className="rc-transfo__dates">
              <Field label={t("Du")} type="date" value={du} max={au || undefined} onChange={setDu} />
              <Field label={t("Au")} type="date" value={au} min={du || undefined} onChange={setAu} />
            </div>
            {(du || au) && (
              <Button variant="ghost" onClick={() => { setDu(""); setAu(""); }}>
                {t("Toutes les dates")}
              </Button>
            )}
          </div>

          {choisies.size > 0 && (
            <div className="rc-factures__selection" role="toolbar" aria-label={t("Factures sélectionnées")}>
              <strong>{tn(choisies.size, "{n} facture sélectionnée", "{n} factures sélectionnées")}</strong>
              <div className="rc-factures__boutons">
                <Button variant="secondary" disabled={choisies.size === factures.length || serie !== null} onClick={() => setChoisies(new Set(factures.map((f) => f.id)))}>
                  {t("Tout sélectionner")}
                </Button>
                <Button variant="secondary" icon={downloadOutline} loading={serie?.action === "telecharger"} disabled={serie !== null} onClick={() => executer("telecharger")}>
                  {serie?.action === "telecharger" ? t("Téléchargement {a} / {b}", { a: serie.fait + 1, b: serie.total }) : t("Télécharger")}
                </Button>
                <Button variant="secondary" icon={printOutline} loading={serie?.action === "imprimer"} disabled={serie !== null} onClick={() => executer("imprimer")}>
                  {serie?.action === "imprimer" ? t("Impression {a} / {b}", { a: serie.fait + 1, b: serie.total }) : t("Imprimer")}
                </Button>
                <Button variant="danger" icon={trashOutline} loading={suppression !== null} disabled={serie !== null || suppression !== null} onClick={() => setConfirmerSelection(true)}>
                  {suppression ? t("Suppression {a} / {b}", { a: suppression.fait + 1, b: suppression.total }) : t("Tout supprimer")}
                </Button>
                <Button variant="ghost" disabled={serie !== null || suppression !== null} onClick={() => setChoisies(new Set())}>
                  {t("Désélectionner")}
                </Button>
              </div>
            </div>
          )}

          {!chargement && ordonnees.length === 0 ? (
            <EmptyState icon={documentTextOutline} title={t("Aucune facture.")} message={t("Les factures créées depuis « Transformation BL en Facture » apparaissent ici.")} />
          ) : (
            <div ref={zoneTableau} className="rc-transfo__zone rc-transfo__zone--factures">
            <TableauDonnees
              label={t("Factures")}
              lignes={ordonnees}
              colonnes={colonnes}
              cle={(f) => f.id}
              chevron={false}
              selectionnee={(f) => choisies.has(f.id)}
              onOuvrir={(f, e) => (e.ctrlKey || e.metaKey || e.shiftKey ? basculer(f.id) : ouvrir(f.id))}
              triInitial={{ colonne: "date", inverse: true }}
              pied={
                <span className="rc-transfo__pied">
                  <strong>{tn(ordonnees.length, "{n} facture", "{n} factures")}</strong>
                  <span>
                    {t("Total")} <Money value={arrondi3(total)} size="sm" />
                  </span>
                </span>
              }
            />
            </div>
          )}
        </div>

        <Sheet
          isOpen={ouverte !== null}
          title={ouverte ? t("Facture {numero}", { numero: ouverte.numero }) : ""}
          large
          onDismiss={() => setOuverte(null)}
          footer={
            <div className="rc-factures__pied-popup">
              <Button variant="danger" icon={trashOutline} disabled={occupe} onClick={() => setConfirmerSuppression(true)}>
                {t("Supprimer")}
              </Button>
              <div className="rc-factures__boutons">
                <Button variant="secondary" icon={downloadOutline} loading={travail === "telecharger"} disabled={occupe} onClick={() => executerPopup("telecharger")}>
                  {t("Télécharger")}
                </Button>
                <Button variant="secondary" icon={printOutline} loading={travail === "imprimer"} disabled={occupe} onClick={() => executerPopup("imprimer")}>
                  {t("Imprimer")}
                </Button>
              </div>
            </div>
          }
        >
          {ouverte && (
            <div className="rc-transfo__popup">
              {erreurPopup && <PageNotice>{erreurPopup}</PageNotice>}
              <div className="rc-transfo__entete">
                <Field label={t("N° de facture")} value={ouverte.numero} readOnly />
                <Field label={t("Client")} value={ouverte.client?.nomCommerce ?? ""} readOnly />
                <Field label={t("Date")} value={formatDate(ouverte.date)} readOnly />
              </div>
              <TableauBonsFacture bons={ouverte.bons} />
              <div className="rc-transfo__totaux">
                <span>
                  {t("Total HT")} <Money value={Number(ouverte.montantHT)} size="sm" />
                </span>
                <span>
                  {t("TVA")} <Money value={Number(ouverte.montantTVA)} size="sm" />
                </span>
                <span>
                  {t("Total TTC")} <Money value={Number(ouverte.montantTTC)} size="sm" />
                </span>
                <span>
                  {t("Timbre")} <Money value={Number(ouverte.timbre ?? 1)} size="sm" />
                </span>
                <strong>
                  {t("Net à payer")} <Money value={net(ouverte)} size="lg" />
                </strong>
              </div>
            </div>
          )}
        </Sheet>

        <IonAlert
          isOpen={confirmerSelection}
          onDidDismiss={() => setConfirmerSelection(false)}
          header={tn(choisies.size, "Supprimer {n} facture ?", "Supprimer {n} factures ?")}
          message={t("Leurs bons de livraison redeviennent disponibles dans « Transformation BL en Facture ».")}
          buttons={[
            { text: t("Non"), role: "cancel" },
            { text: t("Tout supprimer"), role: "destructive", handler: supprimerSelection },
          ]}
        />
        <IonAlert
          isOpen={confirmerSuppression}
          onDidDismiss={() => setConfirmerSuppression(false)}
          header={t("Supprimer la facture ?")}
          message={t("Ses bons de livraison redeviennent disponibles dans « Transformation BL en Facture ».")}
          buttons={[
            { text: t("Non"), role: "cancel" },
            { text: t("Supprimer la facture"), role: "destructive", handler: supprimer },
          ]}
        />
      </IonContent>
    </IonPage>
  );
}
