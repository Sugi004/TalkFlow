"use client"

import { useEffect, useRef, useCallback } from "react"
import { Message } from "@/types"

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";

export function useGlobalSocket({
    user_id ,
    token,
    onMessage
}:{
    user_id: number | null;
    token: string | null;
    onMessage: (msg: Message) => void
}){
    const wsRef = useRef<WebSocket | null>(null);
    const retryTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const retryCount = useRef(0)
    const onMessageRef = useRef(onMessage)


    useEffect(() => {
        onMessageRef.current = onMessage
    }, [])

    const connect = useCallback(() => {
        if(!user_id || !token) return;

        const url = `${WS_URL}/user/${user_id}?token = ${token}`
        const ws = new WebSocket(url)
        wsRef.current = ws
        
        ws.onmessage=(e)=>{
            try{
                const msg = JSON.parse(e.data)
                if(msg.type === "message"){
                    onMessageRef.current(msg as Message)
                }
            }catch {}
        }   

        ws.onclose=()=>{
          if(wsRef.current !== ws) return;
          if(retryCount.current <5){
            retryCount.current++
            const delay = Math.min(1000 * Math.pow(2, retryCount.current - 1), 30000)
            retryTimeout.current = setTimeout(() => {
                connect()
            }, delay)
          }    
        }

        ws.onerror=()=>{
            ws.close()
        }
    },[user_id, token])

    useEffect(() => {
        if(retryTimeout.current){
            clearTimeout(retryTimeout.current)
        }
        wsRef.current?.close()
        retryCount.current =   0
        connect()
        return ()=>{
            if(retryTimeout.current) clearTimeout(retryTimeout.current)
            wsRef.current?.close()
        }
    },[connect])

    


}