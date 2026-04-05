import api from "./axios"

export const summarizeConversation = async (conversation_id: number): Promise<string> => {
    const {data} = await api.post("ai/summarize", {conversation_id: conversation_id});
    return data.summary;
}

export const getSmartReply = async (conversation_id: number): Promise<string[]> => {
    const {data} = await api.post("ai/smart-reply", {conversation_id: conversation_id});
    return data.suggestions ?? [];
}

export const translateMessage = async (content: string, target_language: string): Promise<string> => {
    const {data} = await api.post("ai/translate", {content: content, target_language: target_language});
    return data.translated;
}