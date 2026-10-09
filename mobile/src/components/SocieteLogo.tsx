import { useState } from "react";
import { urlImage } from "../offline/images";
import { initials } from "../utils/labels";

/** Logo de la société, ou ses initiales tant qu'elle n'en a pas. */
export default function SocieteLogo({ nom, logo, size = 48 }: { nom: string; logo?: string | null; size?: number }) {
  const [echec, setEchec] = useState(false);
  const url = urlImage(logo);
  const style = { width: size, height: size };
  if (url && !echec) {
    return <img className="rc-societe-logo" src={url} alt="" width={size} height={size} style={style} onError={() => setEchec(true)} />;
  }
  return (
    <span className="rc-societe-logo rc-societe-logo--initiales" style={{ ...style, fontSize: size * 0.36 }} aria-hidden="true">
      {initials(nom)}
    </span>
  );
}
