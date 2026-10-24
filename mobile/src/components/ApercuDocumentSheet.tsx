import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { openOutline } from "ionicons/icons";
import { ApiError } from "../api/client";
import { getFacture, getFactureVente } from "../api/factures";
import { getChargement } from "../api/stock";
import { Button, Money, PageNotice, Sheet, Spinner } from "../ui";
import { formatDate } from "../utils/format";
import { t } from "../i18n";

/** Document des journaux des ventes et du stock (les achats ont leur propre fenêtre de détail). */
export type DocumentApercu = { genre: "BL_VENTE" | "FACTURE_VENTE" | "STOCK"; id: string; titre: string };

interface Contenu {
  sousTitre: string;
  lignes: { id: string; code: string; designation: string; quantite: number; prix?: number; tva?: number; total?: number }[];
  totaux?: { label: string; valeur: number; fort?: boolean }[];
  /** Page complète du document, s'il en a une. */
  page?: string;
}

/**
 * Aperçu d'un document depuis un journal, sans quitter le journal (période, filtres et position gardés) ;
 * « Ouvrir la page » mène au document complet quand il a sa propre page.
 */
export default function ApercuDocumentSheet({ document, onDismiss }: { document: DocumentApercu | null; onDismiss: () => void }) {
  const navigate = useNavigate();
  const [contenu, setContenu] = useState<Contenu | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    setContenu(null);
    setErreur(null);
    if (!document) return;
    const charger = async (): Promise<Contenu> => {
      if (document.genre === "BL_VENTE") {
        const f = await getFacture(document.id);
        return {
          sousTitre: `${formatDate(f.date)} · ${f.client?.nomCommerce ?? ""}`,
          lignes: f.lignes.map((l) => ({
            id: l.id,
            code: l.article.codeBarre ?? "",
            designation: l.article.designation,
            quantite: Number(l.quantite),
            prix: Number(l.prixUnitaire),
            tva: Number(l.tauxTva),
            total: Number(l.montantTTC),
          })),
          totaux: [
            { label: t("Total HT"), valeur: Number(f.montantHT) },
            { label: t("TVA"), valeur: Number(f.montantTVA) },
            { label: t("Total TTC"), valeur: Number(f.montantTTC), fort: true },
          ],
          page: `/factures/${f.id}`,
        };
      }
      if (document.genre === "FACTURE_VENTE") {
        const f = await getFactureVente(document.id);
        return {
          sousTitre: `${formatDate(f.date)} · ${f.client?.nomCommerce ?? t("Plusieurs clients")} · ${f.bons.length} BL`,
          lignes: f.lignes.map((l) => ({
            id: l.id,
            code: l.article.codeBarre ?? "",
            designation: l.article.designation,
            quantite: Number(l.quantite),
            prix: Number(l.prixUnitaire),
            tva: Number(l.tauxTva),
            total: Number(l.montantTTC),
          })),
          totaux: [
            { label: t("Total HT"), valeur: Number(f.montantHT) },
            { label: t("TVA"), valeur: Number(f.montantTVA) },
            { label: t("Timbre"), valeur: Number(f.timbre ?? 1) },
            { label: t("Net à payer"), valeur: Number(f.montantTTC) + Number(f.timbre ?? 1), fort: true },
          ],
        };
      }
      const c = await getChargement(document.id);
      return {
        sousTitre: `${formatDate(c.date)} · ${c.vendeur.nom} · ${c.totalPieces} ${t("pièces")}`,
        lignes: c.lignes.map((l) => ({ id: l.id, code: l.article.codeBarre ?? "", designation: l.article.designation, quantite: l.pieces })),
        page: `/stock/chargements/${c.id}`,
      };
    };
    charger()
      .then(setContenu)
      .catch((err) => setErreur(err instanceof ApiError ? err.message : t("Impossible de charger le document")));
  }, [document]);

  const avecPrix = contenu?.lignes.some((l) => l.prix !== undefined);

  return (
    <Sheet
      isOpen={document !== null}
      title={document?.titre ?? ""}
      large
      onDismiss={onDismiss}
      footer={
        contenu?.page && (
          <div className="rc-achat__pied">
            <Button
              variant="secondary"
              icon={openOutline}
              onClick={() => {
                const page = contenu.page!;
                onDismiss();
                navigate(page);
              }}
            >
              {t("Ouvrir la page")}
            </Button>
          </div>
        )
      }
    >
      <div className="rc-achat__form">
        {erreur && <PageNotice>{erreur}</PageNotice>}
        {!contenu ? (
          !erreur && <Spinner />
        ) : (
          <>
            <p className="rc-footnote">{contenu.sousTitre}</p>
            <div className="rc-tdonnees">
              <table aria-label={t("Lignes")}>
                <thead>
                  <tr>
                    <th scope="col">{t("Code-barres")}</th>
                    <th scope="col">{t("Désignation")}</th>
                    <th scope="col" style={{ textAlign: "end" }}>{t("Qté")}</th>
                    {avecPrix && (
                      <>
                        <th scope="col" style={{ textAlign: "end" }}>{t("P.U. HT")}</th>
                        <th scope="col" style={{ textAlign: "end" }}>{t("TVA")}</th>
                        <th scope="col" style={{ textAlign: "end" }}>{t("Total TTC")}</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {contenu.lignes.map((l) => (
                    <tr key={l.id}>
                      <td>{l.code || "—"}</td>
                      <td className="rc-tdonnees__principale rc-tdonnees__souple">{l.designation}</td>
                      <td style={{ textAlign: "end" }}>{l.quantite}</td>
                      {avecPrix && (
                        <>
                          <td style={{ textAlign: "end" }}>
                            <Money value={l.prix ?? 0} />
                          </td>
                          <td style={{ textAlign: "end" }}>{l.tva ?? 0} %</td>
                          <td style={{ textAlign: "end" }}>
                            <Money value={l.total ?? 0} />
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {contenu.totaux && (
              <div className="rc-transfo__totaux">
                {contenu.totaux.map((x) =>
                  x.fort ? (
                    <strong key={x.label}>
                      {x.label} <Money value={x.valeur} size="lg" />
                    </strong>
                  ) : (
                    <span key={x.label}>
                      {x.label} <Money value={x.valeur} size="sm" />
                    </span>
                  ),
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
