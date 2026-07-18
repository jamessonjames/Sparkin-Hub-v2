import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export const CLIENT_COLORS = [
  "#E6194B",
  "#3CB44B",
  "#FFE119",
  "#4363D8",
  "#F58231",
  "#911EB4",
  "#42D4F4",
  "#F032E6",
  "#BFEF45",
  "#FABED4",
  "#469990",
  "#9A6324",
];

interface Props {
  value: string;
  onChange: (color: string) => void;
}

export function ClientColorPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-surface-2/40 hover:bg-surface-2 transition-colors text-xs cursor-pointer"
      >
        <span
          className="h-4 w-4 rounded-full shrink-0 border border-black/20"
          style={{ backgroundColor: value || "#E6194B" }}
        />
        <span className="text-muted-foreground">Cor do cliente</span>
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="p-2 bg-card border border-border rounded-xl shadow-2xl"
        >
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
        </div>,
        document.body
      )}
    </>
  );
}
