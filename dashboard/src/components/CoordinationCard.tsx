import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Code2,
  FolderKanban,
  Hash,
  Layers,
  MessageSquare,
  Plug,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useBoardDetail,
  useBoards,
  useChannelDetail,
  useChannels,
  useConnectors,
  useDynamicCommands,
  useGroupDetail,
  useGroups,
  useMemoryPools,
  useProjects,
  useTaskDetail,
  useTasks,
} from "../hooks/use-api";
import { SPRING_GENTLE, animate, prefersReducedMotion, stagger } from "../lib/animations";
import { cn, formatTime } from "../lib/utils";
import { GlassPanel } from "./GlassPanel";

type Section =
  | "projects"
  | "boards"
  | "tasks"
  | "channels"
  | "groups"
  | "pools"
  | "connectors"
  | "commands"
  | null;

const SECTIONS: Section[] = [
  "projects",
  "tasks",
  "boards",
  "groups",
  "channels",
  "pools",
  "connectors",
  "commands",
];

export function CoordinationCard({
  backContent,
}: {
  backContent?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState<Section>(null);
  const [highlightedSection, setHighlightedSection] = useState<number | null>(null);

  const toggle = (section: Section) => setExpanded((prev) => (prev === section ? null : section));

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
        case "j":
          e.preventDefault();
          setHighlightedSection((prev) => {
            if (prev === null) return 0;
            return Math.min(prev + 1, SECTIONS.length - 1);
          });
          break;
        case "ArrowUp":
        case "k":
          e.preventDefault();
          setHighlightedSection((prev) => {
            if (prev === null) return SECTIONS.length - 1;
            return Math.max(prev - 1, 0);
          });
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (highlightedSection !== null) {
            const section = SECTIONS[highlightedSection]!;
            toggle(section);
          }
          break;
        case "Home":
          e.preventDefault();
          setHighlightedSection(0);
          break;
        case "End":
          e.preventDefault();
          setHighlightedSection(SECTIONS.length - 1);
          break;
        case "Escape":
          if (expanded) {
            setExpanded(null);
          } else {
            setHighlightedSection(null);
          }
          break;
      }
    },
    [highlightedSection, expanded],
  );

  return (
    <GlassPanel title="Coordination" icon={<Layers size={14} />} backContent={backContent}>
      <div onKeyDown={onKeyDown} className="flex flex-col text-[11px] outline-none">
        <SectionRow
          label="Projects"
          icon={<FolderKanban size={11} />}
          isOpen={expanded === "projects"}
          isHighlighted={highlightedSection === 0}
          onClick={() => toggle("projects")}
        >
          <ProjectsList />
        </SectionRow>

        <SectionRow
          label="Tasks"
          icon={<Hash size={11} />}
          isOpen={expanded === "tasks"}
          isHighlighted={highlightedSection === 1}
          onClick={() => toggle("tasks")}
        >
          <TasksList />
        </SectionRow>

        <SectionRow
          label="Boards"
          icon={<ClipboardList size={11} />}
          isOpen={expanded === "boards"}
          isHighlighted={highlightedSection === 2}
          onClick={() => toggle("boards")}
        >
          <BoardsList />
        </SectionRow>

        <SectionRow
          label="Groups"
          icon={<UsersRound size={11} />}
          isOpen={expanded === "groups"}
          isHighlighted={highlightedSection === 3}
          onClick={() => toggle("groups")}
        >
          <GroupsList />
        </SectionRow>

        <SectionRow
          label="Channels"
          icon={<MessageSquare size={11} />}
          isOpen={expanded === "channels"}
          isHighlighted={highlightedSection === 4}
          onClick={() => toggle("channels")}
        >
          <ChannelsList />
        </SectionRow>

        <SectionRow
          label="Pools"
          icon={<Layers size={11} />}
          isOpen={expanded === "pools"}
          isHighlighted={highlightedSection === 5}
          onClick={() => toggle("pools")}
        >
          <PoolsList />
        </SectionRow>

        <SectionRow
          label="Connectors"
          icon={<Plug size={11} />}
          isOpen={expanded === "connectors"}
          isHighlighted={highlightedSection === 6}
          onClick={() => toggle("connectors")}
        >
          <ConnectorsList />
        </SectionRow>

        <SectionRow
          label="Commands"
          icon={<Code2 size={11} />}
          isOpen={expanded === "commands"}
          isHighlighted={highlightedSection === 7}
          onClick={() => toggle("commands")}
        >
          <CommandsList />
        </SectionRow>
      </div>
    </GlassPanel>
  );
}

function SectionRow({
  label,
  icon,
  isOpen,
  isHighlighted,
  onClick,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  isOpen: boolean;
  isHighlighted?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !contentRef.current || prefersReducedMotion()) return;

    const el = contentRef.current;
    const scrollH = el.scrollHeight;

    animate(el, {
      height: [0, scrollH],
      opacity: [0, 1],
      ease: SPRING_GENTLE,
      duration: 400,
    });

    // Stagger child items
    const items = el.querySelectorAll(":scope > div > div, :scope > div > button");
    if (items.length > 0) {
      animate(items, {
        opacity: [0, 1],
        translateY: [8, 0],
        delay: stagger(40),
        duration: 300,
        ease: "outQuad",
      });
    }
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex items-center gap-2 px-2 py-1 hover:bg-bg-hover transition-colors",
          isOpen && "bg-bg-hover",
          isHighlighted && "ring-1 ring-primary/40",
        )}
      >
        <span className="text-secondary">{icon}</span>
        <span className="flex-1 text-left text-text-bright">{label}</span>
        {isOpen ? (
          <ChevronDown size={10} className="text-text-dim" />
        ) : (
          <ChevronRight size={10} className="text-text-dim" />
        )}
      </button>
      {isOpen && (
        <div
          ref={contentRef}
          className="border-t border-border bg-bg-card px-2 py-1 overflow-hidden"
        >
          {children}
        </div>
      )}
    </>
  );
}

// --- Status helpers ---

const statusColor: Record<string, string> = {
  open: "text-success",
  claimed: "text-warning",
  submitted: "text-secondary",
  completed: "text-text-dim",
  active: "text-success",
  paused: "text-warning",
  archived: "text-text-dim",
  connected: "text-success",
  disconnected: "text-danger",
  error: "text-danger",
};

function StatusDot({ status }: { status: string }) {
  const color =
    status === "connected" || status === "active"
      ? "#22c55e"
      : status === "error" || status === "disconnected"
        ? "#ef4444"
        : "#888";
  return (
    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
  );
}

// --- Projects ---

function ProjectsList() {
  const { data, isLoading } = useProjects();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) return <div className="text-text-dim">Loading...</div>;
  if (!data?.length) return <div className="text-text-dim">No projects</div>;

  return (
    <div className="flex flex-col gap-0.5">
      {data.map((p) => (
        <div key={p.id}>
          <button
            type="button"
            onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
            className="flex w-full items-center gap-1.5 py-0.5 hover:bg-bg-hover transition-colors text-left"
          >
            <span className="text-text-bright truncate flex-1">{p.name}</span>
            <span className="text-text-dim text-[10px]">{p.orchestration}</span>
            <span className={cn("text-[10px]", statusColor[p.status] ?? "text-text-dim")}>
              {p.status}
            </span>
          </button>
          {expandedId === p.id && (
            <div className="animate-fade-in border-l-2 border-primary/30 ml-2 pl-2 py-1 text-[10px]">
              <div className="text-text">{p.description}</div>
              <div className="flex gap-3 mt-1">
                <span className="text-text-dim">
                  Memory: <span className="text-text">{p.memory_arch}</span>
                </span>
                <span className="text-text-dim">
                  By: <span className="text-text">{p.created_by}</span>
                </span>
              </div>
              {p.bundleProgress && (
                <div className="mt-1">
                  <div className="flex justify-between text-text-dim">
                    <span>Bundle progress</span>
                    <span>
                      {p.bundleProgress.done}/{p.bundleProgress.total}
                    </span>
                  </div>
                  <div className="mt-0.5 h-1.5 w-full rounded-full bg-bg-hover">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width:
                          p.bundleProgress.total > 0
                            ? `${(p.bundleProgress.done / p.bundleProgress.total) * 100}%`
                            : "0%",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Tasks ---

function TasksList() {
  const { data, isLoading } = useTasks();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (isLoading) return <div className="text-text-dim">Loading...</div>;
  if (!data?.length) return <div className="text-text-dim">No tasks</div>;

  return (
    <div className="flex flex-col gap-0.5">
      {data.map((t) => (
        <div key={t.id}>
          <button
            type="button"
            onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
            className="flex w-full items-center gap-1.5 py-0.5 hover:bg-bg-hover transition-colors text-left"
          >
            <span className={cn("text-[10px]", statusColor[t.status] ?? "text-text-dim")}>
              [{t.status}]
            </span>
            <span className="truncate text-text flex-1">
              #{t.id} {t.title}
            </span>
          </button>
          {expandedId === t.id && <TaskDetailPanel taskId={t.id} />}
        </div>
      ))}
    </div>
  );
}

function TaskDetailPanel({ taskId }: { taskId: number }) {
  const { data, isLoading } = useTaskDetail(taskId);

  if (isLoading) return <div className="text-text-dim text-[10px] ml-2 pl-2">Loading...</div>;
  if (!data) return null;

  return (
    <div className="animate-fade-in border-l-2 border-primary/30 ml-2 pl-2 py-1 text-[10px]">
      {data.description && <div className="text-text">{data.description}</div>}
      <div className="flex gap-3 mt-1 text-text-dim">
        <span>
          Creator: <span className="text-text">{data.creator_name}</span>
        </span>
        {data.parent_task_id && (
          <span>
            Bundle: <span className="text-text">#{data.parent_task_id}</span>
          </span>
        )}
      </div>
      {data.children && data.children.length > 0 && (
        <div className="mt-1">
          <div className="text-primary text-[9px] uppercase tracking-wider mb-0.5">Subtasks</div>
          {data.children.map((c) => (
            <div key={c.id} className="flex items-center gap-1">
              <span className={cn("text-[9px]", statusColor[c.status] ?? "text-text-dim")}>
                [{c.status}]
              </span>
              <span className="text-text truncate">
                #{c.id} {c.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Boards ---

function BoardsList() {
  const { data, isLoading } = useBoards();
  const [expandedName, setExpandedName] = useState<string | null>(null);

  if (isLoading) return <div className="text-text-dim">Loading...</div>;
  if (!data?.length) return <div className="text-text-dim">No boards</div>;

  return (
    <div className="flex flex-col gap-0.5">
      {data.map((b) => (
        <div key={b.id}>
          <button
            type="button"
            onClick={() => setExpandedName(expandedName === b.name ? null : b.name)}
            className="flex w-full justify-between py-0.5 hover:bg-bg-hover transition-colors"
          >
            <span className="text-text">{b.name}</span>
            <span className="text-text-dim">{b.postCount} posts</span>
          </button>
          {expandedName === b.name && <BoardDetailPanel name={b.name} />}
        </div>
      ))}
    </div>
  );
}

function BoardDetailPanel({ name }: { name: string }) {
  const { data, isLoading } = useBoardDetail(name);

  if (isLoading) return <div className="text-text-dim text-[10px] ml-2 pl-2">Loading...</div>;
  if (!data?.posts?.length)
    return <div className="text-text-dim text-[10px] ml-2 pl-2">No posts</div>;

  return (
    <div className="animate-fade-in border-l-2 border-primary/30 ml-2 pl-2 py-1 text-[10px]">
      {data.posts.map((p) => (
        <div key={p.id} className="flex gap-1 leading-tight mb-0.5">
          <span className="text-secondary truncate">{p.title}</span>
          <span className="text-text-dim">by {p.author_name}</span>
        </div>
      ))}
    </div>
  );
}

// --- Groups ---

function GroupsList() {
  const { data, isLoading } = useGroups();
  const [expandedName, setExpandedName] = useState<string | null>(null);

  if (isLoading) return <div className="text-text-dim">Loading...</div>;
  if (!data?.length) return <div className="text-text-dim">No groups</div>;

  return (
    <div className="flex flex-col gap-0.5">
      {data.map((g) => (
        <div key={g.id}>
          <button
            type="button"
            onClick={() => setExpandedName(expandedName === g.name ? null : g.name)}
            className="flex w-full justify-between py-0.5 hover:bg-bg-hover transition-colors"
          >
            <span className="text-text">{g.name}</span>
            <span className="text-text-dim">{g.memberCount} members</span>
          </button>
          {expandedName === g.name && <GroupDetailPanel name={g.name} />}
        </div>
      ))}
    </div>
  );
}

function GroupDetailPanel({ name }: { name: string }) {
  const { data, isLoading } = useGroupDetail(name);

  if (isLoading) return <div className="text-text-dim text-[10px] ml-2 pl-2">Loading...</div>;
  if (!data) return null;

  return (
    <div className="animate-fade-in border-l-2 border-primary/30 ml-2 pl-2 py-1 text-[10px]">
      {data.description && <div className="text-text mb-1">{data.description}</div>}
      <div className="text-text-dim mb-0.5">
        Leader: <span className="text-text">{data.leader_id}</span>
      </div>
      {data.members.length > 0 && (
        <div>
          {data.members.map((m) => (
            <div key={m.entity_id} className="flex gap-1 leading-tight">
              <span className="text-text">{m.entity_id}</span>
              <span className="text-text-dim">rank {m.rank}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Channels ---

function ChannelsList() {
  const { data, isLoading } = useChannels();
  const [expandedName, setExpandedName] = useState<string | null>(null);

  if (isLoading) return <div className="text-text-dim">Loading...</div>;
  if (!data?.length) return <div className="text-text-dim">No channels</div>;

  return (
    <div className="flex flex-col gap-0.5">
      {data.map((c) => (
        <div key={c.id}>
          <button
            type="button"
            onClick={() => setExpandedName(expandedName === c.name ? null : c.name)}
            className="flex w-full justify-between py-0.5 hover:bg-bg-hover transition-colors"
          >
            <span className="text-text">#{c.name}</span>
            <span className="text-text-dim">{c.type}</span>
          </button>
          {expandedName === c.name && <ChannelDetailPanel name={c.name} />}
        </div>
      ))}
    </div>
  );
}

function ChannelDetailPanel({ name }: { name: string }) {
  const { data, isLoading } = useChannelDetail(name);

  if (isLoading) return <div className="text-text-dim text-[10px] ml-2 pl-2">Loading...</div>;
  if (!data?.messages?.length)
    return <div className="text-text-dim text-[10px] ml-2 pl-2">No messages</div>;

  return (
    <div className="animate-fade-in border-l-2 border-primary/30 ml-2 pl-2 py-1 text-[10px]">
      {data.messages.map((m, i) => (
        <div key={i} className="flex gap-1 leading-tight mb-0.5">
          <span className="text-text-dim shrink-0">{formatTime(m.created_at)}</span>
          <span className="text-secondary shrink-0">{m.sender_name}:</span>
          <span className="text-text truncate">{m.content}</span>
        </div>
      ))}
    </div>
  );
}

// --- Pools ---

function PoolsList() {
  const { data, isLoading } = useMemoryPools();
  if (isLoading) return <div className="text-text-dim">Loading...</div>;
  if (!data?.length) return <div className="text-text-dim">No pools</div>;
  return (
    <div className="flex flex-col gap-0.5">
      {data.map((p) => (
        <div key={p.id} className="flex justify-between">
          <span className="text-text">{p.name}</span>
          <span className="text-text-dim">by {p.created_by}</span>
        </div>
      ))}
    </div>
  );
}

// --- Connectors ---

function ConnectorsList() {
  const { data, isLoading } = useConnectors();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) return <div className="text-text-dim">Loading...</div>;
  if (!data?.length) return <div className="text-text-dim">No connectors</div>;

  return (
    <div className="flex flex-col gap-0.5">
      {data.map((c) => (
        <div key={c.id}>
          <button
            type="button"
            onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
            className="flex w-full items-center gap-1.5 py-0.5 hover:bg-bg-hover transition-colors text-left"
          >
            <span className="text-text-bright truncate flex-1">{c.name}</span>
            <span className="text-text-dim text-[10px]">{c.transport}</span>
            <StatusDot status={c.status} />
          </button>
          {expandedId === c.id && (
            <div className="animate-fade-in border-l-2 border-primary/30 ml-2 pl-2 py-1 text-[10px]">
              {c.url && (
                <div className="text-text-dim">
                  URL: <span className="text-text">{c.url}</span>
                </div>
              )}
              {c.auth_type && (
                <div className="text-text-dim">
                  Auth: <span className="text-text">{c.auth_type}</span>
                </div>
              )}
              <div className="text-text-dim">
                By: <span className="text-text">{c.created_by}</span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Dynamic Commands ---

function CommandsList() {
  const { data, isLoading } = useDynamicCommands();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) return <div className="text-text-dim">Loading...</div>;
  if (!data?.length) return <div className="text-text-dim">No dynamic commands</div>;

  return (
    <div className="flex flex-col gap-0.5">
      {data.map((c) => (
        <div key={c.id}>
          <button
            type="button"
            onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
            className="flex w-full items-center gap-1.5 py-0.5 hover:bg-bg-hover transition-colors text-left"
          >
            <span className="text-text-bright truncate flex-1">{c.name}</span>
            <span className="text-text-dim text-[10px]">v{c.version}</span>
            <StatusDot status={c.valid ? "connected" : "error"} />
          </button>
          {expandedId === c.id && (
            <div className="animate-fade-in border-l-2 border-primary/30 ml-2 pl-2 py-1 text-[10px]">
              <div className="text-text-dim">
                By: <span className="text-text">{c.created_by}</span>
              </div>
              <div className="text-text-dim">
                Created: <span className="text-text">{formatTime(c.created_at)}</span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
