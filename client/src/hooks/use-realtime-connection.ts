import { useEffect, useRef, useState } from "react";
import { REALTIME_WS_URL } from "@/lib/constants";

export type RealtimeStatus = "connecting" | "connected" | "offline";

export type RealtimeMessage = {
  type?: string;
  connectionId?: string;
  [key: string]: unknown;
};

export const useRealtimeConnection = () => {
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const [lastMessage, setLastMessage] = useState<RealtimeMessage | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let active = true;
    let retryTimer: number | null = null;

    const connect = () => {
      if (!active) return;
      setStatus("connecting");

      const socket = new WebSocket(REALTIME_WS_URL);
      socketRef.current = socket;

      socket.onopen = () => {
        if (!active) return;
        setStatus("connected");
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as RealtimeMessage;
          setLastMessage(payload);
          if (payload.type === "realtime:welcome" && typeof payload.connectionId === "string") {
            setConnectionId(payload.connectionId);
          }
        } catch {
          // Ignore invalid payloads.
        }
      };

      socket.onerror = () => {
        socket.close();
      };

      socket.onclose = () => {
        if (!active) return;
        setStatus("offline");
        setConnectionId(null);
        retryTimer = window.setTimeout(connect, 1800);
      };
    };

    connect();

    return () => {
      active = false;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  return { connectionId, status, lastMessage };
};
