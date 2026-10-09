import { useRef, useState } from "react";
import { cloudUploadOutline, downloadOutline } from "ionicons/icons";
import { importerArticles, telechargerModeleArticles } from "../api/societes";
import { ApiError } from "../api/client";
import type { ResultatImport } from "../types/societe";
import { enregistrerFichier, lireFichierBase64 } from "../utils/fichiers";
import { Button, Group, Notice, Row, Section, Sheet } from "../ui";
import { t, tn } from "../i18n";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Import du catalogue depuis Excel : modèle à télécharger, fichier à envoyer,
 * puis le compte rendu (créés, mis à jour, lignes refusées avec leur raison).
 */
export default function ImportArticlesSheet({ isOpen, onDismiss, onImporte }: { isOpen: boolean; onDismiss: () => void; onImporte: () => void }) {
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
      if (r.crees + r.misAJour > 0) onImporte();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Import impossible : vérifiez la connexion et réessayez."));
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
              "Un fichier Excel (.xlsx), une ligne par article. Colonnes : Code, Désignation et Prix vente HT obligatoires ; Marque, Unité, Colisage, Prix achat HT, TVA % et Code-barres facultatives."
            )}
          </p>
          <Button variant="secondary" size="lg" block icon={downloadOutline} loading={modele} onClick={telechargerModele}>
            {t("Télécharger le modèle Excel")}
          </Button>
          <input
            ref={entree}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={(e) => importer(e.target.files?.[0])}
          />
          <Button size="lg" block icon={cloudUploadOutline} loading={envoi} onClick={() => entree.current?.click()}>
            {t("Choisir le fichier Excel")}
          </Button>
          <p className="rc-footnote">{t("Un code déjà présent est mis à jour (prix, désignation…) ; les nouveaux codes sont ajoutés. Les photos s'ajoutent ensuite depuis la fiche de chaque article.")}</p>
          {error && <Notice>{error}</Notice>}
        </div>
      </Section>

      {resultat && (
        <Section label={t("Résultat de l'import")}>
          <Notice tone={resultat.erreurs.length ? "warning" : "info"}>
            {[
              tn(resultat.crees, "{n} article créé", "{n} articles créés"),
              tn(resultat.misAJour, "{n} article mis à jour", "{n} articles mis à jour"),
              resultat.erreurs.length ? tn(resultat.erreurs.length, "{n} ligne refusée", "{n} lignes refusées") : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Notice>
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
