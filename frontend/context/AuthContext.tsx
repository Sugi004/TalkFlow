"use client"

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { User } from "@/types";
import api from "@/lib/axios";
import { useRouter } from "next/navigation";
import { AuthContextType } from "@/types";



const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const router = useRouter();
    const [token, setToken] = useState<string | null>(() => {
        if (typeof window !== "undefined") {
            return sessionStorage.getItem("token");
        }
        return null;
    });
    const [currentUser, setCurrentUser] = useState<User | null>(null);

    useEffect(() => {
        if (typeof window === "undefined") return;

        if (token) {
            api.get("/users/me").then((res) => {
                setCurrentUser(res.data);
            }).catch(() => {
                setCurrentUser(null);
            });
        }
    }, [token]);

    const login = useCallback((token: string) => {
        sessionStorage.removeItem("token");
        sessionStorage.setItem("token", token);
        setToken(token);
        setCurrentUser(null);
    }, []);

    const logout = useCallback(() => {
        sessionStorage.removeItem("token");
        setToken(null);
        setCurrentUser(null);
    }, []);

    const refreshUser = useCallback(() => {
        if (!token) {
            setCurrentUser(null);
            router.push("/login");
            return;
        }
        api.get("/users/me").then((res) => {
            setCurrentUser(res.data)
        }).catch(() => {
            setCurrentUser(null)
        })
    }, [token])

    return (
        <AuthContext.Provider value={{ token, isAuthenticated: !!token, currentUser, login, logout, refreshUser }}>
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