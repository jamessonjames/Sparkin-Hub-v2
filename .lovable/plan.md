
# Fase 2 — Núcleo (Creative Flow Hub)

Vou implementar o núcleo funcional do sistema seguindo o mapa de rotas do kit. A Fase 1 já entregou auth, schema base, roles e a rota `/dashboard` provisória — agora o app ganha o shell definitivo, CRUDs e kanban.

## O que será entregue

### 1. App Shell (layout autenticado)
- Componente `AppShell` com **sidebar** (logo, navegação principal, lista de clientes ativos agrupados, botão "novo cliente") + **topbar** (busca, notificações placeholder, avatar/menu com "Sair").
- Bottom-nav placeholder no mobile (implementação completa na Fase 3).
- Passa a envolver todas as rotas de `_authenticated/*`.

### 2. Rotas autenticadas do núcleo
- `/` (dashboard) — substitui a rota provisória `/dashboard`, com widgets estáticos: demandas em aberto, demandas atrasadas, clientes ativos, próximas entregas.
- `/clients` — lista de clientes com busca, filtro por status e ações rápidas.
- `/clients/new` — formulário de criação.
- `/clients/$id` — página do cliente com abas: **Visão geral**, **Demandas**, **Notas**, **Créditos**.
- `/demands` — kanban de demandas (colunas por status, drag-and-drop entre colunas).
- `/notes` — notas gerais/rascunhos.

### 3. Formulários e componentes
- `ClientForm` (nome, empresa, e-mail, telefone, tier de créditos, status, cor, tags).
- `DemandForm` (título, cliente, tipo, prioridade, status, prazo, descrição, checklist).
- `KanbanBoard` — colunas fixas (novo, em produção, em revisão, aprovado, entregue) via dnd-kit.
- `CommentsThread` para demandas.
- `NotesList` por cliente e geral.

### 4. Server layer
- Server functions em `src/lib/*.functions.ts` (padrão `list/get/create/update/remove` + operações específicas):
  - `clients.functions.ts`, `demands.functions.ts`, `comments.functions.ts`, `notes.functions.ts`.
- Todas usam `requireSupabaseAuth`; RLS já cobre o isolamento por time.

### 5. Ajustes de schema
- Migração pequena para complementar o schema inicial se algum campo estiver faltando (ex.: `demands.checklist JSONB`, `demands.tags TEXT[]`, `clients.color`, `clients.tags`). Só o mínimo necessário para os formulários — o restante das tabelas (contracts, cycles, agenda, etc.) fica para as fases seguintes.

## Detalhes técnicos

- **Stack:** TanStack Start + Query + Router, shadcn/ui (Button, Input, Select, Dialog, Tabs, Card, Badge, DropdownMenu, Sheet), `@dnd-kit/core` + `@dnd-kit/sortable` para o kanban, `react-hook-form` + `zod` para formulários, `date-fns` para datas.
- **Padrão de leitura:** loaders chamam `context.queryClient.ensureQueryData(queryOptions(...))` e componentes usam `useSuspenseQuery`. Cada rota define `errorComponent` e `notFoundComponent`.
- **Tokens semânticos:** somente `bg-background / bg-card / bg-primary / text-foreground / text-muted-foreground / border-border` — nada hard-coded.
- **Naming de arquivos:** `_authenticated.index.tsx`, `_authenticated.clients.index.tsx`, `_authenticated.clients.new.tsx`, `_authenticated.clients.$id.tsx`, `_authenticated.demands.tsx`, `_authenticated.notes.tsx`. A rota provisória `_authenticated.dashboard.tsx` é removida e o `index.tsx` público passa a redirecionar autenticados para `/`.
- **Kanban:** ao arrastar, dispara `updateDemandStatus` (server fn) com optimistic update via TanStack Query.
- **RLS:** nenhuma nova policy — o schema da Fase 1 já expõe as tabelas ao time autenticado.

## O que fica fora desta fase (vai para 3+)

- Drag-and-drop do dashboard, rich text (Tiptap), agenda, portal do cliente, PWA, bottom-nav mobile completa.
- Financeiro, IA/Jimy, WhatsApp, integrações OAuth, áreas/páginas internas, integrity center.

## Ordem de execução

1. Migração complementar (campos faltantes em `clients`/`demands`).
2. Server functions do núcleo.
3. `AppShell` + remoção da dashboard provisória.
4. Rotas de clientes (list → new → detail com abas).
5. Rota de demandas (kanban + form em dialog).
6. Rota de notas + widgets do dashboard.

Ao final, você poderá criar clientes, abrir demandas, arrastar entre colunas e comentar — pronto para a Fase 3.
