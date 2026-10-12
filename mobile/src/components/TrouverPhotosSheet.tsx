import { useEffect, useRef, useState } from "react";
import { imageOutline, playOutline, stopOutline } from "ionicons/icons";
import { photosACercher, trouverPhotos } from "../api/articles";
import { ApiError } from "../api/client";
import { Button, Notice, Sheet } from "../ui";
import { t, tn } from "../i18n";

const LOT = 6;

/**
 * Cherche en ligne la photo des articles qui n'en ont pas, grâce à leur code-barres (bases ouvertes
 * Open Food Facts, Open Beauty Facts…), et enregistre le lien. Se fait par petits lots et peut être
 * arrêtée puis reprise : les articles déjà cherchés ne sont pas redemandés.
 */
export default function TrouverPhotosSheet({
  isOpen,
  onDismiss,
  onFait,
}: {
  isOpen: boolean;
  onDismiss: () => void;
  onFait: () => void;
}) {
  const [total, setTotal] = useState<number | null>(null);
  const [fait, setFait] = useState(0);
  const [trouvees, setTrouvees] = useState(0);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [termine, setTermine] = useState(false);
  const arret = useRef(false);
  const ids = useRef<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setErreur(null);
    setTermine(false);
    setFait(0);
    setTrouvees(0);
    setTotal(null);
    photosACercher()
      .then((r) => {
        ids.current = r.ids;
        setTotal(r.ids.length);
      })
      .catch((err) => setErreur(err instanceof ApiError ? err.message : t("Opération impossible")));
  }, [isOpen]);

  const lancer = async () => {
    arret.current = false;
    setEnCours(true);
    setErreur(null);
    setTermine(false);
    let compteurFait = 0;
    let compteurTrouvees = 0;
    let echecsDeSuite = 0;
    try {
      while (ids.current.length > 0 && !arret.current) {
        const lot = ids.current.slice(0, LOT);
        const { resultats } = await trouverPhotos(lot);
        const aReessayer = new Set(resultats.filter((r) => r.statut === "erreur" || r.statut === "ignoree").map((r) => r.id));
        const termines = lot.filter((id) => !aReessayer.has(id));
        compteurTrouvees += resultats.filter((r) => r.statut === "trouvee").length;
        compteurFait += termines.length;
        ids.current = ids.current.filter((id) => !termines.includes(id));
        // Articles en erreur passagère : renvoyés en fin de file ; trop d'échecs de suite : on s'arrête.
        ids.current = [...ids.current.filter((id) => !aReessayer.has(id)), ...[...aReessayer]];
        echecsDeSuite = termines.length === 0 ? echecsDeSuite + 1 : 0;
        setFait(compteurFait);
        setTrouvees(compteurTrouvees);
        if (echecsDeSuite >= 3) {
          setErreur(t("Les bases en ligne ne répondent pas pour le moment : réessayez dans quelques minutes."));
          break;
        }
      }
      if (ids.current.length === 0) setTermine(true);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Opération impossible"));
    } finally {
      setEnCours(false);
      if (compteurTrouvees > 0) onFait();
    }
  };

  const reste = ids.current.length;
  return (
    <Sheet isOpen={isOpen} title={t("Photos en ligne")} height="auto" onDismiss={() => { arret.current = true; onDismiss(); }}>
      <div className="rc-sheet__form">
        <div className="rc-fields">
          <p className="rc-footnote">
            {t("Cherche la photo de chaque article sans photo avec son code-barres (Open Food Facts et bases sœurs) et enregistre le lien. Complète aussi l'unité et la marque quand elles sont vides. Les produits introuvables ne sont pas redemandés.")}
          </p>
          {total === null && !erreur && <p className="rc-footnote">{t("Calcul…")}</p>}
          {total === 0 && <Notice tone="info">{t("Aucun article à chercher : tous ont une photo ou ont déjà été cherchés.")}</Notice>}
          {total !== null && total > 0 && (
            <p className="rc-footnote" aria-live="polite">
              {enCours || fait > 0
                ? t("{fait} / {total} cherchés · {n} photos trouvées", { fait, total, n: trouvees })
                : tn(total, "{n} article à chercher.", "{n} articles à chercher.")}
            </p>
          )}
          {termine && <Notice tone="info">{t("Recherche terminée : {n} photos trouvées.", { n: trouvees })}</Notice>}
          {erreur && <Notice>{erreur}</Notice>}
          {enCours ? (
            <Button size="lg" block variant="secondary" icon={stopOutline} onClick={() => { arret.current = true; }}>
              {t("Arrêter")}
            </Button>
          ) : (
            <Button size="lg" block icon={fait > 0 && reste > 0 ? playOutline : imageOutline} disabled={!total || reste === 0} onClick={lancer}>
              {fait > 0 && reste > 0 ? t("Reprendre") : t("Chercher les photos")}
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
