import { Loader2 } from "lucide-react";

export function LoadingSpinner({ text = "Carregando..." }: { text?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 min-h-[300px]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
