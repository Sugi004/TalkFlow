import api from "./axios";
import {User} from "@/types";

export const getMe = async (): Promise<User> => {
    const {data} = await api.get("/users/me");
    return data;
}

export const updateMe = async (payload: {full_name?: string, avatar_url?: string}): Promise<User> => {
    const {data} = await api.put("/users/me", payload);
    return data;
}

export const searchUsers = async (q: string): Promise<User[]> => {
    const {data} = await api.get("/users/search", {params: {q}});
    return data;
}

