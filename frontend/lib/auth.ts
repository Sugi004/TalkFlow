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

interface AuthPublicKeyResponse {
    public_key: string;
    algorithm: string;
}

let authPublicKeyPromise: Promise<CryptoKey> | null = null;

function isLocalHostname(hostname: string): boolean {
    return hostname === "localhost" || hostname === "127.0.0.1";
}

function assertSecureAuthContext() {
    if (typeof window === "undefined") return;
    if (window.isSecureContext || isLocalHostname(window.location.hostname)) return;
    throw new Error("Authentication requires HTTPS outside local development.");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
    const base64 = pem
        .replace("-----BEGIN PUBLIC KEY-----", "")
        .replace("-----END PUBLIC KEY-----", "")
        .replace(/\s+/g, "");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

async function getAuthPublicKey(): Promise<CryptoKey> {
    assertSecureAuthContext();
    if (!authPublicKeyPromise) {
        authPublicKeyPromise = api.get<AuthPublicKeyResponse>("/auth/public-key").then(async ({ data }) => {
            return window.crypto.subtle.importKey(
                "spki",
                pemToArrayBuffer(data.public_key),
                {
                    name: "RSA-OAEP",
                    hash: "SHA-256",
                },
                false,
                ["encrypt"],
            );
        });
    }
    return authPublicKeyPromise;
}

async function encryptPassword(password: string): Promise<{ password: string; password_encrypted: boolean }> {
    const publicKey = await getAuthPublicKey();
    const encoded = new TextEncoder().encode(password);
    const encrypted = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, encoded);
    return {
        password: arrayBufferToBase64(encrypted),
        password_encrypted: true,
    };
}

export const login = async (email: string, password: string): Promise<Token> => {
    const secret = await encryptPassword(password);
    const {data} = await api.post("/auth/login", {
        email,
        password: secret.password,
        password_encrypted: secret.password_encrypted,
    });
    return data;
};

export const register = async (email: string, password: string, full_name?: string): Promise<Token> => {
    const secret = await encryptPassword(password);
    const {data} = await api.post("/auth/register", {
        email,
        password: secret.password,
        password_encrypted: secret.password_encrypted,
        full_name,
    });
    return data;
};

export function getErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  const detail = (error as ApiErrorShape)?.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map((entry) => entry.msg).filter(Boolean).join(", ");
  if (typeof detail === "string") return detail;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
