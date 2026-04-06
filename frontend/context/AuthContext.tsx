"use client"

import { createContext, useContext, useState, useEffect, useCallback } from "react";

interface AuthContextType {
    token: string | null;
    isAuthenticated: boolean;
    login: (token: string) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [token, setToken] = useState<string | null>(() => {
        if (typeof window !== "undefined") {
            return sessionStorage.getItem("token");
        }
        return null;
    });

    const login = useCallback((token: string) => {
        sessionStorage.setItem("token", token);
        setToken(token);
    }, []);

    const logout = useCallback(() => {
        sessionStorage.removeItem("token");
        setToken(null);
    }, []);

    return (
        <AuthContext.Provider value={{ token, isAuthenticated: !!token, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};