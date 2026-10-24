import { useEffect, useState } from "react";
import { addOutline, checkmarkOutline, createOutline, trashOutline } from "ionicons/icons";
import { ApiError } from "../../api/client";
import { createCategorieDepense, deleteCategorieDepense, listCategoriesDepense, renommerCategorieDepense } from "../../api/depenses";
import type { CategorieDepense } from "../../types/depense";
import { Button, Field, IconButton, PageNotice, Sheet } from "../../ui";
import { t } from "../../i18n";

/** Catégories de dépenses : ajouter, renommer, retirer (les dépenses déjà saisies gardent la leur). */
export default function CategoriesDepenseSheet({ isOpen, onDismiss, onChange }: { isOpen: boolean; onDismiss: () => void; onChange: () => void }) {
  const [categories, setCategories] = useState<CategorieDepense[]>([]);
  const [nouvelle, setNouvelle] = useState("");
  const [edition, setEdition] = useState<{ id: string; nom: string } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = () => listCategoriesDepense().then(setCategories).catch(() => undefined);

  useEffect(() => {
    if (!isOpen) return;
    setNouvelle("");
    setEdition(null);
    setErreur(null);
    charger();
  }, [isOpen]);

  const agir = async (action: () => Promise<unknown>) => {
    setErreur(null);
    try {
      await action();
      await charger();
      onChange();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Opération impossible"));
    }
  };

  return (
    <Sheet isOpen={isOpen} title={t("Catégories de dépenses")} height="auto" onDismiss={onDismiss}>
      <div className="rc-achat__form">
        {erreur && <PageNotice>{erreur}</PageNotice>}
        <div className="rc-depense__ajout">
          <Field label={t("Nouvelle catégorie")} hideLabel value={nouvelle} placeholder={t("Nouvelle catégorie")} onChange={setNouvelle} />
          <Button
            icon={addOutline}
            disabled={!nouvelle.trim()}
            onClick={() =>
              agir(async () => {
                await createCategorieDepense(nouvelle.trim());
                setNouvelle("");
              })
            }
          >
            {t("Ajouter")}
          </Button>
        </div>
        <ul className="rc-depense__categories">
          {categories.map((c) => (
            <li key={c.id}>
              {edition?.id === c.id ? (
                <>
                  <Field label={t("Nom")} hideLabel value={edition.nom} onChange={(v) => setEdition({ id: c.id, nom: v })} />
                  <IconButton
                    icon={checkmarkOutline}
                    label={t("Enregistrer")}
                    disabled={!edition.nom.trim()}
                    onClick={() =>
                      agir(async () => {
                        await renommerCategorieDepense(c.id, edition.nom.trim());
                        setEdition(null);
                      })
                    }
                  />
                </>
              ) : (
                <>
                  <span>{c.nom}</span>
                  <IconButton icon={createOutline} size="sm" label={t("Renommer")} onClick={() => setEdition({ id: c.id, nom: c.nom })} />
                </>
              )}
              <IconButton icon={trashOutline} tone="danger" size="sm" label={t("Retirer")} onClick={() => agir(() => deleteCategorieDepense(c.id))} />
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}
