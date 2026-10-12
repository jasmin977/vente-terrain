import { useEffect, useState } from "react";
import { addOutline, checkmarkOutline, closeOutline, scanOutline } from "ionicons/icons";
import { daterLots } from "../api/stock";
import { ApiError } from "../api/client";
import type { ArticleADater } from "../types/lot";
import { Button, Field, IconButton, Notice, Sheet } from "../ui";
import ChampDateExpiration from "./ChampDateExpiration";
import { pieces } from "../utils/format";
import { t } from "../i18n";

interface Saisie {
  date: string;
  quantite: string;
}

/**
 * Donne une date d'expiration aux pièces du dépôt qui n'en ont pas : une date pour tout, ou
 * plusieurs dates quand le stock vient de livraisons différentes. Les pièces non datées restent
 * « sans date ».
 */
export default function DaterLotsSheet({
  article,
  onDismiss,
  onFait,
  onFaitEtSuivant,
}: {
  article: ArticleADater | null;
  onDismiss: () => void;
  onFait: () => void | Promise<void>;
  /** Scan rapide : enregistre puis rouvre le scanner pour le produit suivant. */
  onFaitEtSuivant?: () => void | Promise<void>;
}) {
  const [lignes, setLignes] = useState<Saisie[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (article) {
      setLignes([{ date: "", quantite: String(article.quantiteSansDate) }]);
      setErreur(null);
    }
  }, [article]);

  const total = article?.quantiteSansDate ?? 0;
  const saisi = lignes.reduce((s, l) => s + (Number(l.quantite) || 0), 0);
  const complet = lignes.every((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.date) && Number(l.quantite) > 0);
  const trop = saisi > total + 1e-9;
  const maj = (i: number, champ: keyof Saisie, v: string) => setLignes((ls) => ls.map((l, k) => (k === i ? { ...l, [champ]: v } : l)));

  const enregistrer = async (suivant = false) => {
    if (!article) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await daterLots(article.articleId, lignes.map((l) => ({ dateExpiration: l.date, quantite: Number(l.quantite) })));
      await (suivant && onFaitEtSuivant ? onFaitEtSuivant() : onFait());
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Opération impossible"));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Sheet
      isOpen={article !== null}
      title={article?.article.designation ?? ""}
      height="auto"
      onDismiss={onDismiss}
    >
      <div className="rc-sheet__form">
        <div className="rc-fields">
          <p className="rc-footnote">
            {t("{q} sans date d'expiration. Saisissez la date imprimée sur l'emballage ; ajoutez une ligne si le stock a plusieurs dates.", {
              q: `${total} ${pieces(total)}`,
            })}
          </p>
          {lignes.map((l, i) => (
            <div key={i} className="rc-date-ligne">
              <ChampDateExpiration label={t("Date d'expiration")} value={l.date} onChange={(v) => maj(i, "date", v)} />
              <Field label={t("Pièces")} type="number" inputMode="numeric" min={1} value={l.quantite} onChange={(v) => maj(i, "quantite", v)} />
              {lignes.length > 1 && (
                <IconButton icon={closeOutline} label={t("Retirer cette date")} size="sm" onClick={() => setLignes((ls) => ls.filter((_, k) => k !== i))} />
              )}
            </div>
          ))}
          {lignes.length < 6 && saisi < total && (
            <Button variant="secondary" block icon={addOutline} onClick={() => setLignes((ls) => [...ls, { date: "", quantite: String(Math.max(1, total - saisi)) }])}>
              {t("Ajouter une autre date")}
            </Button>
          )}
          {trop && <Notice tone="warning">{t("Total supérieur aux {q} sans date.", { q: `${total} ${pieces(total)}` })}</Notice>}
          {erreur && <Notice>{erreur}</Notice>}
          <Button size="lg" block icon={checkmarkOutline} loading={envoi} disabled={!complet || trop} onClick={() => enregistrer()}>
            {t("Enregistrer les dates")}
          </Button>
          {onFaitEtSuivant && (
            <Button variant="secondary" size="lg" block icon={scanOutline} disabled={!complet || trop || envoi} onClick={() => enregistrer(true)}>
              {t("Enregistrer et scanner le suivant")}
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
