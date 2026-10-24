import { useRef, useState, type PointerEvent } from "react";

/**
 * Rangement par glisser-déposer, à la souris comme au doigt (événements pointer, sans bibliothèque) : appui sur la
 * poignée, puis l'élément suit le pointeur parmi les éléments marqués du même groupe. La liste est réordonnée en
 * direct (onChange à chaque déplacement). Le suivi se fait sur la fenêtre : React déplace l'élément dans le DOM à
 * chaque réordonnancement, ce qui ferait perdre une capture du pointeur posée sur la poignée.
 */
export function useTriGlisser<T>(groupe: string, liste: T[], onChange: (l: T[]) => void) {
  const [glisse, setGlisse] = useState<number | null>(null);
  const ref = useRef({ liste, onChange, i: -1 });
  ref.current.liste = liste;
  ref.current.onChange = onChange;

  const deplacer = (e: globalThis.PointerEvent) => {
    const i = ref.current.i;
    if (i < 0) return;
    const cible = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(`[data-tri="${groupe}"]`);
    const j = Number(cible?.dataset.triIndex);
    if (!cible || Number.isNaN(j) || j === i) return;
    const l = [...ref.current.liste];
    const [x] = l.splice(i, 1);
    l.splice(j, 0, x);
    ref.current.i = j;
    ref.current.liste = l;
    setGlisse(j);
    ref.current.onChange(l);
  };

  const poignee = (index: number) => ({
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      ref.current.i = index;
      setGlisse(index);
      const fin = () => {
        ref.current.i = -1;
        setGlisse(null);
        window.removeEventListener("pointermove", deplacer);
        window.removeEventListener("pointerup", fin);
        window.removeEventListener("pointercancel", fin);
      };
      window.addEventListener("pointermove", deplacer);
      window.addEventListener("pointerup", fin);
      window.addEventListener("pointercancel", fin);
    },
    onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
    style: { touchAction: "none", cursor: glisse === null ? "grab" : "grabbing" } as const,
  });
  /** À poser sur chaque élément de la liste (repère de dépôt). */
  const element = (index: number) => ({ "data-tri": groupe, "data-tri-index": index });
  return { glisse, poignee, element };
}
