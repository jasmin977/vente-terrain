import { useState } from "react";
import { Navigate } from "react-router-dom";
import { IonActionSheet, IonAlert, IonContent, IonPage } from "@ionic/react";
import { addOutline, ellipsisHorizontal, folderOpenOutline } from "ionicons/icons";
import { createCategorie, deleteCategorie, updateCategorie } from "../api/categories";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { Categorie } from "../types/categorie";
import { chemin, enfantsDe, racines, totalArticles } from "../utils/categories";
import { joinMeta } from "../utils/format";
import { useCategories } from "../utils/useCategories";
import { AppHeader, EmptyState, Fab, FabSpacer, Group, IconButton, PageNotice, Row, Section, SkeletonList } from "../ui";
import { t, tn } from "../i18n";

type Saisie = { mode: "nouvelle" } | { mode: "sous"; parent: Categorie } | { mode: "renommer"; cat: Categorie };

/**
 * Arbre des catégories de la société (catégorie › sous-catégorie) : créer, renommer, supprimer.
 * Une catégorie qui contient des articles ou des sous-catégories ne peut pas être supprimée.
 */
export default function Categories() {
  const { user } = useAuth();
  const { categories, chargees, recharger } = useCategories();
  const [action, setAction] = useState<Categorie | null>(null);
  const [saisie, setSaisie] = useState<Saisie | null>(null);
  const [aSupprimer, setASupprimer] = useState<Categorie | null>(null);
  const [delai, setDelai] = useState<Categorie | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (user && user.role !== "ADMIN") return <Navigate to="/factures" replace />;

  const executer = async (travail: () => Promise<unknown>) => {
    setError(null);
    try {
      await travail();
      await recharger();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Opération impossible"));
    }
  };

  const valider = (nom: string) => {
    const s = saisie;
    if (!s || !nom.trim()) return;
    if (s.mode === "renommer") return executer(() => updateCategorie(s.cat.id, { nom }));
    return executer(() => createCategorie(nom, s.mode === "sous" ? s.parent.id : null));
  };

  const titreSaisie = !saisie
    ? ""
    : saisie.mode === "nouvelle"
      ? t("Nouvelle catégorie")
      : saisie.mode === "sous"
        ? t("Nouvelle sous-catégorie de « {nom} »", { nom: saisie.parent.nom })
        : t("Renommer « {nom} »", { nom: saisie.cat.nom });

  const principales = racines(categories);

  return (
    <IonPage>
      <AppHeader backHref="/stock" title={t("Catégories")} />
      <IonContent>
        {error && <PageNotice>{error}</PageNotice>}

        {!chargees ? (
          <SkeletonList thumb={false} />
        ) : principales.length === 0 ? (
          <EmptyState
            icon={folderOpenOutline}
            title={t("Aucune catégorie.")}
            message={t("Créez vos catégories ici, ou importez-les avec les colonnes Catégorie et Sous-catégorie d'un fichier Excel.")}
          />
        ) : (
          principales.map((racine) => {
            const enfants = enfantsDe(categories, racine.id);
            return (
              <Section key={racine.id}>
                <Group>
                  {/* Catégorie principale ; ses sous-catégories suivent, en retrait. */}
                  <Row
                    title={racine.nom}
                    meta={joinMeta([
                      tn(totalArticles(categories, racine.id), "{n} article", "{n} articles"),
                      enfants.length === 0 && t("Aucune sous-catégorie"),
                      racine.perissable && t("Dates suivies · alerte {n} j", { n: racine.alerteJours ?? 30 }),
                    ])}
                    trailing={<IconButton icon={ellipsisHorizontal} label={t("Options de « {nom} »", { nom: racine.nom })} size="sm" onClick={() => setAction(racine)} />}
                  />
                  {enfants.map((e) => (
                    <Row
                      key={e.id}
                      compact
                      className="rc-row--niveau2"
                      title={e.nom}
                      chevron
                      onClick={() => setAction(e)}
                      trailing={<span className="rc-row__note">{tn(e.nbArticles, "{n} article", "{n} articles")}</span>}
                    />
                  ))}
                </Group>
              </Section>
            );
          })
        )}
        <FabSpacer />
        <Fab icon={addOutline} label={t("Nouvelle catégorie")} onClick={() => setSaisie({ mode: "nouvelle" })} />
      </IonContent>

      <IonActionSheet
        isOpen={action !== null}
        onDidDismiss={() => setAction(null)}
        header={action ? chemin(categories, action.id) : undefined}
        buttons={[
          { text: t("Renommer"), handler: () => { if (action) setSaisie({ mode: "renommer", cat: action }); } },
          ...(action && !action.parentId ? [{ text: t("Ajouter une sous-catégorie"), handler: () => { setSaisie({ mode: "sous", parent: action }); } }] : []),
          // Le suivi se règle sur la catégorie principale : ses sous-catégories le reprennent.
          ...(action && !action.parentId
            ? [
                {
                  text: action.perissable ? t("Ne plus suivre les dates d'expiration") : t("Suivre les dates d'expiration"),
                  handler: () => { void executer(() => updateCategorie(action.id, { perissable: !action.perissable })); },
                },
                ...(action.perissable ? [{ text: t("Délai d'alerte"), handler: () => { setDelai(action); } }] : []),
              ]
            : []),
          { text: t("Supprimer"), role: "destructive" as const, handler: () => { if (action) setASupprimer(action); } },
          { text: t("Annuler"), role: "cancel" as const },
        ]}
      />

      <IonAlert
        isOpen={saisie !== null}
        onDidDismiss={() => setSaisie(null)}
        header={titreSaisie}
        inputs={[{ name: "nom", type: "text", placeholder: t("Nom"), value: saisie?.mode === "renommer" ? saisie.cat.nom : "", attributes: { maxlength: 60 } }]}
        buttons={[
          { text: t("Annuler"), role: "cancel" },
          { text: t("Enregistrer"), handler: (d: { nom?: string }) => void valider(d.nom ?? "") },
        ]}
      />

      <IonAlert
        isOpen={delai !== null}
        onDidDismiss={() => setDelai(null)}
        header={t("Délai d'alerte")}
        message={t("Nombre de jours avant l'expiration où un lot est signalé.")}
        inputs={[{ name: "jours", type: "number", min: 1, max: 730, value: delai?.alerteJours ?? 30 }]}
        buttons={[
          { text: t("Annuler"), role: "cancel" },
          {
            text: t("Enregistrer"),
            handler: (d: { jours?: string }) => {
              const n = Math.trunc(Number(d.jours));
              if (delai && n >= 1 && n <= 730) void executer(() => updateCategorie(delai.id, { alerteJours: n }));
            },
          },
        ]}
      />

      <IonAlert
        isOpen={aSupprimer !== null}
        onDidDismiss={() => setASupprimer(null)}
        header={t("Supprimer « {nom} » ?", { nom: aSupprimer?.nom ?? "" })}
        message={t("Seule une catégorie vide peut être supprimée.")}
        buttons={[
          { text: t("Annuler"), role: "cancel" },
          { text: t("Supprimer"), role: "destructive", handler: () => { if (aSupprimer) void executer(() => deleteCategorie(aSupprimer.id)); } },
        ]}
      />
    </IonPage>
  );
}
