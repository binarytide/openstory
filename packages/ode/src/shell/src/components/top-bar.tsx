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
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background px-3">
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleNav}
        aria-label={isNavCollapsed ? "Show sidebar" : "Hide sidebar"}
      >
        <Sidebar className="h-4 w-4" />
      </Button>
      <Separator orientation="vertical" className="h-6" />
      <div className="flex items-center gap-1 text-sm font-semibold tracking-tight">
        <span>Ode</span>
        <span className="text-muted-foreground text-xs font-normal">
          · {manifest.framework}
        </span>
      </div>

      <div className="flex-1" />

      {globalEntries.map(([key, definition]) => {
        const items = toolbarItems(definition.toolbar);
        if (items.length === 0) return null;
        const currentValue = String(globals[key] ?? "");
        return (
          <Select
            key={key}
            value={currentValue}
            onValueChange={(next) => onGlobalChange(key, next)}
          >
            <SelectTrigger className="h-8 w-36">
              <span className="mr-1 text-muted-foreground">
                {definition.toolbar?.title ?? key}:
              </span>
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
    </header>
  );
};
