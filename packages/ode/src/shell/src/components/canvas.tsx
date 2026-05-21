import { type RefObject } from "react";
import { AlertCircle, CheckCircle2, Loader2, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StoryStatus } from "@/lib/types";

interface CanvasProps {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  iframeSrc: string;
  status: StoryStatus;
  storyId: string | undefined;
}

const StatusBadge = ({ status }: { status: StoryStatus }) => {
  if (status.error) {
    return (
      <Badge variant="destructive">
        <AlertCircle className="h-3 w-3" />
        Error
      </Badge>
    );
  }
  if (status.playStatus === "running") {
    return (
      <Badge>
        <Loader2 className="h-3 w-3 animate-spin" />
        Play running
      </Badge>
    );
  }
  if (status.playStatus === "passed") {
    return (
      <Badge variant="success">
        <CheckCircle2 className="h-3 w-3" />
        Play passed
      </Badge>
    );
  }
  if (status.playStatus === "failed") {
    return (
      <Badge variant="destructive">
        <AlertCircle className="h-3 w-3" />
        Play failed
      </Badge>
    );
  }
  return (
    <Badge>
      <Play className="h-3 w-3" />
      Ready
    </Badge>
  );
};

export const Canvas = ({ iframeRef, iframeSrc, status, storyId }: CanvasProps) => {
  if (!storyId) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        Select a story from the sidebar.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <code className="text-xs text-muted-foreground">{storyId}</code>
        <StatusBadge status={status} />
      </div>
      <div className="flex-1 overflow-hidden bg-muted/30">
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title={storyId}
          className={cn("h-full w-full border-0")}
        />
      </div>
    </div>
  );
};
