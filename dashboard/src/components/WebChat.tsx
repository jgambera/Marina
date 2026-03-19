import { MessageSquareText, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { GlassPanel } from "./GlassPanel";

const ANSI_COLORS: Record<string, string> = {
  "30": "#4d4d4d",
  "31": "#f44",
  "32": "#4e4",
  "33": "#fd0",
  "34": "#69f",
  "35": "#f6f",
  "36": "#0ff",
  "37": "#d4d4d4",
  "90": "#888",
  "91": "#f66",
  "92": "#8f8",
  "93": "#ff5",
  "94": "#8af",
  "95": "#f8f",
  "96": "#5ff",
  "97": "#fff",
};

function escHtml(ch: string): string {
  if (ch === "&") return "&amp;";
  if (ch === "<") return "&lt;";
  if (ch === ">") return "&gt;";
  if (ch === '"') return "&quot;";
  return ch;
}

function ansiToHtml(text: string): string {
  let result = "";
  let i = 0;
  let openSpans = 0;
  while (i < text.length) {
    if (text[i] === "\x1b" && text[i + 1] === "[") {
      const end = text.indexOf("m", i + 2);
      if (end === -1) {
        result += escHtml(text[i]!);
        i++;
        continue;
      }
      const codes = text.substring(i + 2, end).split(";");
      i = end + 1;
      const styles: string[] = [];
      for (const code of codes) {
        if (code === "0" || code === "") {
          while (openSpans > 0) {
            result += "</span>";
            openSpans--;
          }
        } else if (code === "1") {
          styles.push("font-weight:bold");
        } else if (code === "3") {
          styles.push("font-style:italic");
        } else if (code === "4") {
          styles.push("text-decoration:underline");
        } else if (ANSI_COLORS[code]) {
          styles.push(`color:${ANSI_COLORS[code]}`);
        }
      }
      if (styles.length > 0) {
        result += `<span style="${styles.join(";")}">`;
        openSpans++;
      }
    } else {
      result += escHtml(text[i]!);
      i++;
    }
  }
  while (openSpans > 0) {
    result += "</span>";
    openSpans--;
  }
  return result;
}

interface ChatMessage {
  html: string;
  kind: string;
}

export function WebChat() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [cmdValue, setCmdValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<string[]>([]);
  const historyIdxRef = useRef(-1);

  const appendMsg = useCallback((text: string, kind: string) => {
    setMessages((prev) => [...prev.slice(-500), { html: ansiToHtml(text), kind }]);
  }, []);

  const handlePerception = useCallback(
    (p: {
      kind?: string;
      data?: {
        token?: string;
        entityId?: string;
        short?: string;
        long?: string;
        items?: Record<string, unknown>;
        entities?: { name: string }[];
        exits?: string[];
        text?: string;
      };
    }) => {
      if (p.data?.token) {
        localStorage.setItem("marina_chat_token", p.data.token);
      }

      if (p.data?.entityId && !loggedIn) {
        setLoggedIn(true);
      }

      const kind = p.kind || "message";
      if (kind === "room") {
        const d = p.data!;
        let text = "";
        if (d.short) text += `${d.short}\n`;
        if (d.long) text += `${d.long}\n`;
        if (d.items && Object.keys(d.items).length > 0) {
          text += `\nItems: ${Object.keys(d.items).join(", ")}\n`;
        }
        if (d.entities && d.entities.length > 0) {
          text += `Present: ${d.entities.map((e) => e.name).join(", ")}\n`;
        }
        if (d.exits && d.exits.length > 0) {
          text += `Exits: ${d.exits.join(", ")}\n`;
        }
        appendMsg(text, "room");
      } else {
        appendMsg(p.data?.text || JSON.stringify(p.data), kind);
      }
    },
    [loggedIn, appendMsg],
  );

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      const token = localStorage.getItem("marina_chat_token");
      if (token) {
        ws.send(JSON.stringify({ type: "auth", token }));
      }
    };

    ws.onmessage = (e) => {
      try {
        const p = JSON.parse(e.data as string);
        handlePerception(p);
      } catch {
        appendMsg(e.data as string, "message");
      }
    };

    ws.onclose = () => {
      setConnected(false);
      appendMsg("Disconnected. Reload to reconnect.", "system");
    };

    return () => {
      ws.close();
    };
  }, [handlePerception, appendMsg]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [messages]);

  const doLogin = () => {
    const name = nameValue.trim();
    if (!name || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: "login", name }));
  };

  const doSend = () => {
    const cmd = cmdValue.trim();
    if (!cmd || !wsRef.current) return;
    historyRef.current.unshift(cmd);
    historyIdxRef.current = -1;
    wsRef.current.send(JSON.stringify({ type: "command", command: cmd }));
    setCmdValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      doSend();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const hist = historyRef.current;
      if (historyIdxRef.current < hist.length - 1) {
        historyIdxRef.current++;
        setCmdValue(hist[historyIdxRef.current]!);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIdxRef.current > 0) {
        historyIdxRef.current--;
        setCmdValue(historyRef.current[historyIdxRef.current]!);
      } else {
        historyIdxRef.current = -1;
        setCmdValue("");
      }
    }
  };

  const kindClass = (kind: string) => {
    switch (kind) {
      case "system":
        return "text-primary";
      case "error":
        return "text-danger";
      case "room":
        return "text-success";
      default:
        return "text-text";
    }
  };

  return (
    <GlassPanel title="Web Chat" icon={<MessageSquareText size={14} />}>
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Output */}
        <div
          ref={outputRef}
          className="flex-1 overflow-y-auto px-2 py-1 font-mono text-[12px] leading-relaxed"
        >
          {messages.map((m, i) => (
            <div
              key={i}
              className={`whitespace-pre-wrap break-words ${kindClass(m.kind)}`}
              dangerouslySetInnerHTML={{ __html: m.html }}
            />
          ))}
        </div>

        {/* Input area */}
        <div className="border-t border-border px-2 py-1.5">
          {!loggedIn ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doLogin()}
                placeholder="Enter your name..."
                maxLength={20}
                className="flex-1 rounded border border-border bg-bg px-2 py-1 text-[12px] text-text outline-none focus:border-primary"
                autoFocus
              />
              <button
                type="button"
                onClick={doLogin}
                className="rounded bg-primary px-2 py-1 text-[11px] font-bold text-bg"
              >
                Connect
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-success" : "bg-danger"}`}
              />
              <input
                ref={inputRef}
                type="text"
                value={cmdValue}
                onChange={(e) => setCmdValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a command..."
                className="flex-1 rounded border border-border bg-bg px-2 py-1 text-[12px] text-text outline-none focus:border-primary"
                autoFocus
              />
              <button
                type="button"
                onClick={doSend}
                className="text-primary transition-colors hover:text-text-bright"
              >
                <Send size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </GlassPanel>
  );
}
