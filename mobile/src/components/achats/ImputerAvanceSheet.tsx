import { useEffect, useState } from "react";
import { checkmarkOutline, refreshOutline } from "ionicons/icons";
import { ApiError } from "../../api/client";
import { imputerAvance } from "../../api/achats";
import type { DocumentImpaye } from "../../types/achat";
import { Button, Field, Money, Notice, PageNotice, Sheet } from "../../ui";
import { formatDate } from "../../utils/format";
import { t, tn } from "../../i18n";

interface Props {
  isOpen: boolean;
  onDismiss: () => void;
  fournisseurId: string;
  /** Avances sans document de ce fournisseur (TND). */
  avance: number;
  documents: DocumentImpaye[];
  onImpute: (montant: number) => void;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const nombre = (texte: string) => Number(texte.replace(",", ".").replace(/\s/g, "")) || 0;

/** Répartition proposée : l'avance couvre les documents du plus ancien au plus récent. */
function repartir(avance: number, documents: DocumentImpaye[]): Record<string, string> {
  let reste = avance;
  const res: Record<string, string> = {};
  for (const d of [...documents].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())) {
    const part = r3(Math.min(reste, d.reste));
    res[d.id] = part > 0 ? part.toFixed(3) : "";
    reste = r3(reste - part);
  }
  return res;
}

/**
 * Imputer l'avance d'un fournisseur sur ses BL / factures : répartie d'office du plus ancien au plus récent,
 * l'admin peut changer chaque montant avant de valider.
 */
export default function ImputerAvanceSheet({ isOpen, onDismiss, fournisseurId, avance, documents, onImpute }: Props) {
  const [montants, setMontants] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setMontants(repartir(avance, documents));
    setErreur(null);
  }, [isOpen, avance, documents]);

  const tries = [...documents].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const total = r3(tries.reduce((s, d) => s + nombre(montants[d.id] ?? ""), 0));
  const depasse = tries.find((d) => nombre(montants[d.id] ?? "") > d.reste + 0.0005);
  const erreurTotal = total > avance + 0.0005 ? t("Le total dépasse l'avance disponible ({m} TND).", { m: avance.toFixed(3) }) : null;
  const pret = total > 0 && !depasse && !erreurTotal;

  const valider = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      await imputerAvance(
        fournisseurId,
        tries.filter((d) => nombre(montants[d.id] ?? "") > 0).map((d) => ({ achatId: d.id, montant: nombre(montants[d.id]) })),
      );
      onImpute(total);
      onDismiss();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible d'imputer l'avance"));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      title={t("Imputer l'avance")}
      height="auto"
      onDismiss={onDismiss}
      footer={
        <div className="rc-achat__pied rc-achat__pied--totaux">
          <span className="rc-footnote">
            {t("Imputé")} <Money value={total} size="sm" /> · {t("reste en avance")} <Money value={r3(Math.max(0, avance - total))} size="sm" />
          </span>
          <Button size="lg" icon={checkmarkOutline} loading={enCours} disabled={!pret} onClick={valider}>
            {t("Imputer")}
          </Button>
        </div>
      }
    >
      <div className="rc-achat__form">
        {erreur && <PageNotice>{erreur}</PageNotice>}
        <Notice tone="info">
          {t("{m} TND déjà versés sans document. Proposé : du document le plus ancien au plus récent ; changez les montants si l'avance était pour une autre commande.", {
            m: avance.toFixed(3),
          })}
        </Notice>
        {(erreurTotal || depasse) && <Notice tone="warning">{erreurTotal ?? t("{n} : le montant dépasse le reste à payer.", { n: depasse!.numero })}</Notice>}
        <div className="rc-imputer">
          {tries.map((d) => (
            <div key={d.id} className="rc-imputer__ligne">
              <div>
                <strong>
                  {d.type === "BL" ? "BL" : t("Facture")} {d.numero}
                </strong>
                <span>
                  {formatDate(d.date)} · {t("reste")} <Money value={d.reste} size="sm" />
                </span>
              </div>
              <Field
                label={t("Montant imputé")}
                hideLabel
                inputMode="decimal"
                value={montants[d.id] ?? ""}
                placeholder="0.000"
                suffix="TND"
                onChange={(v) => setMontants((m) => ({ ...m, [d.id]: v }))}
                error={nombre(montants[d.id] ?? "") > d.reste + 0.0005 ? t("Max {m}", { m: d.reste.toFixed(3) }) : null}
              />
            </div>
          ))}
        </div>
        <div>
          <Button variant="ghost" icon={refreshOutline} onClick={() => setMontants(repartir(avance, documents))}>
            {t("Répartir du plus ancien au plus récent")}
          </Button>
          <Button variant="ghost" onClick={() => setMontants({})}>
            {t("Tout effacer")}
          </Button>
        </div>
        <p className="rc-footnote">{tn(tries.length, "{n} document à régler", "{n} documents à régler")}</p>
      </div>
    </Sheet>
  );
}
