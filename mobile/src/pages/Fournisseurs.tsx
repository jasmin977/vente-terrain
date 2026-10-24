import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { IonAlert, IonContent, IonPage, useIonViewWillEnter } from "@ionic/react";
import { addOutline, businessOutline, checkmarkDoneOutline, trashOutline } from "ionicons/icons";
import { ApiError } from "../api/client";
import { deleteFournisseur, listFournisseurs } from "../api/achats";
import type { Fournisseur } from "../types/achat";
import { useAuth } from "../auth/AuthContext";
import FournisseurFormSheet from "../components/achats/FournisseurFormSheet";
import { AccountButton, AppHeader, EmptyState, Fab, IconButton, Money, PageNotice, SearchField, TableauDonnees, Tag, useHauteurRestante } from "../ui";
import { nomFournisseur } from "../components/achats/nomFournisseur";
import type { ColonneDonnees } from "../ui";
import { t, tn } from "../i18n";

/** Fournisseurs › Liste des fournisseurs : création, modification, suppression, et ce qu'on leur doit. */
export default function Fournisseurs() {
  const { user } = useAuth();
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [fiche, setFiche] = useState<{ fournisseur: Fournisseur | null } | null>(null);
  const [aSupprimer, setASupprimer] = useState<Fournisseur | null>(null);
  const zone = useRef<HTMLDivElement>(null);
  useHauteurRestante(zone);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      setFournisseurs(await listFournisseurs());
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible de charger les fournisseurs"));
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);
  useIonViewWillEnter(() => {
    charger();
  }, [charger]);

  const affiches = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return fournisseurs;
    return fournisseurs.filter(
      (f) => String(f.ref) === q || f.nom.toLowerCase().includes(q) || (f.matriculeFiscal ?? "").toLowerCase().includes(q) || (f.ville ?? "").toLowerCase().includes(q),
    );
  }, [fournisseurs, recherche]);

  const totalDu = affiches.reduce((s, f) => s + Math.max(0, f.solde), 0);

  const supprimer = async (f: Fournisseur) => {
    setErreur(null);
    try {
      await deleteFournisseur(f.id);
      setInfo(t("Fournisseur {nom} supprimé.", { nom: f.nom }));
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible de supprimer le fournisseur"));
    }
  };

  const colonnes: ColonneDonnees<Fournisseur>[] = [
    { id: "ref", titre: t("N°"), rendu: (f) => (f.divers ? "—" : f.ref), tri: (f) => f.ref, largeur: "70px" },
    {
      id: "nom",
      titre: t("Nom"),
      principale: true,
      rendu: (f) =>
        f.divers ? (
          <span className="rc-achat__solde">
            {nomFournisseur(f, null, false)} <Tag tone="neutral">{t("Achats ponctuels")}</Tag>
          </span>
        ) : (
          f.nom
        ),
      tri: (f) => f.nom,
      souple: true,
    },
    { id: "mf", titre: t("Matricule fiscal"), rendu: (f) => f.matriculeFiscal || "—", tri: (f) => f.matriculeFiscal ?? "", largeur: "190px" },
    { id: "tel", titre: t("Téléphone"), rendu: (f) => f.telephone || "—", largeur: "140px" },
    { id: "ville", titre: t("Ville"), rendu: (f) => f.ville || "—", tri: (f) => f.ville ?? "", largeur: "130px" },
    {
      id: "solde",
      titre: t("Reste à payer"),
      rendu: (f) =>
        f.solde > 0 ? (
          <span className="rc-achat__solde">
            <Money value={f.solde} tone="warning" />
            <Tag tone="warning">{tn(f.nbImpayes, "{n} doc.", "{n} doc.")}</Tag>
          </span>
        ) : (
          <Money value={0} />
        ),
      tri: (f) => f.solde,
      aligne: "end",
      largeur: "200px",
    },
    {
      id: "actions",
      titre: "",
      rendu: (f) =>
        f.divers ? null : (
        <IonIconButtonSupprimer
          onClick={(e) => {
            e.stopPropagation();
            setASupprimer(f);
          }}
        />
      ),
      largeur: "56px",
    },
  ];

  if (user && user.role !== "ADMIN") return <Navigate to="/factures" replace />;

  return (
    <IonPage className="rc-page--large">
      <AppHeader large eyebrow={t("Fournisseurs")} title={t("Liste des fournisseurs")} actions={<AccountButton />} />
      <IonContent>
        <Fab icon={addOutline} label={t("Nouveau fournisseur")} onClick={() => setFiche({ fournisseur: null })} />
        <div className="rc-transfo">
          {info && (
            <PageNotice tone="info" icon={checkmarkDoneOutline} actionLabel={t("Fermer")} onAction={() => setInfo(null)}>
              {info}
            </PageNotice>
          )}
          {erreur && <PageNotice actionLabel={t("Réessayer")} onAction={() => { setChargement(true); charger(); }}>{erreur}</PageNotice>}

          <div className="rc-achat__barre">
            <div className="rc-achat__filtres">
              <SearchField value={recherche} onChange={setRecherche} placeholder={t("N°, nom, MF ou ville…")} label={t("Rechercher un fournisseur")} />
            </div>
          </div>

          {!chargement && affiches.length === 0 ? (
            <EmptyState
              icon={businessOutline}
              title={recherche ? t("Aucun résultat.") : t("Aucun fournisseur.")}
              message={recherche ? undefined : t("Ajoutez vos fournisseurs avec « Nouveau fournisseur ».")}
            />
          ) : (
            <div ref={zone} className="rc-transfo__zone">
              <TableauDonnees
                label={t("Fournisseurs")}
                lignes={affiches}
                colonnes={colonnes}
                cle={(f) => f.id}
                chevron={false}
                onOuvrir={(f) => !f.divers && setFiche({ fournisseur: f })}
                triInitial={{ colonne: "ref" }}
                pied={
                  <span className="rc-transfo__pied">
                    <strong>{tn(affiches.length, "{n} fournisseur", "{n} fournisseurs")}</strong>
                    <span>
                      {t("Reste à payer")} <Money value={totalDu} size="md" />
                    </span>
                  </span>
                }
              />
            </div>
          )}
        </div>

        <FournisseurFormSheet
          isOpen={fiche !== null}
          fournisseur={fiche?.fournisseur}
          onDismiss={() => setFiche(null)}
          onEnregistre={(f) => {
            setInfo(fiche?.fournisseur ? t("Fournisseur {nom} modifié.", { nom: f.nom }) : t("Fournisseur {nom} ajouté (n° {n}).", { nom: f.nom, n: f.ref }));
            charger();
          }}
        />
        <IonAlert
          isOpen={aSupprimer !== null}
          onDidDismiss={() => setASupprimer(null)}
          header={t("Supprimer ce fournisseur ?")}
          message={aSupprimer?.nom}
          buttons={[
            { text: t("Non"), role: "cancel" },
            {
              text: t("Supprimer"),
              role: "destructive",
              handler: () => {
                if (aSupprimer) void supprimer(aSupprimer);
              },
            },
          ]}
        />
      </IonContent>
    </IonPage>
  );
}

function IonIconButtonSupprimer({ onClick }: { onClick: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  return <IconButton icon={trashOutline} tone="danger" size="sm" label={t("Supprimer le fournisseur")} onClick={onClick} />;
}
