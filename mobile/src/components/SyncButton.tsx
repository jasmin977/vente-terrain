import { useEffect, useState } from "react";
import { IonAlert, IonIcon, IonSpinner, useIonToast } from "@ionic/react";
import { cloudDoneOutline, cloudDownloadOutline, cloudOfflineOutline, cloudUploadOutline, syncOutline } from "ionicons/icons";
import { lireMajCatalogue, mettreAJourCatalogue, synchroniser, useEtatSync } from "../offline/sync";
import { nbImagesEnregistrees, useImagesHorsLigne } from "../offline/images";
import { retirer, type ActionEnAttente } from "../offline/file";
import { lireCache } from "../offline/cache";
import type { Client } from "../types/client";
import { formatAmount, formatDateTime, joinMeta } from "../utils/format";
import { Button, Group, Notice, Row, Section, Sheet, Tag } from "../ui";
import { t, tn } from "../i18n";

/** Libellé d'une action en attente, tel que le vendeur l'a faite. */
function decrire(a: ActionEnAttente, clients: Client[]): { titre: string; detail: string } {
  const nom = (id: string) => clients.find((c) => c.id === id)?.nomCommerce ?? t("Client");
  switch (a.type) {
    case "facture.creer":
      return {
        titre: t("BL {numero}", { numero: a.facture.numero }),
        detail: joinMeta([a.locale.client?.nomCommerce, `${formatAmount(a.locale.montantTTC)} TND`]),
      };
    case "client.creer":
      return { titre: t("Nouveau client"), detail: a.client.nomCommerce };
    case "client.modifier":
      return { titre: t("Client modifié"), detail: a.modifs.nomCommerce ?? nom(a.clientId) };
    case "client.supprimer":
      return { titre: t("Client supprimé"), detail: nom(a.clientId) };
    case "credit.payer":
      return { titre: t("Paiement du BL {numero}", { numero: a.numero }), detail: `${formatAmount(a.montant)} TND` };
    case "credit.avance":
      return { titre: t("Avance"), detail: joinMeta([nom(a.clientId), `${formatAmount(a.montant)} TND`]) };
  }
}

/**
 * Bouton « Synchroniser » du vendeur (en-tête de chaque écran principal) :
 * l'icône dit si tout est envoyé, combien d'actions attendent, ou s'il n'y a
 * pas de réseau ; la feuille détaille les actions et permet de forcer l'envoi.
 */
export default function SyncButton() {
  const { enLigne, enCours, derniereSync, injoignable, file } = useEtatSync();
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [aRetirer, setARetirer] = useState<ActionEnAttente | null>(null);
  const [toast] = useIonToast();
  const [majCatalogue, setMajCatalogue] = useState<string | null>(null);
  const [progression, setProgression] = useState<string | null>(null);
  useImagesHorsLigne();

  useEffect(() => {
    if (!open) return;
    lireCache("clients").then(setClients);
    lireMajCatalogue().then(setMajCatalogue);
  }, [open]);

  const catalogueDuJour = majCatalogue !== null && new Date(majCatalogue).toDateString() === new Date().toDateString();

  // Le matin, avec réseau : données à jour + photos enregistrées pour la journée.
  const mettreAJour = async () => {
    setProgression(t("Synchronisation…"));
    try {
      const { sync, images } = await mettreAJourCatalogue((fait, total) =>
        setProgression(t("Photos {fait} / {total}…", { fait, total }))
      );
      lireMajCatalogue().then(setMajCatalogue);
      const message = sync.injoignable
        ? t("Serveur injoignable : connectez-vous à Internet puis réessayez.")
        : images && images.echecs > 0
          ? t("Catalogue mis à jour, {n} photo(s) non téléchargée(s).", { n: images.echecs })
          : t("Catalogue à jour pour la journée.");
      toast({ message, duration: 2600, position: "top", cssClass: "rc-toast" });
    } finally {
      setProgression(null);
    }
  };

  const nb = file.length;
  const refusees = file.filter((a) => a.erreur).length;
  const horsLigne = !enLigne || injoignable;
  const icone = horsLigne ? cloudOfflineOutline : nb > 0 ? cloudUploadOutline : cloudDoneOutline;
  const libelle = enCours
    ? t("Synchronisation en cours")
    : horsLigne
      ? tn(nb, "Hors ligne, {n} action en attente", "Hors ligne, {n} actions en attente")
      : nb > 0
        ? tn(nb, "{n} action à synchroniser", "{n} actions à synchroniser")
        : t("Données synchronisées");

  const lancer = async () => {
    const r = await synchroniser();
    const message = r.injoignable
      ? t("Serveur injoignable : les actions restent sur le téléphone.")
      : r.refusees > 0
        ? tn(r.refusees, "{n} action refusée par le serveur.", "{n} actions refusées par le serveur.")
        : r.envoyees > 0
          ? tn(r.envoyees, "{n} action envoyée.", "{n} actions envoyées.")
          : t("Tout est à jour.");
    toast({ message, duration: 2400, position: "top", cssClass: "rc-toast" });
  };

  return (
    <>
      <button
        type="button"
        className={`rc-iconbtn rc-sync${refusees > 0 ? " rc-sync--erreur" : nb > 0 ? " rc-sync--attente" : ""}`}
        aria-label={libelle}
        title={libelle}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {enCours ? <IonSpinner name="crescent" aria-hidden="true" /> : <IonIcon icon={icone} aria-hidden="true" />}
        {nb > 0 && !enCours && (
          <span className="rc-sync__badge" aria-hidden="true">
            {nb > 99 ? "99+" : nb}
          </span>
        )}
      </button>

      <Sheet isOpen={open} title={t("Synchronisation")} onDismiss={() => setOpen(false)}>
        <Section>
          <div className="rc-fields">
            {horsLigne ? (
              <Notice tone="warning">{t("Hors ligne. Ventes, clients et encaissements sont gardés sur le téléphone et partiront au retour du réseau.")}</Notice>
            ) : nb === 0 ? (
              <Notice tone="info">{t("Tout est envoyé au serveur.")}</Notice>
            ) : null}
            <Group>
              <Row
                compact
                label={t("Dernière synchronisation")}
                trailing={<span className="rc-row__value rc-num">{derniereSync ? formatDateTime(derniereSync) : t("Jamais")}</span>}
              />
              <Row compact label={t("Actions en attente")} trailing={<span className="rc-row__value rc-num">{nb}</span>} />
            </Group>
            <Button size="lg" block icon={syncOutline} loading={enCours} onClick={lancer}>
              {t("Synchroniser maintenant")}
            </Button>
          </div>
        </Section>

        <Section label={t("Catalogue du jour")}>
          <div className="rc-fields">
            <Group>
              <Row
                compact
                label={t("Dernière mise à jour")}
                trailing={
                  majCatalogue ? (
                    <Tag tone={catalogueDuJour ? "positive" : "warning"} dot>
                      {formatDateTime(majCatalogue)}
                    </Tag>
                  ) : (
                    <Tag tone="warning" dot>
                      {t("Jamais")}
                    </Tag>
                  )
                }
              />
              <Row compact label={t("Photos sur le téléphone")} trailing={<span className="rc-row__value rc-num">{nbImagesEnregistrees()}</span>} />
            </Group>
            <Button
              variant={catalogueDuJour ? "secondary" : "primary"}
              size="lg"
              block
              icon={cloudDownloadOutline}
              disabled={progression !== null || horsLigne}
              onClick={mettreAJour}
            >
              {progression ?? t("Mettre à jour le catalogue")}
            </Button>
            <p className="rc-footnote">
              {t("Chaque matin avec réseau, avant la tournée : articles, prix, clients, crédits et photos sont gardés sur le téléphone pour la journée.")}
            </p>
          </div>
        </Section>

        {nb > 0 && (
          <Section label={t("En attente d'envoi")} aside={refusees > 0 ? tn(refusees, "{n} refusée", "{n} refusées") : undefined}>
            <Group>
              {file.map((a) => {
                const { titre, detail } = decrire(a, clients);
                return (
                  <Row
                    key={a.cle}
                    title={titre}
                    meta={a.erreur ? joinMeta([detail, a.erreur]) : joinMeta([detail, formatDateTime(a.creeLe)])}
                    trailing={
                      a.erreur ? (
                        <span className="rc-inline">
                          <Tag tone="danger">{t("Refusée")}</Tag>
                          <Button variant="ghost" onClick={() => setARetirer(a)}>
                            {t("Retirer")}
                          </Button>
                        </span>
                      ) : (
                        <Tag tone="warning" dot>
                          {t("En attente")}
                        </Tag>
                      )
                    }
                  />
                );
              })}
            </Group>
            {refusees > 0 && (
              <p className="rc-footnote rc-sync__note">
                {t("Une action refusée est réessayée à chaque synchronisation. Retirez-la si elle ne doit plus être envoyée (corrigez d'abord avec l'administrateur).")}
              </p>
            )}
          </Section>
        )}
      </Sheet>

      <IonAlert
        isOpen={aRetirer !== null}
        onDidDismiss={() => setARetirer(null)}
        header={t("Retirer cette action ?")}
        message={t("Elle ne sera jamais envoyée au serveur. Cette suppression est définitive.")}
        buttons={[
          { text: t("Garder"), role: "cancel" },
          {
            text: t("Retirer"),
            role: "destructive",
            handler: () => {
              if (aRetirer) void retirer(aRetirer.cle);
            },
          },
        ]}
      />
    </>
  );
}
