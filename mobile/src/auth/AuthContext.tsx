import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as authApi from "../api/auth";
import { ApiError, getToken, setToken, setUnauthorizedHandler } from "../api/client";
import type { AuthUser } from "../types/auth";
import { definirSession, memoriserUtilisateur, utilisateurMemorise } from "../offline/stockage";
import { oublierFileEnMemoire } from "../offline/file";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (code: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Le compte connecté détermine aussi l'espace de stockage hors ligne utilisé.
function appliquerSession(user: AuthUser | null) {
  definirSession(user);
  oublierFileEnMemoire();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const setUser = (u: AuthUser | null) => {
    appliquerSession(u);
    setUserState(u);
  };

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    (async () => {
      const token = await getToken();
      if (token) {
        try {
          const current = await authApi.me();
          await memoriserUtilisateur(current);
          setUser(current);
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            await setToken(null);
          } else {
            // Pas de réseau (vendeur sur le terrain) : on garde la session et le
            // dernier compte connu ; le serveur vérifiera le jeton au retour du réseau.
            const memorise = await utilisateurMemorise();
            if (memorise) setUser(memorise);
          }
        }
      }
      setLoading(false);
    })();
    return () => setUnauthorizedHandler(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async login(code, password) {
        const res = await authApi.login(code, password);
        await setToken(res.token);
        await memoriserUtilisateur(res.user);
        setUser(res.user);
      },
      // Les actions non envoyées restent rangées sous ce compte : elles partiront
      // à sa prochaine connexion.
      async logout() {
        await setToken(null);
        await memoriserUtilisateur(null);
        setUser(null);
      },
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans un AuthProvider");
  return ctx;
}
