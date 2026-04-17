import api from "./axios";
import type { Token } from "@/types";

interface ErrorResponseDetail {
    msg?: string;
}

interface ApiErrorShape {
    response?: {
        data?: {
            detail?: string | ErrorResponseDetail[];
        };
    };
}

export const login = async (email: string, password: string): Promise<Token> => {
    const formData = new URLSearchParams();
    formData.append("username", email);
    formData.append("password", password);

    const {data} = await api.post("/auth/token", formData, {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
    });
    return data;
};

export const register = async (email: string, password: string, full_name?: string): Promise<Token> => {
    const {data} = await api.post("/auth/register", {
        email,
        password,
        full_name,
    });
    return data;
};

export function getErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  const detail = (error as ApiErrorShape)?.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map((entry) => entry.msg).filter(Boolean).join(", ");
  if (typeof detail === "string") return detail;
  return fallback;
}
