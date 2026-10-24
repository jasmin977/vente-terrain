import { useEffect, useRef, useState } from "react";
import type { GabaritEffet, TypeEffet } from "../../types/effet";
import { ALIGNE, INTERLIGNE, MARGE, champsDe, fondDe, mettreEnCase } from "../../utils/effets";
import { t } from "../../i18n";

interface Props {
  type: TypeEffet;
  gabarit: GabaritEffet;
  textes: Record<string, string>;
  /** Réglage : chaque case se déplace et se redimensionne à la souris (ou au doigt). */
  editable?: boolean;
  selection?: string | null;
  onSelect?: (cle: string) => void;
  onChanger?: (cle: string, maj: { x?: number; y?: number; largeur?: number; hauteur?: number }) => void;
}

const quart = (v: number) => Math.round(v * 4) / 4;

/**
 * Le papier à l'échelle de l'écran, sur l'image du papier vierge (pâle), chaque texte dans sa case. En réglage,
 * les cases apparaissent, se font glisser et s'agrandissent par leur coin.
 */
export default function ApercuEffet({ type, gabarit, textes, editable, selection, onSelect, onChanger }: Props) {
  const cadre = useRef<HTMLDivElement>(null);
  const [echelle, setEchelle] = useState(3); // px par mm
  const geste = useRef<{ cle: string; mode: "deplacer" | "taille"; x0: number; y0: number; depart: { x: number; y: number; largeur: number; hauteur: number } } | null>(null);

  useEffect(() => {
    const el = cadre.current;
    if (!el) return;
    const mesurer = () => setEchelle(Math.max(1, el.clientWidth / gabarit.largeur));
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(el);
    return () => obs.disconnect();
  }, [gabarit.largeur]);

  const enMm = (e: React.PointerEvent) => {
    const r = cadre.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / echelle, y: (e.clientY - r.top) / echelle };
  };

  const commencer = (e: React.PointerEvent, cle: string, mode: "deplacer" | "taille") => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    cadre.current?.setPointerCapture?.(e.pointerId);
    const ch = gabarit.champs[cle];
    const p = enMm(e);
    geste.current = { cle, mode, x0: p.x, y0: p.y, depart: { x: ch.x, y: ch.y, largeur: ch.largeur, hauteur: ch.hauteur } };
    onSelect?.(cle);
  };

  const fond = fondDe(type);
  return (
    <div
      ref={cadre}
      className={`rc-effet${editable ? " rc-effet--edition" : ""}`}
      style={{ height: gabarit.hauteur * echelle }}
      onPointerMove={(e) => {
        const g = geste.current;
        if (!g || !onChanger) return;
        const p = enMm(e);
        const dx = p.x - g.x0;
        const dy = p.y - g.y0;
        if (g.mode === "deplacer") onChanger(g.cle, { x: quart(g.depart.x + dx), y: quart(g.depart.y + dy) });
        else onChanger(g.cle, { largeur: Math.max(2, quart(g.depart.largeur + dx)), hauteur: Math.max(2, quart(g.depart.hauteur + dy)) });
      }}
      onPointerUp={() => (geste.current = null)}
      onPointerCancel={() => (geste.current = null)}
      role="img"
      aria-label={type === "TRAITE" ? t("Aperçu de la traite") : t("Aperçu du chèque")}
    >
      {fond ? (
        <img className="rc-effet__fond" src={fond} alt="" draggable={false} />
      ) : (
        <div className="rc-effet__grille" style={{ backgroundSize: `${10 * echelle}px ${10 * echelle}px` }} />
      )}
      {champsDe(type).map((d) => {
        const ch = gabarit.champs[d.cle];
        if (!ch || ch.masque) return null;
        const texte = textes[d.cle];
        if (!texte && !editable) return null;
        const { lignes, taille } = mettreEnCase(texte || t(d.libelle), ch);
        const [flex, align] = ALIGNE[ch.alignement ?? "centre"];
        return (
          <div
            key={d.cle}
            className={`rc-effet__case${selection === d.cle ? " rc-effet__case--choisie" : ""}${texte ? "" : " rc-effet__case--vide"}`}
            title={t(d.libelle)}
            style={{
              left: ch.x * echelle,
              top: ch.y * echelle,
              width: ch.largeur * echelle,
              height: ch.hauteur * echelle,
              padding: `0 ${MARGE * echelle}px`,
              alignItems: flex,
              textAlign: align,
              lineHeight: INTERLIGNE,
              fontSize: taille * (25.4 / 72) * echelle,
              fontWeight: ch.gras ? 700 : 400,
              letterSpacing: ch.espacement ? ch.espacement * echelle : undefined,
            }}
            onPointerDown={(e) => commencer(e, d.cle, "deplacer")}
          >
            {lignes.map((l, i) => (
              <span key={i}>{l}</span>
            ))}
            {editable && selection === d.cle && (
              <span className="rc-effet__poignee" onPointerDown={(e) => commencer(e, d.cle, "taille")} aria-hidden="true" />
            )}
          </div>
        );
      })}
    </div>
  );
}
