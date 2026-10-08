import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMouvementsArticleParCamion, type MouvementsArticleCamion } from "../api/stock";
import { joinMeta, pieces } from "../utils/format";
import { Group, Row, Section } from "../ui";
import { t } from "../i18n";

/**
 * Fiche article (admin) : ce que chaque camion a chargé, vendu, retourné de cet
 * article et son stock actuel ; un camion ouvre le cycle de vie détaillé.
 */
export default function ArticleMouvements({ articleId }: { articleId: string }) {
  const navigate = useNavigate();
  const [camions, setCamions] = useState<MouvementsArticleCamion[] | null>(null);

  useEffect(() => {
    getMouvementsArticleParCamion(articleId)
      .then(setCamions)
      .catch(() => setCamions([]));
  }, [articleId]);

  if (!camions) return null;

  return (
    <Section label={t("Mouvements par camion")}>
      {camions.length === 0 ? (
        <p className="rc-footnote">{t("Cet article n'a encore été chargé dans aucun camion.")}</p>
      ) : (
        <Group>
          {camions.map((c) => (
            <Row
              key={c.vendeur.id}
              chevron
              onClick={() => navigate(`/stock/camion/${c.vendeur.id}/articles/${articleId}`)}
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
