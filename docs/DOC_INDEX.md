# ProspectCRM — Índice de Documentação para Migração

## Stack Alvo

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 16 (App Router) |
| UI Layer | React 19 |
| Estilização | Tailwind CSS v4 |
| Componentes | shadcn/ui |
| Banco de dados | PostgreSQL via Neon |
| ORM | Drizzle ORM |
| Autenticação | Better Auth |
| Deploy | Vercel |

---

## Documentos por Página/Feature

| # | Documento | Rota Atual (TanStack) | Rota Sugerida (Next.js) |
|---|-----------|----------------------|------------------------|
| 1 | `DOC_Login.md` | `/login` | `/(auth)/login/page.tsx` |
| 2 | `DOC_Signup.md` | `/signup` | `/(auth)/signup/page.tsx` |
| 3 | `DOC_AppLayout.md` | `/_app` (layout) | `/(app)/layout.tsx` |
| 4 | `DOC_DashboardProspeccao.md` | `/prospeccao/` | `/(app)/prospeccao/page.tsx` |
| 5 | `DOC_Nichos.md` | `/prospeccao/nichos` | `/(app)/prospeccao/nichos/page.tsx` |
| 6 | `DOC_Campanhas.md` | `/prospeccao/campanhas/` | `/(app)/prospeccao/campanhas/page.tsx` |
| 7 | `DOC_DetalheCampanha.md` | `/prospeccao/campanhas/$id` | `/(app)/prospeccao/campanhas/[id]/page.tsx` |
| 8 | `DOC_Leads.md` | `/prospeccao/leads` | `/(app)/prospeccao/leads/page.tsx` |
| 9 | `DOC_Funil.md` | `/funil` | `/(app)/funil/page.tsx` |

---

## Mapa de Rotas (Atual → Sugerida)

| TanStack Router | Next.js App Router | Tipo |
|----------------|-------------------|------|
| `/` (redirect → `/login`) | Middleware `matcher: '/'` → redirect | Middleware |
| `/login` | `/(auth)/login/page.tsx` | Página pública |
| `/signup` | `/(auth)/signup/page.tsx` | Página pública |
| `/_app` (layout) | `/(app)/layout.tsx` | Layout autenticado |
| `/prospeccao/` | `/(app)/prospeccao/page.tsx` | Dashboard |
| `/prospeccao/nichos` | `/(app)/prospeccao/nichos/page.tsx` | CRUD |
| `/prospeccao/campanhas/` | `/(app)/prospeccao/campanhas/page.tsx` | Lista + criação |
| `/prospeccao/campanhas/$id` | `/(app)/prospeccao/campanhas/[id]/page.tsx` | Detalhe |
| `/prospeccao/leads` | `/(app)/prospeccao/leads/page.tsx` | Lista + mapa |
| `/funil` | `/(app)/funil/page.tsx` | Kanban |

---

## Entidades de Banco Consolidadas

| Entidade | Tabela SQL | PK | FK | Documentos que usam |
|----------|-----------|----|----|-------------------|
| User | `users` | `id` | — | Login, Signup, AppLayout, Funil |
| Company | `companies` | `id` | `owner_id → users.id` | Signup, AppLayout |
| CompanyMember | `company_members` | `id` | `company_id → companies.id`, `user_id → users.id` | AppLayout |
| ProspectingNiche | `prospecting_niches` | `id` | `company_id → companies.id` | Dashboard, Nichos, Campanhas, DetalheCampanha |
| ProspectingCampaign | `prospecting_campaigns` | `id` | `company_id → companies.id`, `niche_id → prospecting_niches.id` | Dashboard, Campanhas, DetalheCampanha |
| ProspectingLead | `prospecting_leads` | `id` | `company_id → companies.id`, `campaign_id → prospecting_campaigns.id`, `niche_id → prospecting_niches.id` | Dashboard, DetalheCampanha, Leads |
| FunnelStage | `funnel_stages` | `id` | `company_id → companies.id` | Dashboard (implícito), Funil |
| CrmLead | `crm_leads` | `id` | `company_id → companies.id`, `stage_id → funnel_stages.id`, `prospecting_lead_id → prospecting_leads.id` (nullable) | Funil |
| LeadActivity | `lead_activities` | `id` | `company_id → companies.id`, `lead_id → crm_leads.id` | Funil |

### Relacionamentos entre entidades

- `User` (owner) → `Company` (1:N — um user pode criar várias empresas? No mock: 1 user é owner de 1 company)
- `Company` → `CompanyMember` (1:N)
- `User` → `CompanyMember` (1:N)
- `Company` → `ProspectingNiche` (1:N)
- `Company` → `ProspectingCampaign` (1:N)
- `ProspectingNiche` → `ProspectingCampaign` (1:N)
- `Company` → `ProspectingLead` (1:N)
- `ProspectingCampaign` → `ProspectingLead` (1:N)
- `ProspectingNiche` → `ProspectingLead` (1:N)
- `Company` → `FunnelStage` (1:N)
- `Company` → `CrmLead` (1:N)
- `FunnelStage` → `CrmLead` (1:N)
- `ProspectingLead` → `CrmLead` (1:1, nullable)
- `Company` → `LeadActivity` (1:N)
- `CrmLead` → `LeadActivity` (1:N)

---

## Componentes Compartilhados (usados em 2+ páginas)

| Componente | Arquivo | Usado em |
|---|---|---|
| `AppLayout` | `src/components/layout/AppLayout.tsx` | Todas as rotas `_app/*` |
| `LeadsMap` | `src/components/LeadsMap.tsx` | DOC_Leads, DOC_DetalheCampanha |
| `CampaignMap` | `src/components/CampaignMap.tsx` | DOC_DetalheCampanha |
| `ClientOnly` | `src/components/ClientOnly.tsx` | DOC_Leads, DOC_DetalheCampanha |
| `Metric` (local) | `_app.prospeccao.campanhas.$id.tsx` (inline) | DOC_DetalheCampanha |
| `Badge` | `src/components/ui/badge.tsx` | Todas |
| `Card` (+ CardContent) | `src/components/ui/card.tsx` | Todas |
| `Button` | `src/components/ui/button.tsx` | Todas |
| `Input` | `src/components/ui/input.tsx` | Login, Signup, Nichos, Campanhas, Funil |
| `Label` | `src/components/ui/label.tsx` | Login, Signup, Nichos, Campanhas, Leads, Funil |
| `Select` (e variações) | `src/components/ui/select.tsx` | Campanhas, Leads, Funil |
| `Dialog` (e variações) | `src/components/ui/dialog.tsx` | Nichos, Campanhas, Funil |
| `Sheet` (e variações) | `src/components/ui/sheet.tsx` | Leads, Funil |
| `Table` (e variações) | `src/components/ui/table.tsx` | Campanhas, Leads |
| `Textarea` | `src/components/ui/textarea.tsx` | Nichos, Leads, Funil |
| `Slider` | `src/components/ui/slider.tsx` | Campanhas, Leads |
| `Switch` | `src/components/ui/switch.tsx` | Nichos |
| `Checkbox` | `src/components/ui/checkbox.tsx` | Leads |
| `Avatar` (+ AvatarFallback) | `src/components/ui/avatar.tsx` | AppLayout |
| `AlertDialog` (e variações) | `src/components/ui/alert-dialog.tsx` | Nichos |
| `Tabs` (e variações) | `src/components/ui/tabs.tsx` | Funil |
| `Badge` (status/score) | `src/components/ui/badge.tsx` | Todas |

---

## Funções Utilitárias Compartilhadas

| Função | Arquivo | Descrição |
|--------|---------|-----------|
| `cn()` | `src/lib/utils.ts` | Merge de classes Tailwind (clsx + twMerge) |
| `formatBRL()` | `src/lib/format.ts` | Formata valor numérico para moeda BRL |
| `scoreColor()` | `src/lib/format.ts` | Retorna 'high' / 'medium' / 'low' conforme score |
| `scoreClasses()` | `src/lib/format.ts` | Retorna classes Tailwind para badge de score |
| `LEAD_STATUS_LABEL` | `src/lib/format.ts` | Mapa de enum → label pt-BR |
| `LEAD_STATUS_CLASSES` | `src/lib/format.ts` | Mapa de enum → classe Tailwind |
| `CAMPAIGN_STATUS_LABEL` | `src/lib/format.ts` | Mapa de enum → label pt-BR |
| `CAMPAIGN_STATUS_CLASSES` | `src/lib/format.ts` | Mapa de enum → classe Tailwind |

---

## Dependências de Terceiros e Equivalentes Sugeridos

| Pacote Atual | Uso | Situação na Migração |
|---|---|---|
| `@tanstack/react-router` | Roteamento file-based | Substituir por Next.js App Router |
| `@tanstack/react-query` | Data fetching | Manter (opcional) ou usar Server Components |
| `@tanstack/react-start` | SSR framework | Substituir por Next.js |
| `react-router-dom` | — | Não usado (TanStack Router já) |
| `@dnd-kit/core` | Drag & drop (kanban) | Manter (`"use client"`) |
| `@dnd-kit/sortable` | Sortable DnD | Manter (`"use client"`) |
| `leaflet` / `react-leaflet` | Mapas | Manter com `dynamic(() => import(...))` e `ssr: false` |
| `recharts` | Gráficos | Manter (`"use client"`) — atualmente instalado mas não usado |
| `date-fns` | Formatação de datas | Manter |
| `sonner` | Toast notifications | Manter (`"use client"`) |
| `lucide-react` | Ícones SVG | Manter |
| `react-hook-form` + `zod` | Formulários + validação | Manter (`"use client"`) |
| `@hookform/resolvers` | Integração zod | Manter |
| `cmdk` | Command menu (shadcn) | Manter (via shadcn/ui) |
| `vaul` | Drawer (shadcn) | Manter (via shadcn/ui) |
| `embla-carousel-react` | Carrossel (shadcn) | Manter (via shadcn/ui) |
| `input-otp` | OTP input (shadcn) | Manter (via shadcn/ui) |
| `react-day-picker` | Calendário (shadcn) | Manter (via shadcn/ui) |
| `react-resizable-panels` | Painéis redimensionáveis | Manter (`"use client"`) |
| `class-variance-authority` | Variantes de componentes | Manter (via shadcn/ui) |
| `clsx` + `tailwind-merge` | CN utility | Manter |
| `tailwindcss` v4 | Estilização | Manter (já v4) |
| `tw-animate-css` | Animações Tailwind | Manter |
| `@radix-ui/*` | Primitivos acessíveis | Manter (via shadcn/ui) |

---

## Observações Gerais para Migração

### Server Components vs Client Components

| Tipo | Deve ser `"use client"` | Pode ser Server Component |
|------|------------------------|--------------------------|
| AppLayout (sidebar) | ✅ (useState, interatividade) | ❌ |
| Dashboard | ❌ (só renderiza dados) | ✅ |
| Nichos | ✅ (CRUD, modais, formulários) | ❌ |
| Campanhas (lista) | ✅ (formulários, diálogos) | ❌ |
| DetalheCampanha | ✅ (mapa lazy, interação) | ❌ |
| Leads | ✅ (filtros, sheet, mapa lazy) | ❌ |
| Funil (kanban) | ✅ (DnD, sheets, formulários) | ❌ |
| Login | ✅ (formulário, estado) | ❌ |
| Signup | ✅ (formulário, estado) | ❌ |
| LeadsMap / CampaignMap | ❌ (lazy, client-only) | ❌ |

### Comportamentos que precisam de adaptação

1. **Data fetching**: Todo dado vem de `useContext` + `useState` com valores mock. Deve migrar para:
   - Server Components com `async` + fetch direto ao banco (Drizzle)
   - Ou TanStack Query no client (para dados mutáveis)
2. **localStorage**: Não usado atualmente, mas mencionar que no Next.js deve ser acessado via `useEffect` ou `"use client"`
3. **Leaflet**: Precisa de `dynamic(() => import(...), { ssr: false })` e `ClientOnly` wrapper
4. **Autenticação**: Substituir mock por Better Auth (login real, sessão, proteção de rotas)
5. **Multi-tenancy**: Toda query deve ser filtrada por `companyId`. Better Auth + Drizzle devem prover o tenant atual via sessão
6. **Imagens**: Avatar usa iniciais (sem imagem real), mas se for adicionar, usar `<Image>` do Next.js
7. **SEO**: Adicionar `generateMetadata()` em cada página
8. **Error handling**: Substituir `error-page.ts` + `error-capture.ts` por `error.tsx` + `global-error.tsx` do Next.js
9. **404**: Substituir NotFoundComponent inline por `not-found.tsx`
