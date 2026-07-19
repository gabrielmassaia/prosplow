# Aula 4 — 2. Metadata, Error e Not Found

> Parte de `aula-4`. Pré-requisito: `1_Seed-Automatico-no-Cadastro.md`. Próximo arquivo: `3_Proxy-Validacao-de-Sessao.md`.

## Task 2: `generateMetadata()` no dashboard

- [ ] `src/app/(protected)/prospeccao/page.tsx` ganha:

```typescript
export async function generateMetadata(): Promise<Metadata> {
  return { title: "Dashboard" };
}
```

Com isso, todas as páginas de rota (exceto a raiz `/`, que só redireciona, e os layouts, que herdam o metadata estático do root) têm `generateMetadata()` ou `metadata` próprio.

---

## Task 3: `error.tsx` e `not-found.tsx` globais + boundary do segmento protegido

O App Router tem dois arquivos especiais de convenção: `not-found.tsx` (renderizado quando `notFound()` é chamado ou uma rota não existe) e `error.tsx` (um **error boundary** de React que captura exceções na renderização daquele segmento). Regras que valem a pena dizer em voz alta:

- `error.tsx` **precisa** ser Client Component (`"use client"` no topo) — ele é um boundary de React, que só existe no cliente. Recebe sempre `{ error, reset }`: `reset()` tenta re-renderizar o segmento.
- `not-found.tsx` pode ser Server Component (é só UI estática).
- Um `error.tsx` na raiz cobre tudo, mas quando ele dispara, substitui a tela inteira. Por isso adicionamos também um `error.tsx` **dentro de `(protected)`**: um erro numa página interna é capturado ali, mantendo a sidebar/shell no lugar; o global só entra se o próprio layout protegido falhar.

- [ ] **Criar `src/app/not-found.tsx`** — Server Component (tem `metadata` estático próprio):

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Página não encontrada" };

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <Card className="max-w-sm text-center">
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Compass className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Página não encontrada</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              O endereço acessado não existe ou foi movido.
            </p>
          </div>
          <Button render={<Link href="/prospeccao" />}>Voltar para o dashboard</Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

> `Button render={<Link .../>}` é a API do Base UI (base do shadcn deste projeto): em vez de `asChild`, o `Button` renderiza o elemento passado em `render`, herdando o estilo. É como o botão "vira" um link do Next sem perder o visual.

- [ ] **Criar `src/app/error.tsx`** — Client Component global:

```tsx
"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <Card className="max-w-sm text-center">
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Algo deu errado</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ocorreu um erro inesperado. Tente novamente ou volte para o dashboard.
            </p>
          </div>
          <div className="flex w-full gap-2">
            <Button variant="outline" className="flex-1" onClick={reset}>
              Tentar novamente
            </Button>
            <Button className="flex-1" render={<Link href="/prospeccao" />}>
              Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Criar `src/app/(protected)/error.tsx`** — boundary do segmento protegido (não é full-screen; preenche a área de conteúdo dentro da shell):

```tsx
"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ProtectedError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <Card className="max-w-sm text-center">
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Algo deu errado</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ocorreu um erro ao carregar esta página. Tente novamente.
            </p>
          </div>
          <Button variant="outline" onClick={reset}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

