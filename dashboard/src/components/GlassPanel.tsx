import { RefreshCw } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "../lib/utils";

interface GlassPanelProps {
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  backContent?: ReactNode;
  className?: string;
  isFocused?: boolean;
  onDoubleClick?: () => void;
}

export function GlassPanel({
  title,
  icon,
  children,
  backContent,
  className,
  isFocused,
  onDoubleClick,
}: GlassPanelProps) {
  const [isFlipped, setIsFlipped] = useState(false);

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
          <h2 className="flex-1 font-display text-[11px] font-semibold tracking-wider text-primary uppercase">
            {title}
          </h2>
          {backContent && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsFlipped((f) => !f);
              }}
              className="text-text-dim hover:text-primary transition-colors"
              title={isFlipped ? "Show front" : "Show data"}
            >
              <RefreshCw size={10} />
            </button>
          )}
        </div>
      )}
      <div className="flex flex-1 flex-col overflow-hidden">
        {isFlipped ? (
          <div className="flex flex-1 flex-col overflow-hidden overflow-y-auto animate-fade-in">
            {backContent}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
