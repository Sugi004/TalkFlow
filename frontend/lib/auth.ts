import api from "./axios";
import type { Token } from "@/types";

export const login = async (email: string, password: string) => {
    const response = await api.post("/auth/login", {
        email,
        password,
    });
    return response.data;
};

export const register = async (email: string, password: string, full_name?: string): Promise<Token> => {
    const response = await api.post("/auth/register", {
        email,
        password,
        full_name,
    });
    return response.data;
};