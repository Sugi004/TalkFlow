import axios from "axios";


const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL,
});

api.interceptors.request.use((config) => {
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