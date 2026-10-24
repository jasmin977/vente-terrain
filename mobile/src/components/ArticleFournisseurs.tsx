import { useEffect, useMemo, useState } from "react";
import { getAchatsArticle, type ReceptionArticle } from "../api/achats";
import { Money, Section, TableauDonnees, Tag } from "../ui";
import type { ColonneDonnees } from "../ui";
import { formatColis, formatDate, pieces } from "../utils/format";
import { t, tn } from "../i18n";

interface Fournisseur {
  cle: string;
  nom: string;
  receptions: ReceptionArticle[];
  quantite: number;
  dernier: ReceptionArticle;
  min: number;
  max: number;
}

/** Nom du fournisseur d'une réception : le fournisseur, la précision d'un achat « Divers », ou « B° Entrée ». */
function nomDe(r: ReceptionArticle): { cle: string; nom: string } {
  if (r.achat.type === "ENTREE") return { cle: "entree", nom: t("B° Entrée (sans fournisseur)") };
  if (r.fournisseur.divers) return { cle: `divers:${r.achat.fournisseurLibre ?? ""}`, nom: r.achat.fournisseurLibre ? `${t("Divers")} · ${r.achat.fournisseurLibre}` : t("Divers") };
  return { cle: r.fournisseur.id, nom: r.fournisseur.nom };
}

/** « BL SLS-1502 », « Facture FA 2026/00412 » : le type n'est pas répété quand le numéro du papier le porte déjà. */
function libelleDoc(r: ReceptionArticle): string {
  const prefixe = r.achat.type === "BL" ? "BL" : r.achat.type === "FACTURE" ? "FA" : "";
  if (prefixe && r.achat.numero.toUpperCase().startsWith(prefixe)) return r.achat.numero;
  return `${r.achat.type === "BL" ? "BL" : r.achat.type === "ENTREE" ? t("B° Entrée") : t("Facture")} ${r.achat.numero}`;
}

/**
 * Fiche article › Fournisseurs : chez qui l'article a été acheté (quantités, dernier prix, plus bas et plus haut),
 * puis chaque réception.
 */
export default function ArticleFournisseurs({ articleId, colisage }: { articleId: string; colisage: number }) {
  const [receptions, setReceptions] = useState<ReceptionArticle[] | null>(null);

  useEffect(() => {
    getAchatsArticle(articleId)
      .then(setReceptions)
      .catch(() => setReceptions([]));
  }, [articleId]);

  const fournisseurs = useMemo(() => {
    const parCle = new Map<string, Fournisseur>();
    for (const r of receptions ?? []) {
      const { cle, nom } = nomDe(r);
      const f = parCle.get(cle) ?? { cle, nom, receptions: [], quantite: 0, dernier: r, min: r.prixUnitaire, max: r.prixUnitaire };
      f.receptions.push(r);
      f.quantite += r.quantite;
      f.min = Math.min(f.min, r.prixUnitaire);
      f.max = Math.max(f.max, r.prixUnitaire);
      parCle.set(cle, f);
    }
    // Le plus récent d'abord (les réceptions arrivent déjà de la plus récente à la plus ancienne).
    return [...parCle.values()].sort((a, b) => Date.parse(b.dernier.achat.date) - Date.parse(a.dernier.achat.date));
  }, [receptions]);

  if (!receptions) return null;
  if (receptions.length === 0) return <p className="rc-footnote rc-onglet__vide">{t("Cet article n'a encore été reçu d'aucun fournisseur.")}</p>;

  const qte = (q: number) => (colisage > 1 ? `${q} ${pieces(q)} · ${formatColis(q, colisage)}` : `${q} ${pieces(q)}`);
  const colonnes: ColonneDonnees<ReceptionArticle>[] = [
    { id: "date", titre: t("Date"), rendu: (r) => formatDate(r.achat.date), tri: (r) => Date.parse(r.achat.date), largeur: "110px" },
    { id: "doc", titre: t("Document"), rendu: libelleDoc, tri: (r) => r.achat.numero, largeur: "170px" },
    { id: "fournisseur", titre: t("Fournisseur"), principale: true, rendu: (r) => nomDe(r).nom, tri: (r) => nomDe(r).nom, souple: true },
    { id: "qte", titre: t("Quantité"), rendu: (r) => qte(r.quantite), tri: (r) => r.quantite, aligne: "end", largeur: "160px" },
    { id: "prix", titre: t("Prix achat HT"), rendu: (r) => <Money value={r.prixUnitaire} />, tri: (r) => r.prixUnitaire, aligne: "end", largeur: "130px" },
    { id: "exp", titre: t("Expiration"), rendu: (r) => (r.dateExpiration ? formatDate(r.dateExpiration) : "—"), largeur: "110px" },
  ];

  return (
    <>
      <div className="rc-fourn-cartes">
        {fournisseurs.map((f, i) => (
          <div key={f.cle} className="rc-fourn-carte">
            <div className="rc-fourn-carte__tete">
              <strong>{f.nom}</strong>
              {i === 0 && <Tag tone="accent">{t("Dernier fournisseur")}</Tag>}
            </div>
            <dl>
              <div>
                <dt>{t("Dernier prix HT")}</dt>
                <dd>
                  <Money value={f.dernier.prixUnitaire} size="md" />
                  <small>{formatDate(f.dernier.achat.date)}</small>
                </dd>
              </div>
              <div>
                <dt>{t("Plus bas / plus haut")}</dt>
                <dd>
                  {f.min === f.max ? (
                    <Money value={f.min} size="sm" />
                  ) : (
                    <>
                      <Money value={f.min} size="sm" /> – <Money value={f.max} size="sm" />
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt>{t("Acheté")}</dt>
                <dd>
                  {qte(f.quantite)}
                  <small>{tn(f.receptions.length, "{n} réception", "{n} réceptions")}</small>
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <Section label={t("Toutes les réceptions")} aside={`${receptions.length}`}>
        <TableauDonnees label={t("Réceptions de l'article")} lignes={receptions} colonnes={colonnes} cle={(r) => r.id} chevron={false} triInitial={{ colonne: "date", inverse: true }} />
      </Section>
    </>
  );
}
