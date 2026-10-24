import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IonIcon } from "@ionic/react";
import { Preferences } from "@capacitor/preferences";
import {
  alertCircleOutline,
  arrowDownCircleOutline,
  checkmarkDoneOutline,
  createOutline,
  cubeOutline,
  hourglassOutline,
  notificationsOutline,
  timeOutline,
  walletOutline,
} from "ionicons/icons";
import { getNotifications, type Notif, type TypeNotif } from "../api/notifications";
import { useSociete } from "../societe/SocieteContext";
import { formatAmount, formatLongDate, formatTime, toLocalDateString } from "../utils/format";
import { EmptyState, Group, Row, Section, Segmented, Sheet } from "../ui";
import { t, tn } from "../i18n";

const ICONES: Record<TypeNotif, string> = {
  RUPTURE: alertCircleOutline,
  STOCK_BAS: arrowDownCircleOutline,
  EXPIRE: hourglassOutline,
  EXPIRE_BIENTOT: timeOutline,
  CREDIT_RETARD: walletOutline,
  NOUVEL_ARTICLE: cubeOutline,
  NOUVEAUX_ARTICLES: cubeOutline,
  A_COMPLETER: createOutline,
};

/**
 * Texte d'une notification dans la langue de l'app (le serveur n'envoie que les valeurs) :
 * `etiquette` = le type d'alerte (affiché en pastille de couleur à gauche), `titre` = l'article ou le client.
 */
function texte(n: Notif): { etiquette: string; titre: string; detail: string } {
  const p = n.params;
  const nom = p.nom ?? "";
  const q = p.q ?? 0;
  const j = p.jours ?? 0;
  switch (n.type) {
    case "RUPTURE":
      return { etiquette: t("Rupture"), titre: nom, detail: t("Plus aucune pièce au dépôt.") };
    case "STOCK_BAS":
      return { etiquette: t("Stock bas"), titre: nom, detail: tn(q, "{n} pièce restante au dépôt.", "{n} pièces restantes au dépôt.") };
    case "EXPIRE":
      return { etiquette: t("Expiré"), titre: nom, detail: t("{q} pièces · expiré depuis {j} j", { q, j }) };
    case "EXPIRE_BIENTOT":
      return {
        etiquette: j === 0 ? t("Expire aujourd'hui") : t("Expire dans {j} j", { j }),
        titre: nom,
        detail: t("{q} pièces à vérifier", { q }),
      };
    case "CREDIT_RETARD":
      return {
        etiquette: t("Crédit en retard"),
        titre: nom,
        detail: tn(p.n ?? 0, "{n} bon impayé depuis plus de 30 jours · {total} TND", "{n} bons impayés depuis plus de 30 jours · {total} TND", {
          total: formatAmount(p.total ?? 0),
        }),
      };
    case "NOUVEL_ARTICLE":
      return { etiquette: t("Nouvel article"), titre: nom, detail: t("Ajouté au catalogue.") };
    case "NOUVEAUX_ARTICLES":
      return {
        etiquette: t("Nouveaux articles"),
        titre: tn(p.n ?? 0, "{n} nouvel article ajouté", "{n} nouveaux articles ajoutés"),
        detail: t("Import ou création en série dans le catalogue."),
      };
    case "A_COMPLETER":
      return {
        etiquette: t("À compléter"),
        titre: tn(p.n ?? 0, "{n} article en stock sans prix d'achat", "{n} articles en stock sans prix d'achat"),
        detail: t("La valeur du dépôt et la marge ne peuvent pas être calculées."),
      };
  }
}

const jourLocal = (iso: string) => toLocalDateString(new Date(iso));

function titreJour(jour: string): string {
  const aujourdhui = toLocalDateString(new Date());
  const hier = toLocalDateString(new Date(Date.now() - 86_400_000));
  if (jour === aujourdhui) return t("Aujourd'hui");
  if (jour === hier) return t("Hier");
  return formatLongDate(new Date(`${jour}T12:00:00`));
}

/**
 * Cloche des notifications (admin) : nombre de nouveautés depuis la dernière lecture, et une carte avec
 * toutes les alertes jour par jour (ruptures, stock bas, dates d'expiration, crédits en retard, nouveaux articles).
 */
export default function NotificationsButton() {
  const navigate = useNavigate();
  const { societe } = useSociete();
  const [evenements, setEvenements] = useState<Notif[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [filtre, setFiltre] = useState<"toutes" | "nonlues">("toutes");
  // Dernière lecture : par société, gardée sur l'appareil. Par défaut, hier : les nouveautés du jour sont « non lues ».
  const cle = `notifs-vues:${societe?.id ?? ""}`;
  const [vues, setVues] = useState<number>(() => Date.now() - 86_400_000);

  useEffect(() => {
    Preferences.get({ key: cle }).then(({ value }) => {
      if (value) setVues(Number(value));
    });
  }, [cle]);

  const charger = useCallback(async () => {
    try {
      setEvenements((await getNotifications()).evenements);
    } catch {
      // hors ligne ou erreur : on garde la dernière liste
    }
  }, []);

  useEffect(() => {
    void charger();
    const id = window.setInterval(() => void charger(), 5 * 60_000);
    return () => window.clearInterval(id);
  }, [charger, societe?.id]);

  useEffect(() => {
    if (ouvert) void charger();
  }, [ouvert, charger]);

  const nbNonLues = evenements.filter((n) => new Date(n.date).getTime() > vues).length;

  const toutLu = () => {
    const maintenant = Date.now();
    setVues(maintenant);
    void Preferences.set({ key: cle, value: String(maintenant) });
  };

  const jours = useMemo(() => {
    const liste = filtre === "nonlues" ? evenements.filter((n) => new Date(n.date).getTime() > vues) : evenements;
    const m = new Map<string, Notif[]>();
    for (const n of liste) m.set(jourLocal(n.date), [...(m.get(jourLocal(n.date)) ?? []), n]);
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [evenements, filtre, vues]);

  const ouvrir = (n: Notif) => {
    setOuvert(false);
    const { ecran, id } = n.lien;
    if (ecran === "article" && id) navigate(`/articles/${id}`);
    else if (ecran === "peremptions") navigate("/stock/peremptions");
    else if (ecran === "credits") navigate("/clients?vue=credits");
    else if (ecran === "articles-a-completer") navigate("/stock/a-completer");
    else navigate("/stock?lieu=articles");
  };

  return (
    <>
      <button
        type="button"
        className="rc-iconbtn rc-notif"
        aria-label={nbNonLues > 0 ? t("Notifications : {n} non lues", { n: nbNonLues }) : t("Notifications")}
        aria-haspopup="dialog"
        onClick={() => setOuvert(true)}
      >
        <IonIcon icon={notificationsOutline} aria-hidden="true" />
        {nbNonLues > 0 && <span className="rc-notif__badge">{nbNonLues > 9 ? "9+" : nbNonLues}</span>}
      </button>

      <Sheet isOpen={ouvert} title={t("Notifications")} height="full" onDismiss={() => setOuvert(false)}>
        <Section>
          <Segmented
            label={t("Affichage")}
            value={filtre}
            onChange={setFiltre}
            options={[
              { value: "toutes", label: t("Toutes") },
              { value: "nonlues", label: nbNonLues > 0 ? `${t("Non lues")} (${nbNonLues})` : t("Non lues") },
            ]}
          />
          {nbNonLues > 0 && (
            <button type="button" className="rc-notif__tout-lu" onClick={toutLu}>
              <IonIcon icon={checkmarkDoneOutline} aria-hidden="true" />
              {t("Tout marquer comme lu")}
            </button>
          )}
        </Section>

        {jours.length === 0 ? (
          <EmptyState
            icon={notificationsOutline}
            title={filtre === "nonlues" ? t("Tout est lu.") : t("Aucune notification.")}
            message={t("Les ruptures, dates d'expiration, crédits en retard et nouveaux articles apparaîtront ici, jour après jour.")}
          />
        ) : (
          jours.map(([jour, liste]) => (
            <Section key={jour} label={titreJour(jour)}>
              <Group>
                {liste.map((n) => {
                  const { etiquette, titre, detail } = texte(n);
                  const nouvelle = new Date(n.date).getTime() > vues;
                  return (
                    <Row
                      key={n.id}
                      chevron
                      onClick={() => ouvrir(n)}
                      title={
                        <span className="rc-notif__ligne">
                          <span className={`rc-tag rc-tag--neutral rc-notif__tag rc-notif__tag--${n.type}`}>
                            <IonIcon icon={ICONES[n.type]} aria-hidden="true" /> {etiquette}
                          </span>
                          <span className="rc-notif__nom">{titre}</span>
                        </span>
                      }
                      meta={`${detail} · ${formatTime(n.date)}`}
                      trailing={nouvelle ? <span className="rc-notif__point" role="img" aria-label={t("Nouveau")} /> : undefined}
                    />
                  );
                })}
              </Group>
            </Section>
          ))
        )}
      </Sheet>
    </>
  );
}
