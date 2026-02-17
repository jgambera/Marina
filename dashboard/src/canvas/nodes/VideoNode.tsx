import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { NodeMeta } from "./NodeMeta";

export function VideoNode({ data, selected }: NodeProps) {
  const url = (data.url as string) ?? "";
  const filename = (data.filename as string) ?? "Video";
  const mime = (data.mime as string) ?? "video/mp4";

  return (
    <div className="rounded-lg overflow-hidden bg-gray-900 border border-purple-800/50 shadow-lg shadow-purple-900/20 h-full flex flex-col">
      <NodeResizer
        isVisible={!!selected}
        minWidth={200}
        minHeight={150}
        lineClassName="!border-purple-500/50"
        handleClassName="!w-2 !h-2 !bg-purple-500 !border-purple-400"
      />
      <Handle type="target" position={Position.Top} className="!bg-purple-500" />
      {url ? (
        <video controls className="w-full flex-1 object-contain bg-black" preload="metadata">
          <source src={url} type={mime} />
        </video>
      ) : (
        <div className="flex items-center justify-center flex-1 text-gray-500 text-sm">
          No video
        </div>
      )}
      {selected && <NodeMeta filename={filename} data={data} />}
      <Handle type="source" position={Position.Bottom} className="!bg-purple-500" />
    </div>
  );
}
