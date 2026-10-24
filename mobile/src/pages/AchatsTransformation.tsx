import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Navigate } from "react-router-dom";
import { IonContent, IonPage, useIonViewWillEnter } from "@ionic/react";
import { checkmarkDoneOutline, documentTextOutline, storefrontOutline, swapHorizontalOutline } from "ionicons/icons";
import { ApiError } from "../api/client";
import { listAchats, listFournisseurs, transformerBlEnFacture } from "../api/achats";
import type { Achat, Fournisseur } from "../types/achat";
import { useAuth } from "../auth/AuthContext";
import { nomFournisseur } from "../components/achats/nomFournisseur";
import StatutPaiementTag from "../components/achats/StatutPaiementTag";
import { AccountButton, AppHeader, Button, EmptyState, Field, FilterChip, Money, PageNotice, PickerSheet, SearchField, Sheet, TableauDonnees } from "../ui";
import type { ColonneDonnees } from "../ui";
import { formatDate, toLocalDateString } from "../utils/format";
import { t, tn } from "../i18n";

/** Droit de timbre d'une facture (TND). */
const TIMBRE = 1;
const arrondi = (n: number) => Math.round(n * 1000) / 1000;

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

/**
 * Achats › Transformation BL en Facture : quand le fournisseur apporte la facture papier, on choisit ses BL et on
 * crée la facture (numéro du papier, + 1 DT de timbre). Les règlements des BL passent sur la facture ; les BL ne
 * sont plus modifiables et le stock ne bouge pas (il est déjà entré avec les BL).
 */
export default function AchatsTransformation() {
  const { user } = useAuth();
  const aujourdhui = toLocalDateString(new Date());
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [fournisseurId, setFournisseurId] = useState<string | undefined>(undefined);
  const [pickerFournisseur, setPickerFournisseur] = useState(false);
  const [bons, setBons] = useState<Achat[]>([]);
  const [recherche, setRecherche] = useState("");
  const [choisis, setChoisis] = useState<Achat[]>([]);
  const [marques1, setMarques1] = useState<Set<string>>(new Set());
  const [marques2, setMarques2] = useState<Set<string>>(new Set());
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const [popup, setPopup] = useState(false);
  const [numero, setNumero] = useState("");
  const [dateFacture, setDateFacture] = useState(aujourdhui);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreurPopup, setErreurPopup] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      // BL fournisseurs pas encore regroupés dans une facture.
      const liste = await listAchats({ type: "BL" });
      setBons(liste.filter((b) => !b.factureId));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible de charger les bons de livraison"));
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    charger();
    listFournisseurs().then(setFournisseurs).catch(() => undefined);
  }, [charger]);
  useIonViewWillEnter(() => {
    charger();
  }, [charger]);

  // Une facture regroupe les BL d'un seul fournisseur : changer de fournisseur vide la sélection.
  useEffect(() => {
    setChoisis([]);
    setMarques1(new Set());
    setMarques2(new Set());
  }, [fournisseurId]);

  const fournisseur = fournisseurs.find((f) => f.id === fournisseurId);
  // Fournisseurs qui ont des BL à transformer, avec leur nombre.
  const parFournisseur = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bons) m.set(b.fournisseurId, (m.get(b.fournisseurId) ?? 0) + 1);
    return m;
  }, [bons]);

  const idsChoisis = useMemo(() => new Set(choisis.map((b) => b.id)), [choisis]);
  const disponibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return bons.filter((b) => b.fournisseurId === fournisseurId && !idsChoisis.has(b.id) && (!q || b.numero.toLowerCase().includes(q)));
  }, [bons, fournisseurId, idsChoisis, recherche]);

  const colonnes: ColonneDonnees<Achat>[] = [
    { id: "numero", titre: t("N° BL"), principale: true, rendu: (b) => b.numero, tri: (b) => b.numero },
    { id: "date", titre: t("Date"), rendu: (b) => formatDate(b.date), tri: (b) => new Date(b.date).getTime(), largeur: "110px" },
    { id: "paiement", titre: t("Paiement"), rendu: (b) => <StatutPaiementTag statut={b.statut} />, tri: (b) => b.statut, largeur: "130px" },
    { id: "total", titre: t("Total TTC"), rendu: (b) => <Money value={Number(b.montantTTC)} />, tri: (b) => Number(b.montantTTC), aligne: "end", largeur: "130px" },
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

  const totalDisponibles = disponibles.reduce((s, b) => s + Number(b.montantTTC), 0);
  const totalChoisis = choisis.reduce((s, b) => s + Number(b.montantTTC), 0);
  const totalHT = choisis.reduce((s, b) => s + Number(b.montantHT), 0);
  const dejaPaye = choisis.reduce((s, b) => s + b.paye, 0);

  const transformer = async () => {
    setEnregistrement(true);
    setErreurPopup(null);
    try {
      const f = await transformerBlEnFacture({ bonIds: choisis.map((b) => b.id), numero: numero.trim(), date: dateFacture });
      setPopup(false);
      setSucces(t("Facture fournisseur n° {n} créée à partir de {m} BL.", { n: f.numero, m: choisis.length }));
      setChoisis([]);
      await charger();
    } catch (err) {
      setErreurPopup(err instanceof ApiError ? err.message : t("Transformation impossible"));
    } finally {
      setEnregistrement(false);
    }
  };

  if (user && user.role !== "ADMIN") return <Navigate to="/factures" replace />;

  return (
    <IonPage className="rc-page--large">
      <AppHeader large eyebrow={t("Achats")} title={t("Transformation BL en Facture")} actions={<AccountButton />} />
      <IonContent>
        <div className="rc-transfo">
          {succes && (
            <PageNotice tone="info" icon={checkmarkDoneOutline} actionLabel={t("Fermer")} onAction={() => setSucces(null)}>
              {succes}
            </PageNotice>
          )}
          {erreur && <PageNotice actionLabel={t("Réessayer")} onAction={() => { setChargement(true); charger(); }}>{erreur}</PageNotice>}

          <div className="rc-achat__barre">
            <div className="rc-achat__filtres">
              <FilterChip
                label={fournisseur ? nomFournisseur(fournisseur) : t("Choisir le fournisseur")}
                active={Boolean(fournisseur)}
                ariaLabel={t("Fournisseur de la facture")}
                onOpen={() => setPickerFournisseur(true)}
              />
            </div>
            <span className="rc-footnote">{t("Une facture regroupe les BL d'un seul fournisseur.")}</span>
          </div>

          {!fournisseur ? (
            <EmptyState
              icon={storefrontOutline}
              title={t("Choisissez le fournisseur qui a apporté la facture.")}
              message={parFournisseur.size === 0 ? t("Aucun BL fournisseur à transformer.") : tn(parFournisseur.size, "{n} fournisseur a des BL à transformer.", "{n} fournisseurs ont des BL à transformer.")}
              action={
                parFournisseur.size > 0 && (
                  <Button icon={storefrontOutline} onClick={() => setPickerFournisseur(true)}>
                    {t("Choisir le fournisseur")}
                  </Button>
                )
              }
            />
          ) : (
            <div className="rc-transfo__tables">
              <section className="rc-transfo__bloc rc-transfo__bloc--g" aria-label={t("Bons de livraison")}>
                <h2 className="rc-transfo__titre">{t("BL de {nom}", { nom: nomFournisseur(fournisseur, null, false) })}</h2>
                <div className="rc-transfo__filtres">
                  <SearchField value={recherche} onChange={setRecherche} placeholder={t("N° BL…")} label={t("Rechercher par numéro de BL")} />
                </div>
                <div className="rc-transfo__zone">
                  {!chargement && disponibles.length === 0 ? (
                    <EmptyState icon={documentTextOutline} title={t("Aucun BL à transformer pour ce fournisseur.")} />
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
                          <strong>{tn(disponibles.length, "{n} BL", "{n} BL")}</strong>
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

              <section className="rc-transfo__bloc rc-transfo__bloc--d" aria-label={t("BL sélectionnés")}>
                <h2 className="rc-transfo__titre">{t("BL de la facture")}</h2>
                <div className="rc-transfo__zone">
                  {choisis.length === 0 ? (
                    <EmptyState icon={swapHorizontalOutline} title={t("Aucun BL sélectionné.")} message={t("Sélectionnez les BL à gauche (Ctrl + clic pour en choisir plusieurs).")} />
                  ) : (
                    <TableauDonnees
                      label={t("BL sélectionnés")}
                      lignes={choisis}
                      colonnes={colonnes}
                      cle={(b) => b.id}
                      chevron={false}
                      selectionnee={(b) => marques2.has(b.id)}
                      onOuvrir={(b, e) => setMarques2((s) => basculer(s, b.id, e))}
                      triInitial={{ colonne: "date", inverse: true }}
                      pied={
                        <span className="rc-transfo__pied">
                          <strong>{tn(choisis.length, "{n} BL", "{n} BL")}</strong>
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
          )}

          <div className="rc-transfo__bas">
            <Button
              size="lg"
              icon={swapHorizontalOutline}
              disabled={choisis.length === 0}
              onClick={() => {
                setNumero("");
                setDateFacture(aujourdhui);
                setErreurPopup(null);
                setPopup(true);
              }}
            >
              {t("Transformer")}
            </Button>
          </div>
        </div>

        <PickerSheet
          isOpen={pickerFournisseur}
          title={t("Fournisseur")}
          value={fournisseurId}
          onDismiss={() => setPickerFournisseur(false)}
          onSelect={(v) => {
            setFournisseurId(v);
            setPickerFournisseur(false);
          }}
          emptyLabel={t("Aucun fournisseur n'a de BL à transformer.")}
          options={fournisseurs
            .filter((f) => parFournisseur.has(f.id))
            .map((f) => ({ value: f.id, label: nomFournisseur(f), meta: tn(parFournisseur.get(f.id) ?? 0, "{n} BL", "{n} BL"), keywords: `${f.ref} ${f.matriculeFiscal ?? ""}` }))}
        />

        <Sheet
          isOpen={popup}
          title={t("Nouvelle facture fournisseur")}
          height="auto"
          onDismiss={() => setPopup(false)}
          footer={
            <div className="rc-achat__pied">
              <Button size="lg" icon={swapHorizontalOutline} loading={enregistrement} disabled={!numero.trim() || !dateFacture} onClick={transformer}>
                {t("Créer la facture")}
              </Button>
            </div>
          }
        >
          <div className="rc-achat__form">
            {erreurPopup && <PageNotice>{erreurPopup}</PageNotice>}
            <div className="rc-achat__resume">
              <strong>{fournisseur ? nomFournisseur(fournisseur, null, false) : ""}</strong>
              <span>
                {tn(choisis.length, "{n} BL", "{n} BL")} : {choisis.map((b) => b.numero).join(", ")}
              </span>
            </div>
            <div className="rc-achat__ligne2">
              <Field label={t("N° de facture (papier du fournisseur)")} value={numero} onChange={setNumero} required />
              <Field label={t("Date de la facture")} type="date" value={dateFacture} max={aujourdhui} onChange={(v) => setDateFacture(v || aujourdhui)} required />
            </div>
            <div className="rc-transfo__totaux">
              <span>
                {t("Total HT")} <Money value={arrondi(totalHT)} size="sm" />
              </span>
              <span>
                {t("TVA")} <Money value={arrondi(totalChoisis - totalHT)} size="sm" />
              </span>
              <span>
                {t("Total TTC")} <Money value={arrondi(totalChoisis)} size="sm" />
              </span>
              <span>
                {t("Timbre")} <Money value={TIMBRE} size="sm" />
              </span>
              <strong>
                {t("Net à payer")} <Money value={arrondi(totalChoisis + TIMBRE)} size="lg" />
              </strong>
              {dejaPaye > 0 && (
                <span>
                  {t("Déjà réglé sur ces BL")} <Money value={arrondi(dejaPaye)} size="sm" />
                </span>
              )}
            </div>
            <p className="rc-footnote">{t("Les règlements déjà faits sur ces BL passent sur la facture. Les BL ne seront plus modifiables ; le stock ne change pas (il est entré avec les BL).")}</p>
          </div>
        </Sheet>
      </IonContent>
    </IonPage>
  );
}
