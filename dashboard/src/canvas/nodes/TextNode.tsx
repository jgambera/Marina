import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { NodeMeta } from "./NodeMeta";

export function TextNode({ data, selected }: NodeProps) {
  const content = (data.content as string) ?? (data.text as string) ?? "";
  const label = (data.label as string) ?? "";

  return (
    <div className="rounded-lg bg-gray-900 border border-gray-700/50 shadow-lg p-3 h-full flex flex-col">
      <NodeResizer
        isVisible={!!selected}
        minWidth={120}
        minHeight={60}
        lineClassName="!border-gray-500/50"
        handleClassName="!w-2 !h-2 !bg-gray-500 !border-gray-400"
      />
      <Handle type="target" position={Position.Top} className="!bg-gray-500" />
      {selected && label && <NodeMeta filename={label} data={data} className="mb-1" />}
      <div className="flex-1 text-sm text-gray-200 whitespace-pre-wrap overflow-auto">
        {content || <span className="text-gray-600 italic">Empty</span>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-gray-500" />
    </div>
  );
}
