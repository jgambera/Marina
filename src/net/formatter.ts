import type { Perception } from "../types";
import type { Medium } from "./adapter";
import { A } from "./ansi";

// ─── Unified Perception Formatter ────────────────────────────────────────────

export function formatPerception(p: Perception, medium: Medium): string {
  switch (medium) {
    case "json":
      return formatJson(p);
    case "ansi":
      return formatAnsi(p);
    case "markdown":
      return formatMarkdown(p);
    case "plaintext":
      return formatPlaintext(p);
    case "html":
      return formatHtml(p);
  }
}

// ─── JSON (WebSocket) ────────────────────────────────────────────────────────

function formatJson(p: Perception): string {
  return JSON.stringify(p);
}

// ─── ANSI (Telnet) ───────────────────────────────────────────────────────────

function formatAnsi(p: Perception): string {
  if (p.kind === "room") {
    return formatRoomAnsi(p);
  }
  if (p.kind === "error") {
    const text = (p.data?.text as string) ?? "";
    return `${A.red}${text}${A.reset}`;
  }
  if (p.kind === "system") {
    const text = (p.data?.text as string) ?? "";
    return `${A.cyan}${text}${A.reset}`;
  }
  const text = (p.data?.text as string) ?? "";
  if (text) return text;
  return JSON.stringify(p.data);
}

function formatRoomAnsi(p: Perception): string {
  const d = p.data as {
    short?: string;
    long?: string;
    exits?: string[];
    entities?: { name: string; short: string }[];
    items?: Record<string, string>;
  };
  const lines: string[] = [];
  if (d.short) lines.push(`${A.bold}${A.cyan}${d.short}${A.reset}`);
  if (d.long) lines.push(d.long);
  if (d.items && Object.keys(d.items).length > 0) {
    lines.push("");
    lines.push(`${A.yellow}Items:${A.reset}`);
    for (const key of Object.keys(d.items)) {
      lines.push(`  ${key}`);
    }
  }
  if (d.entities && d.entities.length > 0) {
    lines.push("");
    lines.push(`${A.green}Present:${A.reset}`);
    for (const e of d.entities) {
      lines.push(`  ${e.short || e.name}`);
    }
  }
  if (d.exits && d.exits.length > 0) {
    lines.push("");
    lines.push(`${A.dim}Exits: ${d.exits.join(", ")}${A.reset}`);
  }
  return lines.join("\n");
}

// ─── Markdown (MCP / Discord / Telegram) ─────────────────────────────────────

function formatMarkdown(p: Perception): string {
  if (p.kind === "room") {
    return formatRoomMarkdown(p);
  }
  if (p.kind === "error") {
    const text = (p.data?.text as string) ?? "";
    return `**Error:** ${text}`;
  }
  if (p.kind === "system") {
    const text = (p.data?.text as string) ?? "";
    return `*${text}*`;
  }
  const text = (p.data?.text as string) ?? "";
  if (text) return text;
  return JSON.stringify(p.data);
}

function formatRoomMarkdown(p: Perception): string {
  const d = p.data as {
    short?: string;
    long?: string;
    exits?: string[];
    entities?: { name: string; short: string }[];
    items?: Record<string, string>;
  };
  const lines: string[] = [];
  if (d.short) lines.push(`## ${d.short}`);
  if (d.long) lines.push(d.long);
  if (d.items && Object.keys(d.items).length > 0) {
    lines.push("");
    lines.push("**Items you can look at:**");
    for (const key of Object.keys(d.items)) {
      lines.push(`- ${key}`);
    }
  }
  if (d.entities && d.entities.length > 0) {
    lines.push("");
    lines.push("**Present:**");
    for (const e of d.entities) {
      lines.push(`- ${e.short || e.name}`);
    }
  }
  if (d.exits && d.exits.length > 0) {
    lines.push("");
    lines.push(`**Exits:** ${d.exits.join(", ")}`);
  }
  return lines.join("\n");
}

// ─── Plaintext ───────────────────────────────────────────────────────────────

function formatPlaintext(p: Perception): string {
  if (p.kind === "room") {
    return formatRoomPlaintext(p);
  }
  const text = (p.data?.text as string) ?? "";
  if (text) return text;
  return JSON.stringify(p.data);
}

function formatRoomPlaintext(p: Perception): string {
  const d = p.data as {
    short?: string;
    long?: string;
    exits?: string[];
    entities?: { name: string; short: string }[];
    items?: Record<string, string>;
  };
  const lines: string[] = [];
  if (d.short) lines.push(d.short);
  if (d.long) lines.push(d.long);
  if (d.items && Object.keys(d.items).length > 0) {
    lines.push("");
    lines.push("Items:");
    for (const key of Object.keys(d.items)) {
      lines.push(`  ${key}`);
    }
  }
  if (d.entities && d.entities.length > 0) {
    lines.push("");
    lines.push("Present:");
    for (const e of d.entities) {
      lines.push(`  ${e.short || e.name}`);
    }
  }
  if (d.exits && d.exits.length > 0) {
    lines.push("");
    lines.push(`Exits: ${d.exits.join(", ")}`);
  }
  return lines.join("\n");
}

// ─── HTML ────────────────────────────────────────────────────────────────────

function formatHtml(p: Perception): string {
  if (p.kind === "room") {
    return formatRoomHtml(p);
  }
  if (p.kind === "error") {
    const text = esc((p.data?.text as string) ?? "");
    return `<span class="error">${text}</span>`;
  }
  if (p.kind === "system") {
    const text = esc((p.data?.text as string) ?? "");
    return `<span class="system">${text}</span>`;
  }
  const text = esc((p.data?.text as string) ?? "");
  if (text) return `<span>${text}</span>`;
  return `<pre>${esc(JSON.stringify(p.data))}</pre>`;
}

function formatRoomHtml(p: Perception): string {
  const d = p.data as {
    short?: string;
    long?: string;
    exits?: string[];
    entities?: { name: string; short: string }[];
    items?: Record<string, string>;
  };
  const lines: string[] = [];
  if (d.short) lines.push(`<h3>${esc(d.short)}</h3>`);
  if (d.long) lines.push(`<p>${esc(d.long)}</p>`);
  if (d.items && Object.keys(d.items).length > 0) {
    lines.push("<p><strong>Items:</strong></p><ul>");
    for (const key of Object.keys(d.items)) {
      lines.push(`<li>${esc(key)}</li>`);
    }
    lines.push("</ul>");
  }
  if (d.entities && d.entities.length > 0) {
    lines.push("<p><strong>Present:</strong></p><ul>");
    for (const e of d.entities) {
      lines.push(`<li>${esc(e.short || e.name)}</li>`);
    }
    lines.push("</ul>");
  }
  if (d.exits && d.exits.length > 0) {
    lines.push(`<p><strong>Exits:</strong> ${d.exits.map(esc).join(", ")}</p>`);
  }
  return lines.join("\n");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
