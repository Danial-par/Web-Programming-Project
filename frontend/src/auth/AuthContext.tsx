import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError, setOnUnauthorized } from "../api/client";
import { endpoints } from "../api/endpoints";
import { clearTokens, getTokens, saveTokens, StoredTokens } from "./token";

export interface AuthUser {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  national_id?: string;
  roles: string[];
}

export interface RegisterPayload {
  username: string;
  email: string;
  phone: string;
  national_id: string;
  first_name: string;
  last_name: string;
  password: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isBootstrapping: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  const applyTokens = (tokens: StoredTokens | null) => {
    if (!tokens) {
      setAccessToken(null);
      setRefreshToken(null);
    } else {
      setAccessToken(tokens.access);
      setRefreshToken(tokens.refresh);
    }
  };

  const fetchMe = async () => {
    const me = await apiRequest<AuthUser>(endpoints.auth.me, {
      method: "GET"
    });
    // Ensure roles is always an array
    setUser({
      ...me,
      roles: Array.isArray((me as any).roles) ? (me as any).roles : []
    });
  };

  const logout = () => {
    clearTokens();
    applyTokens(null);
    setUser(null);
  };

  useEffect(() => {
    // Central 401 handling: log out on unauthorized
    setOnUnauthorized(() => {
      logout();
    });
    const stored = getTokens();
    if (!stored) {
      setIsBootstrapping(false);
      return;
    }
    applyTokens(stored);
    fetchMe()
      .catch(() => {
        logout();
      })
      .finally(() => {
        setIsBootstrapping(false);
      });

    return () => {
      setOnUnauthorized(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (identifier: string, password: string) => {
    try {
      const tokens = await apiRequest<{ access: string; refresh: string }>(endpoints.auth.login, {
        method: "POST",
        body: JSON.stringify({ identifier, password })
      });
      const stored: StoredTokens = { access: tokens.access, refresh: tokens.refresh };
      saveTokens(stored);
      applyTokens(stored);
      await fetchMe();
    } catch (err) {
      if (err instanceof ApiError) {
        throw err;
      }
      throw new Error("Login failed");
    }
  };

  const register = async (payload: RegisterPayload) => {
    try {
      await apiRequest(endpoints.auth.register, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      // Auto-login after successful registration using username as identifier
      await login(payload.username, payload.password);
    } catch (err) {
      if (err instanceof ApiError) {
        throw err;
      }
      throw new Error("Registration failed");
    }
  };

  const value = useMemo(
    () => ({
      user,
      accessToken,
      refreshToken,
      isBootstrapping,
      login,
      register,
      logout
    }),
    [user, accessToken, refreshToken, isBootstrapping]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuthContext = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return ctx;
};

