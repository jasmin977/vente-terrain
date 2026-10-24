import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMouvementsArticleParCamion, type MouvementsArticleCamion } from "../api/stock";
import { formatDate, joinMeta, pieces } from "../utils/format";
import { Group, Row, Section, TableauDonnees, useEcranLarge } from "../ui";
import type { ColonneDonnees } from "../ui";
import { t } from "../i18n";

/**
 * Fiche article (admin) : ce que chaque camion a chargé, vendu, retourné de cet
 * article et son stock actuel ; un camion ouvre le cycle de vie détaillé.
 */
export default function ArticleMouvements({ articleId }: { articleId: string }) {
  const navigate = useNavigate();
  const [camions, setCamions] = useState<MouvementsArticleCamion[] | null>(null);
  const web = useEcranLarge();

  useEffect(() => {
    getMouvementsArticleParCamion(articleId)
      .then(setCamions)
      .catch(() => setCamions([]));
  }, [articleId]);

  if (!camions) return null;

  const ouvrir = (c: MouvementsArticleCamion) => navigate(`/stock/camion/${c.vendeur.id}/articles/${articleId}`);
  const nombre = (n: number) => (n ? n : "—");
  // PC : un tableau, une colonne par mouvement ; le camion ouvre le cycle de vie détaillé.
  const colonnes: ColonneDonnees<MouvementsArticleCamion>[] = [
    { id: "camion", titre: t("Camion"), principale: true, souple: true, rendu: (c) => t("Camion de {nom}", { nom: c.vendeur.nom }), tri: (c) => c.vendeur.nom },
    { id: "charge", titre: t("Chargé"), rendu: (c) => nombre(c.charge), tri: (c) => c.charge, aligne: "end", largeur: "100px" },
    { id: "vendu", titre: t("Vendu"), rendu: (c) => nombre(c.vendu), tri: (c) => c.vendu, aligne: "end", largeur: "100px" },
    { id: "retour", titre: t("Retourné au dépôt"), rendu: (c) => nombre(c.retourDepot), tri: (c) => c.retourDepot, aligne: "end", largeur: "150px" },
    { id: "repris", titre: t("Repris client"), rendu: (c) => nombre(c.retourClient), tri: (c) => c.retourClient, aligne: "end", largeur: "120px" },
    { id: "ajuste", titre: t("Ajusté"), rendu: (c) => nombre(c.ajuste), tri: (c) => c.ajuste, aligne: "end", largeur: "100px" },
    {
      id: "stock",
      titre: t("Stock"),
      rendu: (c) => (
        <span className={`rc-qty${c.stock < 0 ? " rc-qty--neg" : ""}`}>
          <span className="rc-qty__n">{c.stock}</span> {pieces(c.stock)}
        </span>
      ),
      tri: (c) => c.stock,
      aligne: "end",
      largeur: "120px",
    },
    { id: "dernier", titre: t("Dernier mouvement"), rendu: (c) => (c.dernier ? formatDate(c.dernier) : "—"), tri: (c) => (c.dernier ? Date.parse(c.dernier) : 0), largeur: "150px" },
  ];
  const total = (k: "charge" | "vendu" | "stock") => camions.reduce((s, c) => s + c[k], 0);

  return (
    <Section label={t("Mouvements par camion")}>
      {camions.length === 0 ? (
        <p className="rc-footnote">{t("Cet article n'a encore été chargé dans aucun camion.")}</p>
      ) : web ? (
        <TableauDonnees
          label={t("Mouvements par camion")}
          lignes={camions}
          colonnes={colonnes}
          cle={(c) => c.vendeur.id}
          onOuvrir={ouvrir}
          triInitial={{ colonne: "camion" }}
          pied={
            <span className="rc-transfo__pied">
              <strong>{t("{n} camions", { n: camions.length })}</strong>
              <span>
                {t("Chargé {a} · Vendu {b} · En camion {c} {p}", { a: total("charge"), b: total("vendu"), c: total("stock"), p: pieces(total("stock")) })}
              </span>
            </span>
          }
        />
      ) : (
        <Group>
          {camions.map((c) => (
            <Row
              key={c.vendeur.id}
              chevron
              onClick={() => ouvrir(c)}
              title={t("Camion de {nom}", { nom: c.vendeur.nom })}
              meta={joinMeta([
                c.charge ? t("Chargé {n}", { n: c.charge }) : null,
                c.vendu ? t("Vendu {n}", { n: c.vendu }) : null,
                c.retourDepot ? t("Retourné {n}", { n: c.retourDepot }) : null,
                c.retourClient ? t("Repris {n}", { n: c.retourClient }) : null,
              ])}
              trailing={
                <span className={`rc-qty${c.stock < 0 ? " rc-qty--neg" : ""}`}>
                  <span className="rc-qty__n">{c.stock}</span> {pieces(c.stock)}
                </span>
              }
            />
          ))}
        </Group>
      )}
    </Section>
  );
}
