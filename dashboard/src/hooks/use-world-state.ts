import { create } from "zustand";
import type { DashboardEvent, WorldSnapshot } from "../lib/types";

interface WorldState {
  // Real-time data (from WebSocket)
  worldName: string;
  startRoom: string;
  entities: WorldSnapshot["entities"];
  rooms: WorldSnapshot["rooms"];
  roomPopulations: Record<string, number>;
  connections: number;
  memory: { heapUsed: number; rss: number };
  eventFeed: DashboardEvent[];
  connectedSince: number; // timestamp when we first received data

  // UI selection state
  selectedRoom: string | null;
  selectedEntity: string | null;

  // Actions
  setSnapshot: (data: WorldSnapshot) => void;
  pushEvent: (event: DashboardEvent) => void;
  pushEvents: (events: DashboardEvent[]) => void;
  selectRoom: (roomId: string | null) => void;
  selectEntity: (name: string | null) => void;
}

export const useWorldState = create<WorldState>((set) => ({
  worldName: "",
  startRoom: "",
  entities: [],
  rooms: [],
  roomPopulations: {},
  connections: 0,
  memory: { heapUsed: 0, rss: 0 },
  eventFeed: [],
  connectedSince: 0,

  selectedRoom: null,
  selectedEntity: null,

  setSnapshot: (data) =>
    set((state) => ({
      worldName: data.worldName ?? state.worldName,
      startRoom: data.startRoom ?? state.startRoom,
      entities: data.entities,
      rooms: data.rooms ?? [],
      roomPopulations: data.roomPopulations,
      connections: data.connections,
      memory: data.memory,
      connectedSince: state.connectedSince || Date.now(),
    })),

  pushEvent: (event) =>
    set((state) => ({
      eventFeed: [event, ...state.eventFeed].slice(0, 200),
    })),

  pushEvents: (events) =>
    set((state) => ({
      eventFeed: [...events, ...state.eventFeed].slice(0, 200),
    })),

  selectRoom: (roomId) => set({ selectedRoom: roomId }),
  selectEntity: (name) => set({ selectedEntity: name }),
}));
