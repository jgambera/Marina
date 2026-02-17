import type { ReactNode } from "react";
import { cn } from "../lib/utils";

interface GlassPanelProps {
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  isFocused?: boolean;
  onDoubleClick?: () => void;
}

export function GlassPanel({
  title,
  icon,
  children,
  className,
  isFocused,
  onDoubleClick,
}: GlassPanelProps) {
  return (
    <div
      className={cn(
        "glass-panel flex h-full flex-col overflow-hidden",
        isFocused && "glass-panel-focused",
        className,
      )}
    >
      {title && (
        <div
          className="drag-handle flex cursor-grab items-center gap-1.5 border-b border-border px-2 py-1"
          onDoubleClick={onDoubleClick}
        >
          {icon && <span className="text-primary">{icon}</span>}
          <h2 className="font-display text-[11px] font-semibold tracking-wider text-primary uppercase">
            {title}
          </h2>
        </div>
      )}
      <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
