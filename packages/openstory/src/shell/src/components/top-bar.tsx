import { Sidebar } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { GlobalType, Manifest, ToolbarItem } from "@/lib/types";

interface TopBarProps {
  manifest: Manifest;
  globals: Record<string, unknown>;
  onGlobalChange: (key: string, value: unknown) => void;
  isNavCollapsed: boolean;
  onToggleNav: () => void;
}

const isToolbarItem = (item: unknown): item is ToolbarItem =>
  typeof item === "object" && item !== null && "value" in item && "title" in item;

const toolbarItems = (toolbar: GlobalType["toolbar"]): ToolbarItem[] =>
  toolbar?.items?.filter(isToolbarItem) ?? [];

export const TopBar = ({
  manifest,
  globals,
  onGlobalChange,
  isNavCollapsed,
  onToggleNav,
}: TopBarProps) => {
  const globalEntries = Object.entries(manifest.globalTypes);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-2 sm:gap-3 sm:px-3">
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleNav}
        aria-label={isNavCollapsed ? "Show sidebar" : "Hide sidebar"}
        className="shrink-0"
      >
        <Sidebar className="h-4 w-4" />
      </Button>
      <Separator orientation="vertical" className="hidden h-6 sm:block" />
      <div className="truncate text-sm font-semibold tracking-tight">Openstory</div>

      <div className="min-w-0 flex-1" />

      <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
        {globalEntries.map(([key, definition]) => {
          const items = toolbarItems(definition.toolbar);
          if (items.length === 0) return null;
          const currentValue = String(globals[key] ?? "");
          const titleLabel = definition.toolbar?.title ?? key;
          return (
            <Select
              key={key}
              value={currentValue}
              onValueChange={(next) => onGlobalChange(key, next)}
            >
              <SelectTrigger
                className="h-8 w-auto min-w-24 max-w-40 shrink-0 sm:min-w-36"
                aria-label={titleLabel}
              >
                <span className="mr-1 hidden text-muted-foreground sm:inline">{titleLabel}:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={String(item.value)} value={String(item.value)}>
                    {item.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        })}
      </div>
    </header>
  );
};
