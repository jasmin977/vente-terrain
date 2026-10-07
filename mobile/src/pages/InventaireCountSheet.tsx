import { useState } from "react";
import { checkmarkOutline } from "ionicons/icons";
import type { Article } from "../types/article";
import type { LigneInventaireInput, MotifEcart } from "../types/inventaire";
import ArticleImage from "../components/ArticleImage";
import { formatColis, pieces } from "../utils/format";
import { motifEcartLabel } from "../utils/labels";
import { Button, Field, Notice, Section, Segmented, Sheet } from "../ui";
import { t } from "../i18n";

export interface LigneACompter {
  article: Article;
  quantiteTheorique: number;
  quantiteReelle: number | null;
  motif: MotifEcart | null;
  note: string | null;
}

interface Props {
  ligne: LigneACompter | null;
  saving: boolean;
  onSave: (input: LigneInventaireInput) => void;
  onRemove: () => void;
  onDismiss: () => void;
}

const motifs: MotifEcart[] = ["ENDOMMAGE", "PERDU", "ECHANTILLON", "AUTRE"];

/**
 * Saisie du comptage d'un article : l'admin voit la quantité attendue, saisit
 * la quantité réelle et justifie l'écart éventuel.
 */
export default function InventaireCountSheet({ ligne, saving, onSave, onRemove, onDismiss }: Props) {
  const [qte, setQte] = useState("");
  const [motif, setMotif] = useState<MotifEcart | undefined>(undefined);
  const [note, setNote] = useState("");

  const attendu = ligne?.quantiteTheorique ?? 0;
  const colisage = Number(ligne?.article.colisage) || 1;
  const saisie = qte.trim() === "" ? null : Number(qte);
  const valide = saisie !== null && Number.isFinite(saisie) && saisie >= 0;
  const ecart = valide ? saisie - attendu : null;
  const dejaCompte = ligne?.quantiteReelle !== null && ligne?.quantiteReelle !== undefined;

  return (
    <Sheet
      isOpen={ligne !== null}
      title={t("Comptage")}
      height="auto"
      onDismiss={onDismiss}
      onWillPresent={() => {
        setQte(ligne?.quantiteReelle !== null && ligne?.quantiteReelle !== undefined ? String(ligne.quantiteReelle) : "");
        setMotif(ligne?.motif ?? undefined);
        setNote(ligne?.note ?? "");
      }}
    >
      {ligne && (
        <>
          <div className="rc-media" style={{ paddingTop: 0 }}>
            <ArticleImage src={ligne.article.img} alt="" size={56} />
            <div className="rc-media__body">
              <p className="rc-media__title" style={{ fontSize: 17 }}>
                {ligne.article.designation}
              </p>
              <p className="rc-row__meta">
                {ligne.article.code} · {t("colis de {n}", { n: colisage })}
              </p>
            </div>
          </div>

          <Section>
            <div className="rc-expect">
              <span className="rc-expect__label">{t("Quantité attendue")}</span>
              <span className={`rc-expect__value${attendu < 0 ? " rc-expect__value--neg" : ""}`}>
                {attendu} <small>{pieces(attendu)}</small>
              </span>
              {colisage > 1 && attendu !== 0 && <span className="rc-expect__sub">{formatColis(attendu, colisage)}</span>}
            </div>
          </Section>

          <Section>
            <div className="rc-bulk">
              <Field
                label={t("Quantité comptée")}
                type="number"
                inputMode="numeric"
                min={0}
                value={qte}
                onChange={setQte}
                suffix={t("pièces")}
                placeholder="0"
                hint={valide && colisage > 1 ? formatColis(saisie, colisage) : undefined}
              />
              <Button variant="secondary" size="lg" icon={checkmarkOutline} onClick={() => setQte(String(Math.max(0, attendu)))}>
                {t("Conforme")}
              </Button>
            </div>
          </Section>

          {ecart !== null && (
            <Section>
              {ecart === 0 ? (
                <Notice tone="info">{t("Aucun écart.")}</Notice>
              ) : (
                <Notice tone={ecart < 0 ? "danger" : "warning"}>
                  {ecart < 0 ? t("Manque de {q}", { q: `${-ecart} ${pieces(ecart)}` }) : t("Surplus de {q}", { q: `${ecart} ${pieces(ecart)}` })}
                  {colisage > 1 && Math.abs(ecart) >= colisage ? ` (${formatColis(Math.abs(ecart), colisage)})` : ""}.
                </Notice>
              )}
            </Section>
          )}

          {/* Les motifs (endommagé, perdu…) n'expliquent qu'un manque : un surplus n'a qu'une note. */}
          {ecart !== null && ecart !== 0 && (
            <Section label={ecart < 0 ? t("Motif de l'écart") : t("Note")}>
              {ecart < 0 && (
                <Segmented
                  label={t("Motif de l'écart")}
                  variant="tiles"
                  wrap
                  columns={2}
                  value={motif}
                  onChange={setMotif}
                  options={motifs.map((m) => ({ value: m, label: motifEcartLabel[m] }))}
                />
              )}
              <Field
                label={t("Note")}
                hideLabel={ecart > 0}
                value={note}
                onChange={setNote}
                placeholder={t("Détail pour en discuter avec le vendeur (facultatif)")}
              />
            </Section>
          )}

          <Section>
            <div className="rc-fields">
              <Button
                size="lg"
                block
                disabled={!valide}
                loading={saving}
                onClick={() =>
                  onSave({
                    quantiteReelle: saisie!,
                    motif: ecart && ecart < 0 ? motif ?? null : null,
                    note: ecart ? note.trim() || null : null,
                  })
                }
              >
                {t("Enregistrer le comptage")}
              </Button>
              {dejaCompte && (
                <Button variant="ghost" block onClick={onRemove} disabled={saving}>
                  {t("Retirer le comptage")}
                </Button>
              )}
            </div>
          </Section>
        </>
      )}
    </Sheet>
  );
}
