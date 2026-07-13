# Aula 1 — 8. Layout Protegido e Sidebar

> Parte de `aula-1`. Pré-requisito: `7_UI-Paginas-Auth.md`. Próximo arquivo: `9_Verificacao-e-Armadilhas.md`.

---

Crie `src/app/(protected)/layout.tsx` (placeholder simples — a versão final, com `AppSidebar`, vem mais abaixo neste mesmo arquivo):

```tsx
import { requireUser } from "@/lib/tenant";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser(); // redireciona para /login se não autenticado
  return <div className="min-h-screen">{children}</div>;
}
```

Crie `src/app/page.tsx` (raiz — redireciona para /prospeccao):

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/prospeccao");
}
```

**Por que isso existe?** Sem esse arquivo, acessar `/` retorna 404. Redirecionar direto pra `/prospeccao` (em vez de `/login`) é intencional: se o usuário não tiver sessão, o `requireUser()` do layout protegido já lança o redirect pra `/login` — não precisa duplicar essa decisão aqui na raiz.

---

Crie `src/app/(protected)/prospeccao/page.tsx`:

```tsx
import { Target } from "lucide-react";

import { requireCompany, requireUser } from "@/lib/tenant";

export default async function ProspeccaoPage() {
  const user = await requireUser();
  const { company } = await requireCompany(user.id);

  const firstName = user.name.split(" ")[0];

  return (
    <div className="flex flex-1 flex-col p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Prospecção</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Olá, {firstName}. Bem-vindo de volta à{" "}
          <span className="font-medium text-foreground">{company.name}</span>.
        </p>
      </div>

      {/* Empty state */}
      <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 py-20">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Target className="h-6 w-6 text-primary" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-foreground">Nenhuma campanha ainda</h2>
        <p className="mt-1.5 max-w-sm text-center text-sm text-muted-foreground">
          Na Fase 2 vamos criar campanhas de prospecção com busca geolocalizada e geração de leads
          automática via Cloudflare AI.
        </p>
      </div>
    </div>
  );
}
```

Esta já é a versão final do placeholder — usa os tokens de tema (`text-foreground`, `bg-primary/10`) e o bloco `Sidebar`/`(protected)/layout.tsx` construído a seguir, então o ícone `Target` e o card de empty-state já conversam visualmente com o resto do app desde a Fase 1.

---

## Sistema de Design e Sidebar

### Design tokens no `globals.css`

O ProspFlow usa **indigo como cor primária de marca** (`oklch(0.511 0.243 264)` ≈ `#4F46E5`). Todos os neutrals têm um leve viés violeta — cinzas "escolhidos", não herdados do padrão.

O sistema de tokens sobrescreve os defaults cinzas do shadcn/ui e garante consistência em todos os componentes:

```
--primary        → indigo brand (botões, links, foco, ring)
--sidebar        → surface levemente tintada de indigo
--sidebar-primary → indigo (item ativo na nav)
--muted-foreground → slate com leve violeta (labels, metadados)
```

Cada token tem equivalente para `.dark`, com background `oklch(0.118 0.016 264)` (preto com azul-violeta — mais sofisticado que preto puro).

### Sidebar — construída sobre o `Sidebar` do shadcn/ui

A sidebar **não** é um `<aside>`/`<div>` escrito à mão — é construída sobre o bloco `sidebar` do shadcn/ui, que já resolve responsividade (vira um `Sheet` deslizante no mobile, fixa no desktop), estado ativo/colapsado e acessibilidade. Isso evita reescrever esse comportamento manualmente mais tarde, quando o menu ganhar mais itens nas próximas fases.

Adicione o componente:

```bash
npx shadcn@latest add sidebar
```

Isso instala `src/components/ui/sidebar.tsx` e as dependências que ele usa internamente: `separator`, `sheet`, `skeleton`, `tooltip` e o hook `src/hooks/use-mobile.ts`.

Crie `src/components/layout/Sidebar.tsx` (exporta `AppSidebar`). Três zonas, montadas com as peças do shadcn (`SidebarHeader`, `SidebarContent`/`SidebarGroup`/`SidebarMenu`, `SidebarFooter`):

1. **Header**: ícone `Crosshair` em caixa indigo + wordmark
2. **Menu**: um item por rota, usando `SidebarMenuButton` com o padrão `render` (base-ui) em vez de `asChild` — o `<Link>` é passado como elemento a renderizar, e `isActive` controla o estilo do item ativo automaticamente (sem precisar de `cn()` manual)
3. **Footer**: avatar com iniciais (máx. 2 letras), nome + empresa, botão de logout (`Button` do shadcn, não um `<button>` cru)

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Crosshair, LogOut, Target } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

interface AppSidebarProps {
  user: { name: string; email: string };
  company: { name: string };
}

// Só a rota da Fase 1. Cada fase seguinte adiciona seus próprios itens aqui
// (ver Fase 2, aula-2/5_Dashboard-e-Layout.md) — a estrutura do componente não muda.
const navItems = [{ href: "/prospeccao", label: "Prospecção", icon: Target, exact: true }];

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

export function AppSidebar({ user, company }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await authClient.signOut();
    router.push("/login");
  }

  const initials = getInitials(user.name);

  return (
    <Sidebar>
      <SidebarHeader className="h-14 flex-row items-center gap-2.5 border-b border-sidebar-border px-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary">
          <Crosshair className="h-[15px] w-[15px] text-primary-foreground" strokeWidth={2.5} />
        </div>
        <span className="text-[13px] font-semibold tracking-tight text-sidebar-foreground">
          ProspFlow
        </span>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
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
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-1 py-1">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium leading-tight text-sidebar-foreground">
              {user.name}
            </p>
            <p className="truncate text-[11px] leading-tight text-muted-foreground">
              {company.name}
            </p>
          </div>
          <Button
            onClick={handleLogout}
            title="Sair"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-[15px] w-[15px]" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
```

```
getInitials("João Silva") → "JS"
getInitials("Maria")      → "M"
```

O logout chama `authClient.signOut()` e depois `router.push("/login")`.

### Layout protegido — `src/app/(protected)/layout.tsx`

O layout vira Server Component async: busca `user` e `company` via `requireUser()` → `requireCompany()`, e monta a estrutura oficial do bloco `sidebar` — `SidebarProvider` (contexto de aberto/fechado, inclusive no mobile) envolvendo `AppSidebar` + `SidebarInset` (a área de conteúdo). Um `<header>` com `SidebarTrigger` só aparece no mobile (`md:hidden`) — no desktop a sidebar já fica sempre visível, sem precisar de gatilho.

```tsx
import { Crosshair } from "lucide-react";

import { requireCompany, requireUser } from "@/lib/tenant";
import { AppSidebar } from "@/components/layout/Sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { company } = await requireCompany(user.id);

  return (
    <SidebarProvider className="h-screen overflow-hidden bg-background">
      <AppSidebar user={{ name: user.name, email: user.email }} company={company} />
      <SidebarInset className="overflow-y-auto">
        <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border bg-sidebar px-4 md:hidden">
          <SidebarTrigger />
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Crosshair className="h-[15px] w-[15px] text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span className="text-[13px] font-semibold tracking-tight text-sidebar-foreground">
            ProspFlow
          </span>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
```

A separação Server / Client é intencional: o layout busca os dados (Server), a sidebar reage ao pathname e dispara logout (Client). Dados fluem de cima para baixo — nunca o contrário.

**Por que não escrever a sidebar à mão:** dava pra fazer um `<aside>` fixo com Tailwind puro (mais rápido de digitar na hora), mas aí o comportamento mobile (menu escondido, abrindo como overlay) teria que ser implementado manualmente — e não teria estado compartilhado (`useSidebar()`) caso outra parte da UI precise saber se o menu está aberto. Usar o bloco oficial do shadcn resolve isso de graça e é o mesmo padrão usado no resto do projeto para outros componentes (`Dialog`, `Sheet`, `Table`, etc.) — sidebar não deveria ser exceção.

**Convenção do projeto:** toda vez que precisar de um botão clicável — mesmo pequeno, tipo o ícone de logout ou o toggle de mostrar senha nos formulários de login/registro — use o `Button` de `@/components/ui/button` (com `variant="ghost"` e `size="icon-sm"`/`icon-xs"` para botões só de ícone) em vez de um `<button>` cru. Mantém foco/estados de hover/disabled consistentes em todo o app sem precisar reimplementar isso a cada componente novo.
