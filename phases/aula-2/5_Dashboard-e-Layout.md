# Aula 2 — 5. Dashboard e Layout Compartilhado

> Parte de `aula-2`. Pré-requisito: `4_Leads.md`. Próximo arquivo: `6_Verificacao-e-Armadilhas.md`.
>
> Componentes de layout compartilhados entre as páginas desta fase, a atualização da Sidebar com os novos links, e o Dashboard (que consome dados de Nichos, Campanhas e Leads).

---

## Componentes compartilhados de layout

- [ ] **Step 0a: Adicionar componente shadcn `skeleton`**

```bash
npx shadcn@latest add skeleton
```

- [ ] **Step 0b: Criar `src/components/BasePageLayout/BasePageLayout.tsx`**

> Wrapper usado por toda página protegida — título/descrição opcionais + padding consistente. Substitui o bloco `<div className="flex flex-1 flex-col p-8"><h1>...` que antes era duplicado em cada página.

```tsx
import type { ReactNode } from "react";

interface BasePageLayoutProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function BasePageLayout({ title, description, actions, children }: BasePageLayoutProps) {
  return (
    <div className="flex flex-1 flex-col p-8">
      {title && (
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
```

`title` é opcional: páginas cujo Client Component já renderiza seu próprio cabeçalho rico (ex: detalhe da campanha, que mostra nome + badge + botão "Executar busca") passam `<BasePageLayout>` sem `title`, para não duplicar o `<h1>`.

- [ ] **Step 0c: Criar `src/components/shared/loading-content.tsx`**

> Skeleton exibido pelo `Suspense` enquanto o Data Loader (Server Component) busca os dados da página.

```tsx
import { Skeleton } from "@/components/ui/skeleton";

interface LoadingContentProps {
  title?: string;
  withHeader?: boolean;
  rows?: number;
}

export function LoadingContent({ title, withHeader = true, rows = 4 }: LoadingContentProps) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      {withHeader && (
        <div className="space-y-2">
          {title && <p className="text-sm text-muted-foreground">{title}</p>}
          <Skeleton className="h-8 w-64" />
        </div>
      )}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
```

---

## Task 12: Sidebar — adicionar links de navegação

**Arquivo:** `src/components/layout/Sidebar.tsx` (componente `AppSidebar`, construído sobre o `Sidebar` do shadcn/ui — ver `/docs/setup-next16-better-auth-neon.md` § Sidebar/Design System para a base já criada na Fase 1)

- [ ] **Step 1: Atualizar `navItems` com todas as rotas de Fase 2**

```typescript
import { BarChart2, Map, Tag, Users } from "lucide-react";

const navItems = [
  { href: "/prospeccao", label: "Dashboard", icon: BarChart2, exact: true },
  { href: "/prospeccao/nichos", label: "Nichos", icon: Tag, exact: false },
  { href: "/prospeccao/campanhas", label: "Campanhas", icon: Map, exact: false },
  { href: "/prospeccao/leads", label: "Leads", icon: Users, exact: false },
];
```

- [ ] **Step 2: Renderizar cada item com `SidebarMenuButton`**

O `Sidebar` do shadcn/ui usa o padrão `render` (base-ui) em vez de `asChild`: o `<Link>` é passado como elemento a renderizar, e o `isActive` controla o estado visual (`data-active`) sem precisar de classes condicionais manuais.

```tsx
<SidebarMenu>
  {navItems.map(({ href, label, icon: Icon, exact }) => {
    const active = exact
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");
    return (
      <SidebarMenuItem key={href}>
        <SidebarMenuButton isActive={active} render={<Link href={href} />}>
          <Icon />
          <span>{label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  })}
</SidebarMenu>
```

Como a Fase 1 já entrega o `AppSidebar` construído sobre `Sidebar`/`SidebarMenu`/`SidebarMenuButton` do shadcn (não sobre `<div>`/`<a>` manuais), este Task só precisa acrescentar os 3 itens novos — nenhuma reestruturação do componente é necessária.


---

## Task 13: Dashboard — `src/app/(protected)/prospeccao/page.tsx`

- [ ] **Step 1: Reescrever como Server Component com dados reais**

```tsx
import Link from "next/link";
import { Map, Tag, TrendingUp, Users } from "lucide-react";

import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleNicheRepository } from "@/infrastructure/repositories/DrizzleNicheRepository";
import { DrizzleCampaignRepository } from "@/infrastructure/repositories/DrizzleCampaignRepository";
import { DrizzleLeadRepository } from "@/infrastructure/repositories/DrizzleLeadRepository";
import { CAMPAIGN_STATUS_CLASSES, CAMPAIGN_STATUS_LABEL } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export default async function DashboardPage() {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const nicheRepo = new DrizzleNicheRepository(db);
  const campaignRepo = new DrizzleCampaignRepository(db);
  const leadRepo = new DrizzleLeadRepository(db);

  const [niches, campaigns, leadCounts] = await Promise.all([
    nicheRepo.findAllByCompany(companyId),
    campaignRepo.findAllByCompany(companyId),
    leadRepo.countByCompany(companyId),
  ]);

  const activeNiches = niches.filter((n) => n.isActive).length;
  const completedCampaigns = campaigns.filter((c) => c.status === "completed").length;
  const recentCampaigns = [...campaigns].reverse().slice(0, 5);

  const stats = [
    { label: "Nichos ativos", value: activeNiches, icon: Tag, color: "text-primary bg-primary/10", href: "/prospeccao/nichos" },
    { label: "Campanhas concluídas", value: completedCampaigns, icon: Map, color: "text-violet-600 bg-violet-50", href: "/prospeccao/campanhas" },
    { label: "Leads prospectados", value: leadCounts.total, icon: Users, color: "text-amber-600 bg-amber-50", href: "/prospeccao/leads" },
    { label: "Qualificados (score 70+)", value: leadCounts.qualified, icon: TrendingUp, color: "text-emerald-600 bg-emerald-50", href: "/prospeccao/leads" },
  ];

  return (
    <div className="flex flex-1 flex-col p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visão geral da prospecção ativa
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, color, href }) => (
          <Link key={label} href={href}>
            <div className="flex items-center gap-4 rounded-xl border border-border/60 bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Campanhas recentes */}
      <div className="mt-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Campanhas recentes
        </h2>
        {recentCampaigns.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma campanha criada ainda.</p>
            <Link
              href="/prospeccao/campanhas"
              className="mt-3 inline-block text-sm text-primary hover:text-primary/75"
            >
              Criar primeira campanha →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {recentCampaigns.map((c) => (
              <Link key={c.id} href={`/prospeccao/campanhas/${c.id}`}>
                <div className="flex items-center justify-between rounded-lg border border-border/60 bg-card px-4 py-3.5 shadow-sm transition-colors hover:bg-accent/60">
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.city}, {c.state}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium tabular-nums text-foreground">{c.totalFound} leads</span>
                    <Badge className={CAMPAIGN_STATUS_CLASSES[c.status]}>
                      {CAMPAIGN_STATUS_LABEL[c.status]}
                    </Badge>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

