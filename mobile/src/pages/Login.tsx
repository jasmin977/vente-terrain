import { useState } from "react";
import { Navigate } from "react-router-dom";
import { accueil } from "../utils/navigation";
import { IonContent, IonPage } from "@ionic/react";
import { eyeOffOutline, eyeOutline } from "ionicons/icons";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import { Button, Field, IconButton, Notice } from "../ui";
import { t } from "../i18n";

export default function Login() {
  const { user, login } = useAuth();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={accueil(user.role)} replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(code.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Connexion impossible"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="rc-login">
          <div className="rc-login__brand">
            <img
              className="rc-brandmark"
              src="/brand-mark.svg"
              alt=""
              width={72}
              height={72}
            />
            <h1 className="rc-login__title">{t("Vente Terrain")}</h1>
            <p className="rc-login__subtitle">{t("Connectez-vous pour continuer")}</p>
          </div>

          <form className="rc-login__form" onSubmit={handleSubmit} noValidate>
            <div className="rc-fields">
              <Field
                label={t("Code")}
                value={code}
                onChange={setCode}
                autoCapitalize="characters"
                autoComplete="username"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                required
              />
              <Field
                label={t("Mot de passe")}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                enterKeyHint="go"
                required
                suffix={
                  <IconButton
                    icon={showPassword ? eyeOffOutline : eyeOutline}
                    label={
                      showPassword
                        ? t("Masquer le mot de passe")
                        : t("Afficher le mot de passe")
                    }
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((v) => !v)}
                  />
                }
              />
            </div>

            {error && <Notice>{error}</Notice>}

            <Button
              type="submit"
              size="lg"
              block
              loading={submitting}
              disabled={!code || !password}
            >
              {t("Se connecter")}
            </Button>
          </form>
        </div>
      </IonContent>
    </IonPage>
  );
}
