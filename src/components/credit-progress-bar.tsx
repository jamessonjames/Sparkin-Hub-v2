import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DEFAULT_CREDIT_TIERS, type CreditTier } from "@/lib/credit-tiers";

interface CreditProgressBarProps {
  totalCredits: number;
  tiers?: CreditTier[];
  title?: string;
  className?: string;
}

export function CreditProgressBar({
  totalCredits,
  tiers = [],
  title = "Progresso de Créditos (Este Mês)",
  className,
}: CreditProgressBarProps) {
  const sortedTiers = useMemo(() => {
    const activeTiers = tiers && tiers.length > 0 ? tiers : DEFAULT_CREDIT_TIERS;
    return [...activeTiers].sort((a, b) => a.min_credits - b.min_credits);
  }, [tiers]);

  const { currentTier, currentTierIndex, nextTier, percent, remaining } = useMemo(() => {
    const idx = sortedTiers.findIndex(
      (t) => totalCredits >= t.min_credits && (t.max_credits === null || totalCredits <= t.max_credits)
    );
    const curr = idx !== -1 ? sortedTiers[idx] : null;
    const nxt = curr && curr.max_credits !== null && idx + 1 < sortedTiers.length ? sortedTiers[idx + 1] : null;

    let pct = 0;
    let rem = 0;

    if (curr) {
      if (curr.max_credits !== null) {
        pct = Math.min(100, Math.max(0, (totalCredits / curr.max_credits) * 100));
        rem = curr.max_credits - totalCredits;
      } else {
        pct = 100;
        rem = 0;
      }
    }

    return {
      currentTier: curr,
      currentTierIndex: idx,
      nextTier: nxt,
      percent: pct,
      remaining: rem,
    };
  }, [sortedTiers, totalCredits]);

  if (!currentTier) return null;

  return (
    <Card className={cn("p-4 border-emerald-500/10 bg-emerald-500/[0.01] space-y-3.5 shadow-sm shrink-0", className)}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-2.5">
        <div>
          <h4 className="font-bold text-xs text-foreground flex items-center gap-1.5 uppercase tracking-wider">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            {title}
          </h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {currentTier.max_credits !== null ? (
              <>
                Faixa ativa: <strong>Faixa {currentTierIndex + 1}</strong> ({currentTier.min_credits} a {currentTier.max_credits} créditos):{" "}
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  R$ {currentTier.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </>
            ) : (
              <>
                Faixa ativa: <strong>Faixa Final/Ilimitada</strong> ({currentTier.min_credits}+ créditos):{" "}
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  R$ {currentTier.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>{" "}
                +{" "}
                <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  R$ {currentTier.extra_per_credit?.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>{" "}
                por crédito extra
              </>
            )}
          </p>
        </div>
        <div className="text-xs font-bold text-right shrink-0">
          <span className="text-muted-foreground">Consumo:</span>{" "}
          <span className="text-emerald-600 dark:text-emerald-400 text-sm font-extrabold">{totalCredits}</span>{" "}
          <span className="text-muted-foreground">
            {currentTier.max_credits !== null ? `/ ${currentTier.max_credits} cr.` : "créditos"}
          </span>
        </div>
      </div>

      {/* The Bar */}
      <div className="space-y-1.5">
        <div className="relative w-full h-3 bg-muted rounded-full overflow-hidden border border-border/80">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500 ease-out",
              currentTier.max_credits === null
                ? "bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500 animate-pulse"
                : percent >= 90
                ? "bg-gradient-to-r from-emerald-500 to-amber-500"
                : "bg-gradient-to-r from-emerald-500 to-teal-500"
            )}
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Markers & Remaining description */}
        <div className="flex justify-between items-center text-[9px] text-muted-foreground px-0.5">
          <span>{currentTier.min_credits} cr.</span>
          <span className="font-semibold">
            {currentTier.max_credits !== null ? (
              remaining > 0 ? (
                <>
                  Falta(m) <strong className="text-foreground">{remaining} crédito(s)</strong> para a próxima faixa{" "}
                  {nextTier ? `(R$ ${nextTier.price.toLocaleString("pt-BR")})` : "(limite final)"}
                </>
              ) : (
                <strong className="text-emerald-650 dark:text-emerald-450">Limite de faixa atingido! Próximo crédito avança de faixa.</strong>
              )
            ) : (
              <>
                Consumo excedente: <strong className="text-indigo-650 dark:text-indigo-400">{Math.max(0, totalCredits - (currentTier.min_credits - 1))} cr.</strong>
                {" "} (+ R$ {(Math.max(0, totalCredits - (currentTier.min_credits - 1)) * (currentTier.extra_per_credit ?? 0)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })})
              </>
            )}
          </span>
          <span>{currentTier.max_credits !== null ? `${currentTier.max_credits} cr.` : "Ilimitado"}</span>
        </div>
      </div>
    </Card>
  );
}
