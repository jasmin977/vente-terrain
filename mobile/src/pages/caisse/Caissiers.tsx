import { useCallback, useEffect, useState } from "react";
import { IonContent, IonPage, useIonViewWillEnter } from "@ionic/react";
import { addOutline, personCircleOutline, trashOutline } from "ionicons/icons";
import { ApiError } from "../../api/client";
import { creerCaissier, listCaissiers, modifierCaissier, supprimerCaissier } from "../../api/caisse";
import { DROITS_CAISSIER, type Caissier, type DroitCaissier, type DroitsCaissier } from "../../types/caisse";
import { AccountButton, AppHeader, Button, EmptyState, Fab, Field, Notice, PageNotice, Sheet, TableauDonnees, Tag } from "../../ui";
import type { ColonneDonnees } from "../../ui";
import { t, tn } from "../../i18n";
import GardeSupermarche from "./GardeSupermarche";

const LIBELLES_DROITS: Record<DroitCaissier, { titre: string; detail: string }> = {
  remise: { titre: "Remises", detail: "Remise en valeur ou en % sur une ligne ou le ticket" },
  annulerLigne: { titre: "Annuler une ligne", detail: "Retirer un article déjà passé" },
  annulerTicket: { titre: "Annuler un ticket", detail: "Abandonner le ticket en cours" },
  retour: { titre: "Retours", detail: "Reprendre un article et rembourser le client" },
  prelevement: { titre: "Prélèvements", detail: "Retirer des espèces du tiroir en cours de journée" },
  rapportX: { titre: "Rapport X", detail: "Voir les totaux de la session sans la clôturer" },
  cloture: { titre: "Clôture (Z)", detail: "Compter les espèces et fermer la session" },
  tiroir: { titre: "Ouvrir le tiroir", detail: "Ouvrir le tiroir-caisse sans vente" },
};

const DROITS_DEFAUT: DroitsCaissier = { remise: false, annulerLigne: true, annulerTicket: false, retour: false, prelevement: true, rapportX: false, cloture: true, tiroir: false };
const TOUS_DROITS: DroitsCaissier = Object.fromEntries(DROITS_CAISSIER.map((d) => [d, true])) as DroitsCaissier;

/** Caisse › Caissiers : nom, code de connexion à la caisse (4 à 6 chiffres) et droits sur les actions sensibles. */
export default function Caissiers() {
  const [liste, setListe] = useState<Caissier[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<Caissier | "nouveau" | null>(null);
  const [nom, setNom] = useState("");
  const [code, setCode] = useState("");
  const [droits, setDroits] = useState<DroitsCaissier>(DROITS_DEFAUT);
  const [actif, setActif] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [erreurFiche, setErreurFiche] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      setListe(await listCaissiers());
      setErreur(null);
    } catch (err) {
      setListe([]);
      setErreur(err instanceof ApiError ? err.message : t("Impossible de charger les caissiers"));
    }
  }, []);
  useEffect(() => {
    void charger();
  }, [charger]);
  useIonViewWillEnter(() => void charger(), [charger]);

  const caissier = ouvert && ouvert !== "nouveau" ? ouvert : null;
  const ouvrir = (c: Caissier | null) => {
    setNom(c?.nom ?? "");
    setCode("");
    setDroits(c?.droits ?? DROITS_DEFAUT);
    setActif(c?.actif ?? true);
    setErreurFiche(null);
    setOuvert(c ?? "nouveau");
  };
  const codeValide = code === "" ? Boolean(caissier) : /^\d{4,6}$/.test(code);

  const enregistrer = async () => {
    setEnCours(true);
    setErreurFiche(null);
    try {
      const body = { nom: nom.trim(), droits, actif, ...(code ? { code } : {}) };
      if (caissier) await modifierCaissier(caissier.id, body);
      else await creerCaissier(body);
      await charger();
      setOuvert(null);
    } catch (err) {
      setErreurFiche(err instanceof ApiError ? err.message : t("Échec de l'enregistrement"));
    } finally {
      setEnCours(false);
    }
  };

  const supprimer = async () => {
    if (!caissier || !window.confirm(t("Supprimer le caissier « {n} » ? Ses tickets restent dans les rapports.", { n: caissier.nom }))) return;
    setEnCours(true);
    try {
      await supprimerCaissier(caissier.id);
      await charger();
      setOuvert(null);
    } catch (err) {
      setErreurFiche(err instanceof ApiError ? err.message : t("Échec de la suppression"));
    } finally {
      setEnCours(false);
    }
  };

  const colonnes: ColonneDonnees<Caissier>[] = [
    { id: "nom", titre: t("Caissier"), principale: true, rendu: (c) => <strong>{c.nom}</strong>, tri: (c) => c.nom, largeur: "220px" },
    {
      id: "droits",
      titre: t("Droits"),
      souple: true,
      rendu: (c) => {
        const ok = DROITS_CAISSIER.filter((d) => c.droits[d]);
        return ok.length === DROITS_CAISSIER.length ? t("Tous les droits") : ok.length === 0 ? t("Vente seulement") : ok.map((d) => t(LIBELLES_DROITS[d].titre)).join(" · ");
      },
    },
    {
      id: "actif",
      titre: t("Statut"),
      rendu: (c) => (
        <Tag tone={c.actif ? "positive" : "neutral"} dot>
          {c.actif ? t("Actif") : t("Désactivé")}
        </Tag>
      ),
      tri: (c) => (c.actif ? 0 : 1),
      largeur: "120px",
    },
  ];

  return (
    <IonPage className="rc-page--large">
      <AppHeader large eyebrow={t("Caisse")} title={t("Caissiers")} actions={<AccountButton />} />
      <IonContent>
        <GardeSupermarche>
          <Fab icon={addOutline} label={t("Nouveau caissier")} onClick={() => ouvrir(null)} />
          <div className="rc-transfo">
            {erreur && <PageNotice>{erreur}</PageNotice>}
            {liste && liste.length === 0 ? (
              <EmptyState icon={personCircleOutline} title={t("Aucun caissier.")} message={t("Chaque caissier se connecte à la caisse avec son propre code.")} />
            ) : (
              <div className="rc-transfo__zone">
                <TableauDonnees
                  label={t("Caissiers")}
                  lignes={liste ?? []}
                  colonnes={colonnes}
                  cle={(c) => c.id}
                  onOuvrir={(c) => ouvrir(c)}
                  triInitial={{ colonne: "nom" }}
                  pied={<strong>{tn(liste?.length ?? 0, "{n} caissier", "{n} caissiers")}</strong>}
                />
              </div>
            )}
          </div>

          <Sheet
            isOpen={ouvert !== null}
            title={caissier ? caissier.nom : t("Nouveau caissier")}
            onDismiss={() => setOuvert(null)}
            footer={
              <Button size="lg" block loading={enCours} disabled={!nom.trim() || !codeValide || enCours} onClick={() => void enregistrer()}>
                {caissier ? t("Enregistrer") : t("Créer le caissier")}
              </Button>
            }
          >
            <div className="rc-fields rc-sheet__form">
              {erreurFiche && <Notice>{erreurFiche}</Notice>}
              <Field label={t("Nom")} value={nom} onChange={setNom} required />
              <Field
                label={caissier ? t("Nouveau code") : t("Code de connexion")}
                value={code}
                onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                type="password"
                autoComplete="new-password"
                error={code && !codeValide ? t("4 à 6 chiffres") : null}
                hint={caissier ? t("Vide : le code ne change pas.") : t("4 à 6 chiffres, différent pour chaque caissier.")}
              />

              <div className="rc-caisse-droits">
                <div className="rc-caisse-droits__tete">
                  <strong>{t("Droits")}</strong>
                  <button type="button" className="rc-lien" onClick={() => setDroits(TOUS_DROITS)}>
                    {t("Tout cocher")}
                  </button>
                </div>
                {DROITS_CAISSIER.map((d) => (
                  <label key={d} className="rc-caisse-case">
                    <input type="checkbox" checked={droits[d]} onChange={(e) => setDroits((x) => ({ ...x, [d]: e.target.checked }))} />
                    <span>
                      <strong>{t(LIBELLES_DROITS[d].titre)}</strong>
                      <small>{t(LIBELLES_DROITS[d].detail)}</small>
                    </span>
                  </label>
                ))}
                <p className="rc-footnote">{t("Sans le droit, la caisse demande le code d'un caissier qui l'a (responsable).")}</p>
              </div>

              {caissier && (
                <>
                  <label className="rc-caisse-case">
                    <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} />
                    <span>
                      <strong>{t("Caissier actif")}</strong>
                      <small>{t("Désactivé, il ne peut plus se connecter aux caisses.")}</small>
                    </span>
                  </label>
                  <Button variant="danger" icon={trashOutline} disabled={enCours} onClick={() => void supprimer()}>
                    {t("Supprimer le caissier")}
                  </Button>
                </>
              )}
            </div>
          </Sheet>
        </GardeSupermarche>
      </IonContent>
    </IonPage>
  );
}
