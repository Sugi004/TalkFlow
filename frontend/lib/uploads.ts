import api from "./axios";
import {PresignedResponse} from "@/types";

export const getPresignedUrl = async (file_name: string, file_type: string, file_size: number): Promise<PresignedResponse> => {
    const {data} = await api.post("/uploads/presigned-url", {file_name, content_type: file_type, file_size});
    return data;
}

/**
 * Get presigned URL from backend
 * Put file directly to S3
 * Return the public file_url to embed in the message
 **/

export const uploadFile = async (file: File, onProgress?: (p: number) => void): Promise<string> => {
    const {upload_url, file_url} = await getPresignedUrl(file.name, file.type, file.size);
    await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", upload_url);
        xhr.setRequestHeader("Content-Type", file.type);
        if (onProgress){
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable){
                    onProgress(Math.round((e.loaded / e.total) * 100));
                }
            };
        }
        xhr.onload = () => (xhr.status < 300 ?  resolve() : reject(new Error(`Upload failed: {xhr.statusText} `)));
        xhr.onerror = () => reject(new Error("S3 Upload, network error"));
        xhr.send(file);
    });
    return file_url;
}

export const messageTypeFromMime = (mime: string): "image" | "video" | "file" => {
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    return "file";
}
    