import { useEffect, useRef, useState } from "react";
import type { DashboardEvent, WSMessage, WorldSnapshot } from "../lib/types";
import { useWorldState } from "./use-world-state";

export function useDashboardWebSocket() {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const setSnapshot = useWorldState((s) => s.setSnapshot);
  const pushEvents = useWorldState((s) => s.pushEvents);

  // Batching refs — accumulate between frames, flush once per rAF
  const pendingSnapshotRef = useRef<WorldSnapshot | null>(null);
  const pendingEventsRef = useRef<DashboardEvent[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    let mounted = true;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function scheduleFlush() {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const snap = pendingSnapshotRef.current;
        const events = pendingEventsRef.current;
        pendingSnapshotRef.current = null;
        pendingEventsRef.current = [];

        if (snap) setSnapshot(snap);
        if (events.length > 0) pushEvents(events);
      });
    }

    function connect() {
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${protocol}//${location.host}/dashboard-ws`,
      );
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
            pendingSnapshotRef.current = msg.data;
          } else if (msg.type === "event") {
            pendingEventsRef.current.push(msg.data);
          }
          scheduleFlush();
        } catch {}
      };
    }

    connect();

    return () => {
      mounted = false;
      clearTimeout(reconnectTimer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      wsRef.current?.close();
    };
  }, [setSnapshot, pushEvents]);

  return { connected };
}
