import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

export const CLIENT_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#78716c",
];

interface Props {
  value: string;
  onChange: (color: string) => void;
}

export function ClientColorPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-surface-2/40 hover:bg-surface-2 transition-colors text-xs cursor-pointer"
      >
        <span
          className="h-4 w-4 rounded-full shrink-0 border border-black/20"
          style={{ backgroundColor: value || "#ef4444" }}
        />
        <span className="text-muted-foreground">Cor do cliente</span>
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 p-2 bg-card border border-border rounded-xl shadow-2xl">
          <div className="grid grid-cols-3 gap-1.5">
            {CLIENT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { onChange(c); setOpen(false); }}
                className={cn(
                  "h-7 w-7 rounded-full border-2 transition-all cursor-pointer",
                  value === c ? "border-foreground scale-110" : "border-transparent hover:scale-110"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
