import { formatAmount } from "../utils/format";

export interface PointPrix {
  /** Instant du changement (ms). */
  date: number;
  achat: number;
  vente: number;
}

interface LineChartProps {
  /** Du plus ancien au plus récent. */
  points: PointPrix[];
  /** Nom du graphique (lecteurs d'écran). */
  label: string;
  nomAchat: string;
  nomVente: string;
}

const L = 320;
const H = 150;
const MG = { gauche: 46, droite: 10, haut: 10, bas: 22 };

const dateCourte = (ms: number) =>
  new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Africa/Tunis" }).format(ms);

/**
 * Évolution de deux prix dans le temps : un prix reste le même jusqu'au changement suivant, d'où des
 * paliers (courbe en escalier) prolongés jusqu'à aujourd'hui, et un point à chaque changement.
 */
export default function LineChart({ points, label, nomAchat, nomVente }: LineChartProps) {
  if (points.length === 0) return null;
  const debut = points[0].date;
  const fin = Math.max(Date.now(), points[points.length - 1].date);
  const duree = Math.max(1, fin - debut);
  const valeurs = points.flatMap((p) => [p.achat, p.vente]);
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  // Marge de lecture : une courbe plate ne colle pas aux bords.
  const ecart = max - min || Math.max(max * 0.1, 0.1);
  const bas = min - ecart * 0.15;
  const haut = max + ecart * 0.15;

  const x = (d: number) => MG.gauche + ((d - debut) / duree) * (L - MG.gauche - MG.droite);
  const y = (v: number) => MG.haut + (1 - (v - bas) / (haut - bas)) * (H - MG.haut - MG.bas);

  const escalier = (cle: "achat" | "vente") =>
    points
      .map((p, i) => {
        const suite = points[i + 1];
        const palier = `${i === 0 ? "M" : "L"}${x(p.date).toFixed(1)},${y(p[cle]).toFixed(1)}`;
        return `${palier} L${x(suite ? suite.date : fin).toFixed(1)},${y(p[cle]).toFixed(1)}`;
      })
      .join(" ");

  return (
    <figure className="rc-lines">
      <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label={label} className="rc-lines__svg">
        {[max, min].map((v, i) => (
          <g key={i}>
            <line x1={MG.gauche} x2={L - MG.droite} y1={y(v)} y2={y(v)} className="rc-lines__grille" />
            <text x={MG.gauche - 6} y={y(v) + 4} textAnchor="end" className="rc-lines__axe">
              {formatAmount(v)}
            </text>
          </g>
        ))}
        <text x={MG.gauche} y={H - 5} textAnchor="start" className="rc-lines__axe">
          {dateCourte(debut)}
        </text>
        <text x={L - MG.droite} y={H - 5} textAnchor="end" className="rc-lines__axe">
          {dateCourte(fin)}
        </text>
        <path d={escalier("achat")} className="rc-lines__trait rc-lines__trait--achat" fill="none" />
        <path d={escalier("vente")} className="rc-lines__trait rc-lines__trait--vente" fill="none" />
        {points.map((p) => (
          <g key={p.date}>
            <circle cx={x(p.date)} cy={y(p.achat)} r={3.5} className="rc-lines__point rc-lines__point--achat" />
            <circle cx={x(p.date)} cy={y(p.vente)} r={3.5} className="rc-lines__point rc-lines__point--vente" />
          </g>
        ))}
      </svg>
      <figcaption className="rc-lines__legende">
        <span className="rc-lines__cle rc-lines__cle--achat">{nomAchat}</span>
        <span className="rc-lines__cle rc-lines__cle--vente">{nomVente}</span>
      </figcaption>
    </figure>
  );
}
