import { useRef, useState } from "react";
import { cloudUploadOutline, downloadOutline } from "ionicons/icons";
import { importerArticles, telechargerModeleArticles } from "../api/societes";
import { ApiError } from "../api/client";
import type { ResultatImport } from "../types/societe";
import { enregistrerFichier, ErreurFichier, lireFichierBase64 } from "../utils/fichiers";
import { Button, Group, Notice, Row, Section, Sheet } from "../ui";
import { t, tn } from "../i18n";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Import du catalogue depuis Excel : modèle à télécharger, fichier à envoyer,
 * puis le compte rendu (créés, mis à jour, lignes refusées avec leur raison).
 */
export default function ImportArticlesSheet({
  isOpen,
  onDismiss,
  onImporte,
  onClasser,
}: {
  isOpen: boolean;
  onDismiss: () => void;
  onImporte: () => void;
  /** Ouvre le classement des articles encore sans catégorie. */
  onClasser?: () => void;
}) {
  const entree = useRef<HTMLInputElement>(null);
  const [modele, setModele] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState<ResultatImport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const telechargerModele = async () => {
    setModele(true);
    setError(null);
    try {
      await enregistrerFichier(await telechargerModeleArticles(), "modele-articles.xlsx", XLSX, t("Enregistrer le modèle"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/cancel/i.test(message)) setError(err instanceof ApiError ? err.message : t("Téléchargement impossible : {e}", { e: message }));
    } finally {
      setModele(false);
    }
  };

  const importer = async (fichier: File | undefined) => {
    if (!fichier) return;
    setEnvoi(true);
    setError(null);
    setResultat(null);
    try {
      const r = await importerArticles(await lireFichierBase64(fichier));
      setResultat(r);
      if (r.crees + r.misAJour + (r.classes ?? 0) > 0) onImporte();
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof ErreurFichier ? err.message : t("Import impossible : vérifiez la connexion et réessayez.")
      );
    } finally {
      setEnvoi(false);
      if (entree.current) entree.current.value = "";
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      title={t("Importer les articles")}
      onDismiss={onDismiss}
      onWillPresent={() => {
        setResultat(null);
        setError(null);
      }}
    >
      <Section>
        <div className="rc-fields">
          <p className="rc-footnote">
            {t(
              "Un fichier Excel (.xlsx), une ligne par article. Obligatoires : Code-barres, Désignation et un prix de vente (Prix vente TTC, Prix vente HT, ou Marge % avec Prix achat HT). Facultatives : Réf, Catégorie, Sous-catégorie, Marque, Unité, Colisage, Stock (en pièces), Prix achat HT, TVA %. Les articles gardent l'ordre des lignes du fichier. Un export du logiciel de gestion (Code article, Ctva, Fodec, Prix Gros…) est accepté tel quel. Un fichier avec seulement Code article, Catégorie et Sous-catégorie classe les articles déjà présents."
            )}
          </p>
          <Button variant="secondary" size="lg" block icon={downloadOutline} loading={modele} onClick={telechargerModele}>
            {t("Télécharger le modèle Excel")}
          </Button>
          <input
            ref={entree}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream"
            hidden
            onChange={(e) => importer(e.target.files?.[0])}
          />
          <Button size="lg" block icon={cloudUploadOutline} loading={envoi} onClick={() => entree.current?.click()}>
            {t("Choisir le fichier Excel")}
          </Button>
          <p className="rc-footnote">{t("Un article déjà présent (même Réf, ou même code-barres sans Réf) est mis à jour ; les autres sont ajoutés. Le stock du fichier est versé une seule fois au dépôt (bon « Stock initial »). Les photos s'ajoutent avec la colonne Lien image, ou depuis la fiche de chaque article.")}</p>
          {error && <Notice>{error}</Notice>}
        </div>
      </Section>

      {resultat && (
        <Section label={t("Résultat de l'import")}>
          <Notice tone={resultat.erreurs.length ? "warning" : "info"}>
            {[
              resultat.classes !== undefined && resultat.classes > 0
                ? tn(resultat.classes, "{n} article classé", "{n} articles classés")
                : tn(resultat.crees, "{n} article créé", "{n} articles créés"),
              resultat.classes ? null : tn(resultat.misAJour, "{n} article mis à jour", "{n} articles mis à jour"),
              resultat.categoriesCreees > 0 ? tn(resultat.categoriesCreees, "{n} catégorie créée", "{n} catégories créées") : null,
              resultat.stockInitial > 0
                ? tn(resultat.stockInitial, "stock initial ajouté pour {n} article", "stock initial ajouté pour {n} articles")
                : null,
              resultat.stockIgnore > 0
                ? tn(resultat.stockIgnore, "stock ignoré pour {n} article (déjà approvisionné)", "stock ignoré pour {n} articles (déjà approvisionnés)")
                : null,
              resultat.stockNegatif > 0
                ? tn(resultat.stockNegatif, "stock négatif ignoré pour {n} article", "stock négatif ignoré pour {n} articles")
                : null,
              resultat.erreurs.length ? tn(resultat.erreurs.length, "{n} ligne refusée", "{n} lignes refusées") : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Notice>
          {resultat.sansCategorie > 0 && onClasser && (
            <Button variant="secondary" block onClick={onClasser}>
              {tn(resultat.sansCategorie, "Classer {n} article sans catégorie", "Classer {n} articles sans catégorie")}
            </Button>
          )}
          {resultat.erreurs.length > 0 && (
            <Group>
              {resultat.erreurs.map((e) => (
                <Row key={e.ligne} compact label={t("Ligne {n}", { n: e.ligne })} trailing={<span className="rc-row__note">{e.raison}</span>} />
              ))}
            </Group>
          )}
        </Section>
      )}
    </Sheet>
  );
}
