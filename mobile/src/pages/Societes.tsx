import { useCallback, useEffect, useState } from "react";
import { IonContent, IonPage } from "@ionic/react";
import { addOutline, businessOutline, createOutline } from "ionicons/icons";
import { listSocietes } from "../api/societes";
import { ApiError } from "../api/client";
import type { Societe } from "../types/societe";
import { useSociete } from "../societe/SocieteContext";
import SocieteLogo from "../components/SocieteLogo";
import SocieteFormSheet from "../components/SocieteFormSheet";
import { joinMeta } from "../utils/format";
import { AccountButton, ActionBar, AppHeader, Button, EmptyState, IconButton, PageNotice, Row, Section, SkeletonList } from "../ui";
import { t, tn } from "../i18n";

/**
 * Choix de la société (admin) : après la connexion, ou « Changer de société ».
 * Créer, modifier, puis ouvrir une société ; chacune a ses propres articles,
 * clients, dépôt, vendeurs et bons.
 */
export default function Societes() {
  const { ouvrir, precedente } = useSociete();
  const [societes, setSocietes] = useState<Societe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formulaire, setFormulaire] = useState<{ societe: Societe | null } | null>(null);

  const charger = useCallback(async () => {
    setError(null);
    try {
      setSocietes(await listSocietes());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Impossible de charger les sociétés"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  return (
    <IonPage>
      <AppHeader large title={t("Sociétés")} actions={<AccountButton />} />
      <IonContent>
        {error && (
          <PageNotice actionLabel={t("Réessayer")} onAction={charger}>
            {error}
          </PageNotice>
        )}
        <Section flush label={t("Choisissez la société à ouvrir")}>
          {loading ? (
            <SkeletonList rows={3} thumb />
          ) : societes.length === 0 ? (
            <EmptyState
              icon={businessOutline}
              title={t("Aucune société.")}
              message={t("Créez votre première société : vous y importerez ensuite vos articles et ajouterez vos vendeurs.")}
            />
          ) : (
            <div className="rc-list">
              {societes.map((s) => (
                <div key={s.id} className="rc-societe-ligne">
                  <Row
                    thumb
                    leading={<SocieteLogo nom={s.nom} logo={s.logo} />}
                    title={s.nom}
                    meta={joinMeta([
                      s.code,
                      s._count ? tn(s._count.articles, "{n} article", "{n} articles") : null,
                      s._count ? tn(s._count.users, "{n} vendeur", "{n} vendeurs") : null,
                    ])}
                    onClick={() => ouvrir(s)}
                    chevron
                  />
                  <IconButton
                    icon={createOutline}
                    label={t("Modifier {nom}", { nom: s.nom })}
                    onClick={() => setFormulaire({ societe: s })}
                  />
                </div>
              ))}
            </div>
          )}
        </Section>
      </IonContent>

      <ActionBar>
        <Button size="lg" block icon={addOutline} onClick={() => setFormulaire({ societe: null })}>
          {t("Nouvelle société")}
        </Button>
        {precedente && (
          <Button variant="ghost" block onClick={() => ouvrir(precedente)}>
            {t("Revenir à {nom}", { nom: precedente.nom })}
          </Button>
        )}
      </ActionBar>

      <SocieteFormSheet
        isOpen={formulaire !== null}
        societe={formulaire?.societe ?? null}
        onDismiss={() => setFormulaire(null)}
        onSaved={(s) => {
          const nouvelle = !formulaire?.societe;
          setFormulaire(null);
          // Une nouvelle société s'ouvre directement sur son démarrage guidé.
          if (nouvelle) void ouvrir(s);
          else void charger();
        }}
      />
    </IonPage>
  );
}
