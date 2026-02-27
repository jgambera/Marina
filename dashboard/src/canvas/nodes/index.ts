import { Suspense, createElement, lazy } from "react";
import type { NodeProps, NodeTypes } from "@xyflow/react";
import { AudioNode } from "./AudioNode";
import { DocumentNode } from "./DocumentNode";
import { FrameNode } from "./FrameNode";
import { ImageNode } from "./ImageNode";
import { TextNode } from "./TextNode";
import { VideoNode } from "./VideoNode";

const LazyPdfNode = lazy(() => import("./PdfNode"));

function PdfNodeWrapper(props: NodeProps) {
  return createElement(
    Suspense,
    {
      fallback: createElement(
        "div",
        {
          className:
            "rounded-lg bg-gray-900 border border-red-800/50 p-4 text-gray-500 text-sm animate-pulse flex items-center justify-center",
          style: { minWidth: 200, minHeight: 250 },
        },
        "Loading PDF...",
      ),
    },
    createElement(LazyPdfNode, props),
  );
}

export const nodeTypes: NodeTypes = {
  image: ImageNode,
  video: VideoNode,
  pdf: PdfNodeWrapper,
  audio: AudioNode,
  document: DocumentNode,
  text: TextNode,
  embed: TextNode, // Fallback to text for now
  frame: FrameNode,
};
