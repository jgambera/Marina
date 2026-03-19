import { Search, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useAgentModels } from "../hooks/use-api";
import { postApi } from "../lib/api";
import { cn } from "../lib/utils";

const ROLES = ["general", "architect", "scholar", "diplomat", "mentor", "merchant"] as const;

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: "Anthropic",
  google: "Google",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  groq: "Groq",
  mistral: "Mistral",
  xai: "xAI",
  cerebras: "Cerebras",
};

interface Props {
  onClose: () => void;
  onSpawned: () => void;
}

export function SpawnAgentModal({ onClose, onSpawned }: Props) {
  const { data: modelsData } = useAgentModels();
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("general");
  const [selectedModel, setSelectedModel] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const providers = modelsData?.providers ?? {};
  const configured = useMemo(() => new Set(modelsData?.configured ?? []), [modelsData?.configured]);

  const filteredProviders = useMemo(() => {
    const result: Record<string, (typeof providers)[string]> = {};
    const q = search.toLowerCase();

    // Show configured providers first, then unconfigured
    const sortedKeys = Object.keys(providers).sort((a, b) => {
      const aConf = configured.has(a) ? 0 : 1;
      const bConf = configured.has(b) ? 0 : 1;
      if (aConf !== bConf) return aConf - bConf;
      return a.localeCompare(b);
    });

    for (const provider of sortedKeys) {
      const models = providers[provider] ?? [];
      const filtered = q
        ? models.filter(
            (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
          )
        : models;
      if (filtered.length > 0 || !q) {
        result[provider] = filtered;
      }
    }
    return result;
  }, [providers, search, configured]);

  const toggleCollapse = useCallback((provider: string) => {
    setCollapsed((prev) => ({ ...prev, [provider]: !prev[provider] }));
  }, []);

  const handleSpawn = useCallback(async () => {
    if (!name.trim() || !selectedModel) return;
    setError(null);
    setSubmitting(true);
    try {
      await postApi("/api/agents/spawn", {
        name: name.trim(),
        model: selectedModel,
        role,
      });
      onSpawned();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Spawn failed");
    } finally {
      setSubmitting(false);
    }
  }, [name, selectedModel, role, onSpawned]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="glass-panel w-[480px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <h2 className="font-display text-[12px] font-semibold tracking-wider text-primary uppercase">
            Spawn Agent
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-dim hover:text-text-bright transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto p-3">
          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-text-dim uppercase tracking-wider">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sage"
              className="rounded border border-border bg-bg-card px-2 py-1 text-[12px] text-text-bright outline-none focus:border-primary"
              autoFocus
            />
          </div>

          {/* Role */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-text-dim uppercase tracking-wider">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="rounded border border-border bg-bg-card px-2 py-1 text-[12px] text-text-bright outline-none focus:border-primary"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Model picker */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-text-dim uppercase tracking-wider">Model</label>
            <div className="relative">
              <Search
                size={12}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-text-dim"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search models..."
                className="w-full rounded border border-border bg-bg-card py-1 pl-6 pr-2 text-[12px] text-text-bright outline-none focus:border-primary"
              />
            </div>

            <div className="mt-1 max-h-[240px] overflow-y-auto rounded border border-border bg-bg-card">
              {Object.keys(filteredProviders).length === 0 && (
                <div className="p-2 text-text-dim text-[11px]">No models found</div>
              )}
              {Object.entries(filteredProviders).map(([provider, models]) => {
                const isConfigured = configured.has(provider);
                const isCollapsed = collapsed[provider] ?? false;
                const displayName = PROVIDER_NAMES[provider] ?? provider;

                return (
                  <div key={provider}>
                    <button
                      type="button"
                      onClick={() => toggleCollapse(provider)}
                      className={cn(
                        "flex w-full items-center gap-1 px-2 py-1 text-left text-[10px] uppercase tracking-wider hover:bg-bg-hover transition-colors",
                        isConfigured ? "text-primary" : "text-text-dim",
                      )}
                    >
                      <span>{isCollapsed ? "+" : "-"}</span>
                      <span className="flex-1">{displayName}</span>
                      {!isConfigured && (
                        <span className="text-[9px] normal-case text-text-dim">(no API key)</span>
                      )}
                      <span className="text-[9px] normal-case">{models.length}</span>
                    </button>

                    {!isCollapsed &&
                      models.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelectedModel(m.id)}
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-0.5 text-left text-[11px] transition-colors",
                            selectedModel === m.id
                              ? "bg-primary/20 text-text-bright"
                              : "text-text hover:bg-bg-hover",
                            !isConfigured && "opacity-50",
                          )}
                        >
                          <span className="flex-1 truncate">{m.name}</span>
                          {m.reasoning && <span className="text-[9px] text-warning">reason</span>}
                          {m.contextWindow && (
                            <span className="text-[9px] text-text-dim">
                              {Math.round(m.contextWindow / 1000)}k
                            </span>
                          )}
                        </button>
                      ))}
                  </div>
                );
              })}
            </div>

            {selectedModel && (
              <div className="text-[10px] text-secondary truncate">Selected: {selectedModel}</div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border px-3 py-1 text-[11px] text-text-dim hover:text-text-bright transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim() || !selectedModel || submitting}
            onClick={handleSpawn}
            className="rounded bg-primary/20 border border-primary/40 px-3 py-1 text-[11px] text-primary hover:bg-primary/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {submitting ? "Spawning..." : "Spawn"}
          </button>
        </div>
      </div>
    </div>
  );
}
