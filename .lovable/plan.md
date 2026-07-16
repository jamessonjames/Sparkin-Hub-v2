## Pin visual + arrasto sempre livre

**Regra:** arrasto manual sempre vence prioridade. O pin (📌) só diz "auto-scheduler não mexe aqui". Arrastar continua funcionando em qualquer card, fixado ou não.

### Mudanças

1. **`src/utils/scheduler.ts`** — inverter a hierarquia:
   - Demandas com `is_manually_scheduled = true` viram slots bloqueados (intocáveis pelo motor).
   - Auto-scheduler só distribui as demandas *não* fixadas, ordenando por prioridade nos slots livres restantes.
   - Remover a lógica atual que empurra manuais de menor prioridade.

2. **`src/components/kanban-board.tsx` e agenda** — selo visual:
   - Ícone 📌 discreto no canto do card quando `is_manually_scheduled = true`.
   - Clique no 📌 alterna a flag (destrava → volta pro pool automático; trava → congela na posição atual).
   - Tooltip: "Fixado — o sistema não vai reagendar. Clique para liberar."

3. **`src/routes/_authenticated.agenda.tsx`** — arrasto continua igual:
   - Qualquer card é arrastável (fixado ou não).
   - Ao soltar, marca `is_manually_scheduled = true` automaticamente (arrastar = fixar naquele slot).

### Comportamento resultante

- Arrastei card A pra terça 10h → fica lá, com 📌.
- Chega demanda urgente nova → encaixa nos slots livres, **nunca** mexe no A.
- Não gosto mais do A fixado → clico no 📌 → volta pro pool e o scheduler reposiciona.
- Sem botão global de reset (padrão Todoist/Linear).