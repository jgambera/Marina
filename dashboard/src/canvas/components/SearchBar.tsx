import { useState, useCallback } from "react";
import type { Node } from "@xyflow/react";
import type { NodeType } from "../lib/types";

interface SearchBarProps {
  nodes: Node[];
  onFilterChange: (filtered: Node[] | null) => void;
}

const NODE_TYPES: NodeType[] = [
  "image",
  "video",
  "pdf",
  "audio",
  "document",
  "text",
  "embed",
  "frame",
];

export function SearchBar({ nodes, onFilterChange }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");

  const applyFilters = useCallback(
    (q: string, type: string) => {
      if (!q && !type) {
        onFilterChange(null);
        return;
      }
      const filtered = nodes.filter((n) => {
        if (type && n.type !== type) return false;
        if (q) {
          const searchable = JSON.stringify(n.data).toLowerCase();
          if (!searchable.includes(q.toLowerCase())) return false;
        }
        return true;
      });
      onFilterChange(filtered);
    },
    [nodes, onFilterChange],
  );

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        placeholder="Search nodes..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          applyFilters(e.target.value, typeFilter);
        }}
        className="bg-gray-800 text-gray-300 text-xs rounded px-2 py-1 border border-gray-700 focus:outline-none focus:border-cyan-600 w-40"
      />
      <select
        value={typeFilter}
        onChange={(e) => {
          setTypeFilter(e.target.value);
          applyFilters(query, e.target.value);
        }}
        className="bg-gray-800 text-gray-300 text-xs rounded px-2 py-1 border border-gray-700 focus:outline-none focus:border-cyan-600"
      >
        <option value="">All types</option>
        {NODE_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
}
