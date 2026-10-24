import { useState } from "react";
import { addOutline, closeOutline, scanOutline } from "ionicons/icons";
import { scanCameraDisponible, scannerCodeBarre } from "../lib/barcode";
import type { CodeBarreAlternatif } from "../types/article";
import { Button, Field, Group, IconButton, Row, Section } from "../ui";
import { t } from "../i18n";

/**
 * Autres codes-barres d'un même produit (variantes : saveur, couleur, modèle…) : mêmes marque, unité et prix, un autre
 * code. Scanner l'un d'eux retrouve l'article. En lecture seule (vendeur), la liste seulement.
 */
export default function CodesBarresAlternatifs({
  value,
  onChange,
  readOnly,
  codePrincipal,
}: {
  value: CodeBarreAlternatif[];
  onChange: (codes: CodeBarreAlternatif[]) => void;
  readOnly?: boolean;
  /** Code-barres principal de l'article (un code ne peut pas être saisi deux fois). */
  codePrincipal: string;
}) {
  const [code, setCode] = useState("");
  const [variante, setVariante] = useState("");
  const [scan, setScan] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (readOnly && value.length === 0) return null;

  const scanner = async () => {
    setErreur(null);
    setScan(true);
    const r = await scannerCodeBarre();
    setScan(false);
    if ("code" in r) setCode(r.code);
    else if ("error" in r) setErreur(r.error);
  };

  const ajouter = () => {
    const c = code.trim();
    if (!c) return;
    if (c === codePrincipal.trim() || value.some((v) => v.codeBarre === c)) {
      setErreur(t("Ce code-barres est déjà sur cet article."));
      return;
    }
    onChange([...value, { codeBarre: c, libelle: variante.trim() || null }]);
    setCode("");
    setVariante("");
    setErreur(null);
  };

  return (
    <Section label={t("Autres codes-barres (variantes)")} aside={value.length > 0 ? `${value.length}` : undefined}>
      {/* Deux colonnes au PC : les codes de l'article à gauche, l'ajout d'un code à droite. */}
      <div className="rc-codes">
      {value.length === 0 ? (
        <Group pad>
          <p className="rc-footnote rc-codes__vide">{t("Aucun autre code-barres : seul le code principal ({c}) ramène cet article.", { c: codePrincipal || "—" })}</p>
        </Group>
      ) : (
        <Group>
          {value.map((v) => (
            <Row
              key={v.codeBarre}
              compact
              title={v.libelle || t("Variante")}
              meta={v.codeBarre}
              trailing={
                readOnly ? undefined : (
                  <IconButton
                    icon={closeOutline}
                    label={t("Retirer le code-barres {c}", { c: v.codeBarre })}
                    size="sm"
                    onClick={() => onChange(value.filter((x) => x.codeBarre !== v.codeBarre))}
                  />
                )
              }
            />
          ))}
        </Group>
      )}
      {!readOnly && (
        <Group pad>
          <div className="rc-fields">
            <p className="rc-footnote">
              {t("Même produit dans une autre variante")}
            </p>
            <Field
              label={t("Code-barres")}
              value={code}
              onChange={setCode}
              inputMode="numeric"
              suffix={scanCameraDisponible() ? <IconButton icon={scanOutline} label={t("Scanner le code-barres")} onClick={scanner} disabled={scan} /> : undefined}
            />
            <Field label={t("Variante")} placeholder={t("ex : Fraise, Rouge, Modèle B")} value={variante} onChange={setVariante} maxLength={60} error={erreur} />
            <Button variant="secondary" block icon={addOutline} disabled={!code.trim()} onClick={ajouter}>
              {t("Ajouter ce code-barres")}
            </Button>
          </div>
        </Group>
      )}
      </div>
    </Section>
  );
}
