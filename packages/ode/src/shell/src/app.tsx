import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@/components/canvas";
import { ControlsPanel } from "@/components/controls-panel";
import { StoryTree } from "@/components/story-tree";
import { TopBar } from "@/components/top-bar";
import { Separator } from "@/components/ui/separator";
import {
  KEYBOARD_RELOAD,
  KEYBOARD_TOGGLE_NAV,
  KEYBOARD_TOGGLE_THEME,
  STORAGE_KEY_NAV_COLLAPSED,
} from "@/lib/constants";
import type { ManifestStory } from "@/lib/types";
import { buildStoryIframeUrl, readUrlState, writeUrlState } from "@/lib/url-state";
import { cn } from "@/lib/utils";
import { useIframeComms } from "@/state/use-iframe-comms";
import { useManifest } from "@/state/use-manifest";
import { useTheme } from "@/state/use-theme";

const readNavCollapsed = (): boolean => {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY_NAV_COLLAPSED) === "true";
};

export const App = () => {
  const { manifest, error, isLoading } = useManifest();
  const theme = useTheme();

  const initialUrlState = useMemo(() => readUrlState(), []);
  const [selectedStoryId, setSelectedStoryId] = useState<string | undefined>(
    initialUrlState.storyId,
  );
  const [globals, setGlobals] = useState<Record<string, unknown>>(
    initialUrlState.globals,
  );
  const [args, setArgs] = useState<Record<string, unknown>>(initialUrlState.args);
  const [isNavCollapsed, setIsNavCollapsed] = useState<boolean>(readNavCollapsed);
  const [iframeReloadToken, setIframeReloadToken] = useState(0);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!manifest) return;
    if (selectedStoryId) return;
    const firstStory = manifest.stories[0];
    if (firstStory) setSelectedStoryId(firstStory.id);
  }, [manifest, selectedStoryId]);

  useEffect(() => {
    if (!manifest) return;
    if (Object.keys(globals).length > 0) return;
    setGlobals(manifest.initialGlobals);
  }, [manifest, globals]);

  useEffect(() => {
    writeUrlState({ storyId: selectedStoryId, args, globals });
  }, [selectedStoryId, args, globals]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_NAV_COLLAPSED, String(isNavCollapsed));
  }, [isNavCollapsed]);

  const selectedStory: ManifestStory | undefined = useMemo(() => {
    if (!manifest || !selectedStoryId) return undefined;
    return manifest.stories.find((entry) => entry.id === selectedStoryId);
  }, [manifest, selectedStoryId]);

  const hasControls =
    selectedStory !== undefined && Object.keys(selectedStory.argTypes).length > 0;

  const iframeSrc = useMemo(
    () => buildStoryIframeUrl({ storyId: selectedStoryId, args, globals }),
    [selectedStoryId, args, globals],
  );

  const comms = useIframeComms(iframeRef, selectedStoryId);

  const handleSelect = useCallback((storyId: string) => {
    setSelectedStoryId(storyId);
    setArgs({});
  }, []);

  const handleGlobalChange = useCallback(
    (key: string, value: unknown) => {
      const next = { ...globals, [key]: value };
      setGlobals(next);
      comms.setGlobals(next);
    },
    [globals, comms],
  );

  const handleArgsChange = useCallback(
    (next: Record<string, unknown>) => {
      setArgs(next);
      comms.setArgs(next);
    },
    [comms],
  );

  const handleArgsReset = useCallback(() => {
    setArgs({});
    if (selectedStory) comms.setArgs(selectedStory.initialArgs);
  }, [selectedStory, comms]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const eventTarget = event.target;
      if (eventTarget instanceof HTMLElement) {
        if (eventTarget.tagName === "INPUT" || eventTarget.tagName === "TEXTAREA") return;
      }
      if (event.key === KEYBOARD_RELOAD) {
        event.preventDefault();
        setIframeReloadToken((previous) => previous + 1);
        return;
      }
      if (event.key === KEYBOARD_TOGGLE_THEME) {
        event.preventDefault();
        theme.toggle();
        return;
      }
      if (event.key === KEYBOARD_TOGGLE_NAV) {
        event.preventDefault();
        setIsNavCollapsed((previous) => !previous);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [theme]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-destructive">
        Failed to load manifest: {error}
      </div>
    );
  }

  if (isLoading || !manifest) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <TopBar
        manifest={manifest}
        globals={globals}
        onGlobalChange={handleGlobalChange}
        isNavCollapsed={isNavCollapsed}
        onToggleNav={() => setIsNavCollapsed((previous) => !previous)}
      />
      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "flex shrink-0 flex-col border-r border-border bg-background transition-[width] duration-200 ease-[var(--ease-out)]",
            isNavCollapsed ? "w-0 overflow-hidden" : "w-72",
          )}
        >
          <div className="min-h-0 flex-1">
            <StoryTree
              manifest={manifest}
              selectedId={selectedStoryId}
              onSelect={handleSelect}
            />
          </div>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <Canvas
              key={iframeReloadToken}
              iframeRef={iframeRef}
              iframeSrc={iframeSrc}
              status={comms.status}
              storyId={selectedStoryId}
            />
          </div>
          {hasControls ? (
            <>
              <Separator />
              <div className="h-48 shrink-0 overflow-hidden bg-background">
                <ControlsPanel
                  story={selectedStory}
                  args={args}
                  onChange={handleArgsChange}
                  onReset={handleArgsReset}
                />
              </div>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
};
