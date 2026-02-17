import { useEffect, useRef, useState } from "react";
import type { WSMessage } from "../lib/types";
import { useWorldState } from "./use-world-state";

export function useDashboardWebSocket() {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const setSnapshot = useWorldState((s) => s.setSnapshot);
  const pushEvent = useWorldState((s) => s.pushEvent);

  useEffect(() => {
    let mounted = true;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${location.host}/dashboard-ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (mounted) setConnected(true);
      };

      ws.onclose = () => {
        if (mounted) {
          setConnected(false);
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (e) => {
        try {
          const msg: WSMessage = JSON.parse(e.data);
          if (msg.type === "snapshot" || msg.type === "state") {
            setSnapshot(msg.data);
          } else if (msg.type === "event") {
            pushEvent(msg.data);
          }
        } catch {}
      };
    }

    connect();

    return () => {
      mounted = false;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [setSnapshot, pushEvent]);

  return { connected };
}
