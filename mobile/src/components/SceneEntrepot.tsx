import type { CSSProperties, ReactNode } from "react";

interface BoiteProps {
  x: number;
  y: number;
  z?: number;
  w: number;
  d: number;
  h: number;
  couleur: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/** Boîte 3D (dessus + 4 côtés) posée dans le plan de la scène ; les unités sont des em. */
function Boite({ x, y, z = 0, w, d, h, couleur, className = "", style, children }: BoiteProps) {
  return (
    <div
      className={`rc-veille__boite ${className}`}
      style={{
        left: `${x}em`,
        top: `${y}em`,
        width: `${w}em`,
        height: `${d}em`,
        translate: z ? `0 0 ${z}em` : undefined,
        ["--w" as string]: `${w}em`,
        ["--d" as string]: `${d}em`,
        ["--h" as string]: `${h}em`,
        ["--c" as string]: couleur,
        ...style,
      }}
    >
      <i className="rc-veille__f rc-veille__f--haut" />
      <i className="rc-veille__f rc-veille__f--av">{children}</i>
      <i className="rc-veille__f rc-veille__f--ar" />
      <i className="rc-veille__f rc-veille__f--g" />
      <i className="rc-veille__f rc-veille__f--d" />
    </div>
  );
}

const CARTONS = ["#c79a62", "#b88a52", "#d3a870"];

/** Camion plateau : roues, plateau, cabine, pare-brise et trois lots posés dessus. */
function Camion({ sens }: { sens: "a" | "b" }) {
  return (
    <div className={`rc-veille__camion rc-veille__camion--${sens}`}>
      <div className="rc-veille__camion-corps">
        <Boite x={2} y={-0.4} w={11} d={7.8} h={2.2} couleur="#141a26" />
        <Boite x={17} y={-0.4} w={4} d={7.8} h={2.2} couleur="#141a26" />
        <Boite x={0} y={0} z={1.5} w={16} d={7} h={1.5} couleur="#5b6b86" />
        <Boite x={16.5} y={0} z={1.5} w={5.5} d={7} h={5.5} couleur="#e0a458" />
        <Boite x={21.3} y={0.8} z={3.6} w={0.8} d={5.4} h={2.2} couleur="#2a3a55" />
        {[1.5, 6, 10.5].map((cx, i) => (
          <div key={i} className={`rc-veille__lot rc-veille__lot--${sens}${i + 1}`} style={{ translate: "0 0 3em" }}>
            <Boite x={cx} y={1.75} w={4} d={3.5} h={3} couleur={CARTONS[i % 3]} />
            <Boite x={cx + 1.7} y={1.75} z={3} w={0.6} d={3.5} h={0.05} couleur="#e9d9b8" />
            <Boite x={cx + 0.4} y={1.75} z={3} w={3.2} d={0.5} h={0.05} couleur="#e9d9b8" style={{ display: "none" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Entrepôt en 3D : quai de chargement, deux camions qui se croisent, cartons qui glissent des camions au bâtiment
 *  les cartons glissent dans le bâtiment (ou en sortent) en restant à leur taille. */
export default function SceneEntrepot() {
  return (
    <div className="rc-veille__scene">
      <div className="rc-veille__plan">
        <div className="rc-veille__sol" />
        <div className="rc-veille__route" />

        <Boite x={8} y={4} w={64} d={24} h={14} couleur="#8fa6c4">
          <span className="rc-veille__porte" style={{ left: "4em", width: "20em" }}>
            <span className="rc-veille__volet rc-veille__volet--1" />
          </span>
          <span className="rc-veille__porte" style={{ left: "38em", width: "22em" }}>
            <span className="rc-veille__volet rc-veille__volet--2" />
          </span>
        </Boite>
        <Boite x={7.2} y={3.2} z={14} w={65.6} d={25.6} h={0.6} couleur="#b5c6dd" />

        <Camion sens="a" />
        <Camion sens="b" />
      </div>
    </div>
  );
}
