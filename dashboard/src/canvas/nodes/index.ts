import type { NodeTypes } from "@xyflow/react";
import { AudioNode } from "./AudioNode";
import { DocumentNode } from "./DocumentNode";
import { FrameNode } from "./FrameNode";
import { ImageNode } from "./ImageNode";
import { PdfNode } from "./PdfNode";
import { TextNode } from "./TextNode";
import { VideoNode } from "./VideoNode";

export const nodeTypes: NodeTypes = {
  image: ImageNode,
  video: VideoNode,
  pdf: PdfNode,
  audio: AudioNode,
  document: DocumentNode,
  text: TextNode,
  embed: TextNode, // Fallback to text for now
  frame: FrameNode,
};
