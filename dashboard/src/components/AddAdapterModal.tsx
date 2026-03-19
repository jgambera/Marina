import { X } from "lucide-react";
import { useCallback, useState } from "react";
import { postApi } from "../lib/api";
import type { AdapterType } from "../lib/types";

const ADAPTER_TYPES: { value: AdapterType; label: string }[] = [
  { value: "discord", label: "Discord" },
  { value: "telegram", label: "Telegram" },
  { value: "signal", label: "Signal" },
];

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export function AddAdapterModal({ onClose, onCreated }: Props) {
  const [type, setType] = useState<AdapterType>("discord");
  const [token, setToken] = useState("");
  const [autoStart, setAutoStart] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Type-specific settings
  const [channelIds, setChannelIds] = useState("");
  const [signalApiUrl, setSignalApiUrl] = useState("http://localhost:8080");
  const [signalPhone, setSignalPhone] = useState("");

  const buildSettings = (): Record<string, unknown> => {
    switch (type) {
      case "discord": {
        const ids = channelIds
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        return ids.length > 0 ? { channelIds: ids } : {};
      }
      case "signal":
        return { apiUrl: signalApiUrl, phoneNumber: signalPhone };
      default:
        return {};
    }
  };

  const handleCreate = useCallback(async () => {
    if (!token.trim()) return;
    if (type === "signal" && !signalPhone.trim()) return;

    setError(null);
    setSubmitting(true);
    try {
      await postApi("/api/adapters", {
        type,
        token: token.trim(),
        settings: buildSettings(),
        autoStart,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creation failed");
    } finally {
      setSubmitting(false);
    }
  }, [type, token, autoStart, channelIds, signalApiUrl, signalPhone, onCreated]);

  const tokenLabel = type === "signal" ? "Auth Token / API Key" : "Bot Token";
  const tokenPlaceholder =
    type === "discord"
      ? "e.g. MTIz...abc"
      : type === "telegram"
        ? "e.g. 123456:ABC-DEF..."
        : "Auth token (if required)";

  const canSubmit =
    token.trim().length > 0 && (type !== "signal" || signalPhone.trim().length > 0) && !submitting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="glass-panel w-[420px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <h2 className="font-display text-[12px] font-semibold tracking-wider text-primary uppercase">
            Add Adapter
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
          {/* Type */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-text-dim uppercase tracking-wider">Platform</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as AdapterType)}
              className="rounded border border-border bg-bg-card px-2 py-1 text-[12px] text-text-bright outline-none focus:border-primary"
            >
              {ADAPTER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Token */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-text-dim uppercase tracking-wider">
              {tokenLabel}
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={tokenPlaceholder}
              className="rounded border border-border bg-bg-card px-2 py-1 text-[12px] text-text-bright outline-none focus:border-primary font-mono"
              autoFocus
            />
          </div>

          {/* Discord-specific: channel IDs */}
          {type === "discord" && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-text-dim uppercase tracking-wider">
                Channel IDs (optional, comma-separated)
              </label>
              <input
                type="text"
                value={channelIds}
                onChange={(e) => setChannelIds(e.target.value)}
                placeholder="e.g. 1234567890,9876543210"
                className="rounded border border-border bg-bg-card px-2 py-1 text-[12px] text-text-bright outline-none focus:border-primary font-mono"
              />
            </div>
          )}

          {/* Signal-specific: API URL + phone */}
          {type === "signal" && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-text-dim uppercase tracking-wider">
                  signal-cli-rest-api URL
                </label>
                <input
                  type="text"
                  value={signalApiUrl}
                  onChange={(e) => setSignalApiUrl(e.target.value)}
                  placeholder="http://localhost:8080"
                  className="rounded border border-border bg-bg-card px-2 py-1 text-[12px] text-text-bright outline-none focus:border-primary font-mono"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-text-dim uppercase tracking-wider">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={signalPhone}
                  onChange={(e) => setSignalPhone(e.target.value)}
                  placeholder="e.g. +1234567890"
                  className="rounded border border-border bg-bg-card px-2 py-1 text-[12px] text-text-bright outline-none focus:border-primary font-mono"
                />
              </div>
            </>
          )}

          {/* Auto-start toggle */}
          <label className="flex items-center gap-2 text-[11px] text-text">
            <input
              type="checkbox"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
              className="accent-primary"
            />
            Auto-start on server boot
          </label>

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
            disabled={!canSubmit}
            onClick={handleCreate}
            className="rounded bg-primary/20 border border-primary/40 px-3 py-1 text-[11px] text-primary hover:bg-primary/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {submitting ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
