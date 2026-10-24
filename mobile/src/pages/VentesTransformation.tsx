import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Navigate } from "react-router-dom";
import { IonContent, IonPage, useIonViewWillEnter } from "@ionic/react";
import { checkmarkDoneOutline, documentTextOutline, sparklesOutline, swapHorizontalOutline } from "ionicons/icons";
import { listUsers } from "../api/auth";
import { ApiError } from "../api/client";
import { listFactures, prochainNumeroFactureVente, transformerEnFacture } from "../api/factures";
import type { UserSummary } from "../types/auth";
import type { Facture } from "../types/facture";
import { useAuth } from "../auth/AuthContext";
import TableauBonsFacture from "../components/TableauBonsFacture";
import TransformationIntelligente from "../components/TransformationIntelligente";
import { formatDate, toLocalDateString } from "../utils/format";
const arrondi3 = (n: number) => Math.round(n * 1000) / 1000;
import {
  AccountButton,
  AppHeader,
  Button,
  EmptyState,
  Fab,
  Field,
  Money,
  PageNotice,
  SearchField,
  Sheet,
  TableauDonnees,
} from "../ui";
import type { ColonneDonnees } from "../ui";
import { t, tn } from "../i18n";

const today = toLocalDateString(new Date());

/** Sélection façon explorateur : clic = cette ligne seule, Ctrl / Cmd (ou Maj) + clic = ajouter ou retirer. */
function basculer(sel: Set<string>, id: string, e: MouseEvent | KeyboardEvent): Set<string> {
  if (e.ctrlKey || e.metaKey || e.shiftKey) {
    const n = new Set(sel);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  }
  return sel.size === 1 && sel.has(id) ? new Set() : new Set([id]);
}

/** Ventes › Transformation BL en Facture : choisir des bons de livraison et les regrouper dans une facture. */
export default function VentesTransformation() {
  const { user } = useAuth();
  const [vendeurs, setVendeurs] = useState<UserSummary[]>([]);
  const [recherche, setRecherche] = useState("");

  const [bons, setBons] = useState<Facture[]>([]);
  const [choisis, setChoisis] = useState<Facture[]>([]);
  const [marques1, setMarques1] = useState<Set<string>>(new Set());
  const [marques2, setMarques2] = useState<Set<string>>(new Set());
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const [smart, setSmart] = useState(false);
  const [popup, setPopup] = useState(false);
  const [dateFacture, setDateFacture] = useState(today);
  const [numero, setNumero] = useState("");
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreurPopup, setErreurPopup] = useState<string | null>(null);

  useEffect(() => {
    listUsers()
      .then((l) => setVendeurs(l.filter((u) => u.role === "VENDEUR")))
      .catch(() => undefined);
  }, []);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const liste = await listFactures({ aFacturer: true });
      // Un bon annulé ne se facture pas.
      setBons(liste.filter((b) => b.statut !== "ANNULEE"));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible de charger les bons de livraison"));
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    setChargement(true);
    charger();
  }, [charger]);
  useIonViewWillEnter(() => {
    charger();
  }, [charger]);

  // Numéro AAAA/001 proposé pour l'année de la date choisie (non modifiable).
  useEffect(() => {
    if (!popup) return;
    const annee = Number(dateFacture.slice(0, 4)) || new Date().getFullYear();
    prochainNumeroFactureVente(annee)
      .then((r) => setNumero(r.numero))
      .catch(() => setNumero(""));
  }, [popup, dateFacture]);

  const idsChoisis = useMemo(() => new Set(choisis.map((b) => b.id)), [choisis]);
  const nomVendeur = useCallback((b: Facture) => vendeurs.find((v) => v.id === b.vendeurId)?.nom ?? b.vendeur?.nom ?? "—", [vendeurs]);

  // Tableau de gauche : les bons filtrés, sans ceux déjà passés à droite.
  const disponibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return bons.filter((b) => !idsChoisis.has(b.id) && (!q || String(b.client?.ref ?? "") === q));
  }, [bons, idsChoisis, recherche]);

  const colonnes: ColonneDonnees<Facture>[] = [
    { id: "client", titre: t("N° client"), rendu: (b) => b.client?.ref ?? "—", tri: (b) => b.client?.ref ?? 0, largeur: "110px" },
    { id: "numero", titre: t("N° BL"), principale: true, rendu: (b) => b.numero, tri: (b) => b.numero },
    { id: "date", titre: t("Date"), rendu: (b) => formatDate(b.date), tri: (b) => new Date(b.date).getTime(), largeur: "110px" },
    { id: "vendeur", titre: t("Vendeur"), rendu: nomVendeur, tri: nomVendeur, souple: true },
    { id: "total", titre: t("Total BL"), rendu: (b) => <Money value={b.montantTTC} />, tri: (b) => Number(b.montantTTC), aligne: "end", largeur: "130px" },
  ];

  const passerADroite = (ids: Set<string>) => {
    const pris = bons.filter((b) => ids.has(b.id) && !idsChoisis.has(b.id));
    if (pris.length === 0) return;
    setChoisis((c) => [...c, ...pris]);
    setMarques1(new Set());
  };
  const retirer = (ids: Set<string>) => {
    setChoisis((c) => c.filter((b) => !ids.has(b.id)));
    setMarques2(new Set());
  };

  // Client de la facture : celui des bons choisis, ou « Plusieurs clients » s'ils ne sont pas tous du même client.
  const nomsClients = [...new Set(choisis.map((b) => b.client?.nomCommerce ?? b.clientId))];
  const nomClientFacture = nomsClients.length === 1 ? nomsClients[0] : nomsClients.length > 1 ? t("Plusieurs clients") : "";

  const totalDisponibles = disponibles.reduce((s, b) => s + Number(b.montantTTC), 0);
  const totalChoisis = choisis.reduce((s, b) => s + Number(b.montantTTC), 0);
  const totalHT = choisis.reduce((s, b) => s + Number(b.montantHT), 0);

  const ouvrirPopup = () => {
    setErreurPopup(null);
    setDateFacture(today);
    setNumero("");
    setPopup(true);
  };

  const enregistrer = async () => {
    setEnregistrement(true);
    setErreurPopup(null);
    try {
      const f = await transformerEnFacture({
        date: new Date(`${dateFacture}T12:00:00`).toISOString(),
        bonIds: choisis.map((b) => b.id),
      });
      setPopup(false);
      setChoisis([]);
      setMarques2(new Set());
      setSucces(t("Facture {numero} créée à partir de {n} bons de livraison.", { numero: f.numero, n: choisis.length }));
      await charger();
    } catch (err) {
      setErreurPopup(err instanceof ApiError ? err.message : t("Impossible de créer la facture"));
    } finally {
      setEnregistrement(false);
    }
  };

  if (user && user.role !== "ADMIN") return <Navigate to="/factures" replace />;

  return (
    <IonPage className="rc-page--large">
      <AppHeader large eyebrow={t("Ventes")} title={t("Transformation BL en Facture")} actions={<AccountButton />} />
      <IonContent>
        <Fab icon={sparklesOutline} label={t("Transformation intelligente")} onClick={() => setSmart(true)} />
        <div className="rc-transfo">
          {succes && (
            <PageNotice tone="info" icon={checkmarkDoneOutline} actionLabel={t("Fermer")} onAction={() => setSucces(null)}>
              {succes}
            </PageNotice>
          )}
          {erreur && <PageNotice actionLabel={t("Réessayer")} onAction={() => { setChargement(true); charger(); }}>{erreur}</PageNotice>}

          <div className="rc-transfo__tables">
            <section className="rc-transfo__bloc rc-transfo__bloc--g" aria-label={t("Bons de livraison")}>
              <h2 className="rc-transfo__titre">{t("Bons de livraison")}</h2>
              <div className="rc-transfo__filtres">
                <SearchField value={recherche} onChange={setRecherche} placeholder={t("N° client…")} label={t("Rechercher par numéro de client")} />
              </div>

              <div className="rc-transfo__zone">
              {!chargement && disponibles.length === 0 ? (
                <EmptyState icon={documentTextOutline} title={t("Aucun bon de livraison à transformer.")} message={t("Aucun bon ne correspond à la recherche.")} />
              ) : (
                <TableauDonnees
                  label={t("Bons de livraison")}
                  lignes={disponibles}
                  colonnes={colonnes}
                  cle={(b) => b.id}
                  chevron={false}
                  selectionnee={(b) => marques1.has(b.id)}
                  onOuvrir={(b, e) => setMarques1((s) => basculer(s, b.id, e))}
                  triInitial={{ colonne: "date", inverse: true }}
                  pied={
                    <span className="rc-transfo__pied">
                      <strong>{tn(disponibles.length, "{n} bon de livraison", "{n} bons de livraison")}</strong>
                      <span>
                        {t("Total")} <Money value={totalDisponibles} size="md" />
                      </span>
                    </span>
                  }
                />
              )}
              </div>

              <div className="rc-transfo__actions">
                <Button variant="secondary" disabled={disponibles.length === 0} onClick={() => setMarques1(new Set(disponibles.map((b) => b.id)))}>
                  {t("Tout sélectionner")}
                </Button>
                <Button disabled={marques1.size === 0} onClick={() => passerADroite(marques1)}>
                  {t("Sélectionner ({n})", { n: marques1.size })}
                </Button>
              </div>
            </section>

            <section className="rc-transfo__bloc rc-transfo__bloc--d" aria-label={t("Bons sélectionnés")}>
              <h2 className="rc-transfo__titre">{t("Bons sélectionnés")}</h2>
              <div className="rc-transfo__zone">
              {choisis.length === 0 ? (
                <EmptyState icon={swapHorizontalOutline} title={t("Aucun bon sélectionné.")} message={t("Sélectionnez des bons à gauche (Ctrl + clic pour en choisir plusieurs).")} />
              ) : (
                <TableauDonnees
                  label={t("Bons sélectionnés")}
                  lignes={choisis}
                  colonnes={colonnes}
                  cle={(b) => b.id}
                  chevron={false}
                  selectionnee={(b) => marques2.has(b.id)}
                  onOuvrir={(b, e) => setMarques2((s) => basculer(s, b.id, e))}
                  triInitial={{ colonne: "date", inverse: true }}
                  pied={
                    <span className="rc-transfo__pied">
                      <strong>{tn(choisis.length, "{n} bon de livraison", "{n} bons de livraison")}</strong>
                      <span>
                        {t("Total")} <Money value={totalChoisis} size="md" />
                      </span>
                    </span>
                  }
                />
              )}
              </div>
              <div className="rc-transfo__actions">
                <Button variant="secondary" disabled={choisis.length === 0} onClick={() => setMarques2(new Set(choisis.map((b) => b.id)))}>
                  {t("Tout sélectionner")}
                </Button>
                <Button variant="secondary" disabled={marques2.size === 0} onClick={() => retirer(marques2)}>
                  {t("Retirer ({n})", { n: marques2.size })}
                </Button>
              </div>
            </section>
          </div>

          <div className="rc-transfo__bas">
            <Button size="lg" icon={swapHorizontalOutline} disabled={choisis.length === 0} onClick={ouvrirPopup}>
              {t("Transformer")}
            </Button>
          </div>
        </div>

        <TransformationIntelligente
          isOpen={smart}
          onDismiss={() => setSmart(false)}
          bons={bons}
          onTermine={(n) => {
            setSucces(tn(n, "{n} facture créée par la transformation intelligente.", "{n} factures créées par la transformation intelligente."));
            setChoisis([]);
            setMarques1(new Set());
            setMarques2(new Set());
            charger();
          }}
        />

        <Sheet
          isOpen={popup}
          title={t("Nouvelle facture")}
          large
          onDismiss={() => setPopup(false)}
          footer={
            <div className="rc-transfo__enregistrer">
              <Button size="lg" loading={enregistrement} disabled={!numero || !dateFacture} onClick={enregistrer}>
                {t("Enregistrer")}
              </Button>
            </div>
          }
        >
          <div className="rc-transfo__popup">
            {erreurPopup && <PageNotice>{erreurPopup}</PageNotice>}
            <div className="rc-transfo__entete">
              <Field label={t("N° de facture")} value={numero} readOnly />
              <Field label={t("Client")} value={nomClientFacture} readOnly />
              <Field label={t("Date")} type="date" value={dateFacture} onChange={(v) => setDateFacture(v || today)} />
            </div>
            <TableauBonsFacture bons={choisis} sansDate />
            <div className="rc-transfo__totaux">
              <span>
                {t("Total HT")} <Money value={arrondi3(totalHT)} size="sm" />
              </span>
              <span>
                {t("TVA")} <Money value={arrondi3(totalChoisis - totalHT)} size="sm" />
              </span>
              <strong>
                {t("Total TTC")} <Money value={arrondi3(totalChoisis)} size="lg" />
              </strong>
            </div>
          </div>
        </Sheet>
      </IonContent>
    </IonPage>
  );
}
