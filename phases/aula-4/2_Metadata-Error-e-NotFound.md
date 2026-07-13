# Aula 4 — 2. Metadata, Error e Not Found

> Parte de `aula-4`. Pré-requisito: `1_Seed-Automatico-no-Cadastro.md`. Próximo arquivo: `3_Proxy-Validacao-de-Sessao.md`.

## Task 2: `generateMetadata()` no dashboard

- [x] `src/app/(protected)/prospeccao/page.tsx` ganhou:

```typescript
export async function generateMetadata(): Promise<Metadata> {
  return { title: "Dashboard" };
}
```

Com isso, todas as páginas de rota (exceto a raiz `/`, que só redireciona, e os layouts, que herdam o metadata estático do root) têm `generateMetadata()` ou `metadata` próprio.

---

## Task 3: `error.tsx` e `not-found.tsx` globais

- [x] `src/app/not-found.tsx` — Server Component, `Card` + `Button` do shadcn, ícone `Compass` (lucide), link "Voltar para o dashboard".
- [x] `src/app/error.tsx` — **precisa ser Client Component** (`"use client"` no topo — convenção obrigatória do App Router para arquivos `error.tsx`). Recebe `{ error, reset }` como props; loga o erro no console via `useEffect`; botão "Tentar novamente" chama `reset()`, botão "Dashboard" navega para `/prospeccao`.

Ambos ficam na raiz de `src/app/` (cobrem toda a aplicação, incluindo `(auth)` e `(protected)`).

