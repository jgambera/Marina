const HIDDEN_KEYS = new Set([
  "url",
  "content",
  "body",
  "text",
  "filename",
  "label",
  "title",
  "canvas_id",
  "color",
]);

interface NodeMetaProps {
  filename: string;
  data: Record<string, unknown>;
  className?: string;
}

export function NodeMeta({ filename, data, className }: NodeMetaProps) {
  const meta = Object.entries(data).filter(
    ([k, v]) => !HIDDEN_KEYS.has(k) && v != null && v !== "",
  );

  return (
    <div className={`bg-black/70 px-2 py-1 text-xs text-gray-300 ${className ?? ""}`}>
      <div className="font-medium truncate">{filename}</div>
      {meta.length > 0 && (
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0 text-[10px] text-gray-500">
          {meta.map(([k, v]) => (
            <span key={k}>
              {k}: {String(v)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
