import axios from "axios";

function resolveApiBaseUrl(): string | undefined {
    const raw = process.env.NEXT_PUBLIC_API_URL?.trim();

    if (!raw) {
        if (typeof window !== "undefined") {
            return window.location.origin;
        }
        return undefined;
    }

    try {
        const url = new URL(raw);

        // Always upgrade remote API hosts to HTTPS.
        // Keep localhost and 127.0.0.1 untouched for local backend development.
        if (
            url.protocol === "http:"
            && url.hostname !== "localhost"
            && url.hostname !== "127.0.0.1"
        ) {
            url.protocol = "https:";
        }

        return url.toString().replace(/\/$/, "");
    } catch {
        return raw.replace(/\/$/, "");
    }
}

const api = axios.create({
    baseURL: resolveApiBaseUrl(),
});


api.interceptors.request.use((config) => {
    config.baseURL = resolveApiBaseUrl();
    if (typeof window !== "undefined"){
        const token = sessionStorage.getItem("token");
        if (token){
            config.headers.Authorization = `Bearer ${token}`;
        }
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        const isAuthRoute = window.location.pathname === "/login" || window.location.pathname === "/register";
        if (error.response?.status === 401 && !isAuthRoute){
            if(typeof window !== "undefined"){
                sessionStorage.removeItem("token");
                window.location.href = "/login";
            }
        }
        return Promise.reject(error);
    }
);

export default api;
