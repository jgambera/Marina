import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { NodeMeta } from "./NodeMeta";

export function ImageNode({ data, selected }: NodeProps) {
  const url = (data.url as string) ?? "";
  const filename = (data.filename as string) ?? "Image";

  return (
    <div className="rounded-lg overflow-hidden bg-gray-900 border border-cyan-800/50 shadow-lg shadow-cyan-900/20 h-full">
      <NodeResizer
        isVisible={!!selected}
        minWidth={100}
        minHeight={80}
        lineClassName="!border-cyan-500/50"
        handleClassName="!w-2 !h-2 !bg-cyan-500 !border-cyan-400"
      />
      <Handle type="target" position={Position.Top} className="!bg-cyan-500" />
      {url ? (
        <img src={url} alt={filename} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="flex items-center justify-center h-full text-gray-500 text-sm">
          No image
        </div>
      )}
      {selected && <NodeMeta filename={filename} data={data} />}
      <Handle type="source" position={Position.Bottom} className="!bg-cyan-500" />
    </div>
  );
}
