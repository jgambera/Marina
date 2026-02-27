import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "../lib/api";
import type {
  BoardDetail,
  BoardEntry,
  ChannelDetail,
  ChannelEntry,
  ConnectorEntry,
  DynamicCommandEntry,
  EntityDetail,
  GroupDetail,
  GroupEntry,
  MemoryPool,
  ProjectEntry,
  RoomDetail,
  SystemData,
  TaskDetail,
  TaskEntry,
  WorldData,
} from "../lib/types";

export function useWorld() {
  return useQuery({
    queryKey: ["world"],
    queryFn: () => fetchApi<WorldData>("/api/world"),
    staleTime: 60_000,
  });
}

export function useSystem() {
  return useQuery({
    queryKey: ["system"],
    queryFn: () => fetchApi<SystemData>("/api/system"),
    refetchInterval: 10_000,
  });
}

export function useRoomDetail(roomId: string | null) {
  return useQuery({
    queryKey: ["room", roomId],
    queryFn: () => fetchApi<RoomDetail>(`/api/rooms/${encodeURIComponent(roomId!)}`),
    enabled: !!roomId,
  });
}

export function useEntityDetail(name: string | null) {
  return useQuery({
    queryKey: ["entity", name],
    queryFn: () => fetchApi<EntityDetail>(`/api/entities/${encodeURIComponent(name!)}`),
    enabled: !!name,
  });
}

export function useBoards() {
  return useQuery({
    queryKey: ["boards"],
    queryFn: () => fetchApi<BoardEntry[]>("/api/coordination/boards"),
    staleTime: 30_000,
  });
}

export function useTasks() {
  return useQuery({
    queryKey: ["tasks"],
    queryFn: () => fetchApi<TaskEntry[]>("/api/coordination/tasks"),
    staleTime: 30_000,
  });
}

export function useChannels() {
  return useQuery({
    queryKey: ["channels"],
    queryFn: () => fetchApi<ChannelEntry[]>("/api/coordination/channels"),
    staleTime: 30_000,
  });
}

export function useGroups() {
  return useQuery({
    queryKey: ["groups"],
    queryFn: () => fetchApi<GroupEntry[]>("/api/coordination/groups"),
    staleTime: 30_000,
  });
}

export function useMemoryPools() {
  return useQuery({
    queryKey: ["pools"],
    queryFn: () => fetchApi<MemoryPool[]>("/api/memory/pools"),
    staleTime: 30_000,
  });
}

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => fetchApi<ProjectEntry[]>("/api/coordination/projects"),
    staleTime: 30_000,
  });
}

export function useConnectors() {
  return useQuery({
    queryKey: ["connectors"],
    queryFn: () => fetchApi<ConnectorEntry[]>("/api/connectors"),
    staleTime: 30_000,
  });
}

export function useDynamicCommands() {
  return useQuery({
    queryKey: ["commands"],
    queryFn: () => fetchApi<DynamicCommandEntry[]>("/api/commands"),
    staleTime: 30_000,
  });
}

export function useTaskDetail(id: number | null) {
  return useQuery({
    queryKey: ["taskDetail", id],
    queryFn: () => fetchApi<TaskDetail>(`/api/coordination/tasks/${id}`),
    enabled: id !== null,
  });
}

export function useBoardDetail(name: string | null) {
  return useQuery({
    queryKey: ["boardDetail", name],
    queryFn: () => fetchApi<BoardDetail>(`/api/coordination/boards/${encodeURIComponent(name!)}`),
    enabled: !!name,
  });
}

export function useGroupDetail(name: string | null) {
  return useQuery({
    queryKey: ["groupDetail", name],
    queryFn: () => fetchApi<GroupDetail>(`/api/coordination/groups/${encodeURIComponent(name!)}`),
    enabled: !!name,
  });
}

export function useChannelDetail(name: string | null) {
  return useQuery({
    queryKey: ["channelDetail", name],
    queryFn: () =>
      fetchApi<ChannelDetail>(`/api/coordination/channels/${encodeURIComponent(name!)}`),
    enabled: !!name,
  });
}
