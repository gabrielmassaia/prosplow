# Fase 4 — Polish e Produção (implementação parcial)

> **Para agentes:** Use superpowers:subagent-driven-development ou superpowers:executing-plans para executar tarefa a tarefa. Steps usam checkbox (`- [ ]`) para rastreamento.
>
> **Regra:** NUNCA fazer `git commit` automaticamente. O desenvolvedor commita manualmente.

**Objetivo:** Fechar as lacunas de "produção real" identificadas depois da Fase 3: seed automático das etapas do funil, metadata em todas as páginas, páginas globais de erro/404 e validação real de sessão no proxy.

**Escopo revisado:** o SPEC original da Fase 4 tinha 7 itens. Dois foram removidos do escopo desta versão (ver `docs/SPEC.md`, seção Fase 4): "seletor de empresa" e "convite de membros por email" — eram interdependentes (trocar de empresa só faz sentido se um usuário puder pertencer a mais de uma, o que exige convite) e este produto mantém uma empresa por usuário. Um terceiro item, **rate limiting nas actions de IA**, foi adiado por decisão do desenvolvedor — fica documentado como pendência, sem implementação nesta fase.

**Implementado nesta fase:**
1. Seed automático das etapas do funil na criação da empresa
2. `generateMetadata()` no dashboard (única página que faltava)
3. `error.tsx` e `not-found.tsx` globais
4. Validação real de sessão no Proxy (Next.js 16)

---

## Constraints globais

- Toda action começa com `requireUser()` → `requireCompany(user.id)`
- Toda query filtra por `companyId` — sem exceção
- Repositórios recebem `db` no construtor, nunca importam globalmente
- `domain/` não importa nada externo
- NUNCA commitar — o desenvolvedor faz os commits manualmente

---

## Conceitos que você precisa entender antes de codar

### Por que o seed entra em `CreateUserWithCompany`, e não num hook de login

O SPEC original falava em "seed no primeiro login". Investigando o código, uma empresa só é criada em **um único lugar**: `CreateUserWithCompany.execute()` (`src/use-cases/auth/CreateUserWithCompany.ts`), chamado pela action de cadastro. Não existe (nem esta fase cria) um fluxo de múltiplas empresas por usuário, então "primeiro login" e "momento da criação da empresa" são, na prática, a mesma coisa. Em vez de configurar um `databaseHooks` novo no Better Auth (`src/lib/auth.ts`) só para replicar esse único ponto, o seed foi chamado diretamente logo depois que `companyRepo.create(...)` retorna a empresa criada — menos código, mesmo efeito, sem tocar na configuração do Better Auth.

O seed lazy que já existia desde a Fase 3, dentro de `getFunilBootstrapAction`, **continua no código** — agora é uma segunda camada de proteção, útil para as empresas de teste já existentes no banco antes desta mudança (que nunca passaram pelo novo fluxo de cadastro). `SeedFunnelStages.execute()` já é idempotente (`countByCompany` antes de inserir), então não há risco de duplicar etapas mesmo rodando duas vezes.

### Next.js 16 renomeou `middleware.ts` para "Proxy" — e ele sempre roda em Node.js

No Next.js 16, o antigo `middleware.ts` virou o conceito de **Proxy** (`src/proxy.ts`), com uma mudança importante: **o Proxy sempre roda em runtime Node.js**, não mais Edge por padrão. Tentar declarar `export const runtime = "..."` no arquivo de Proxy agora é um **erro de build** ("Route segment config is not allowed in Proxy file... Proxy always runs on Node.js runtime") — descobrimos isso na prática ao tentar adicionar essa linha.

Isso é uma boa notícia para este projeto: o pool de conexão Postgres (`pg.Pool`, usado pelo Drizzle em `src/infrastructure/db/index.ts`) só funciona em runtime Node.js (não tem suporte a socket TCP no Edge Runtime). Como o Proxy do Next 16 já roda em Node.js nativamente, dá para chamar `auth.api.getSession()` (que depende do `db`) diretamente dentro do Proxy, sem precisar de nenhuma configuração especial.

### O trade-off de validar sessão no Proxy

Antes, o Proxy só verificava se o cookie `better-auth.session_token` existia — um cookie com qualquer valor passava, e só era invalidado depois, dentro do Server Component, por `requireUser()`. Agora o Proxy chama `auth.api.getSession({ headers: request.headers })` e só deixa passar se a sessão for real e válida no banco.

Isso adiciona uma consulta ao banco em toda requisição às rotas protegidas. Para uma aplicação deste porte (ensino/demo), o custo é aceitável e é exatamente o comportamento que o SPEC pede — mas vale saber que a prática recomendada pelo próprio Better Auth para middlewares de altíssima escala é o oposto (checar só o cookie no edge, e validar de verdade só na página), justamente para evitar essa query extra em toda requisição. As duas abordagens são válidas; a escolha aqui prioriza segurança/simplicidade sobre performance bruta.

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/use-cases/auth/CreateUserWithCompany.ts` | Modificar | Recebe `IFunnelStageRepository`, chama `SeedFunnelStages` após criar a empresa |
| `src/app/actions/auth/signup.ts` | Modificar | Instancia `DrizzleFunnelStageRepository` e injeta no use case |
| `src/app/(protected)/prospeccao/page.tsx` | Modificar | Adiciona `generateMetadata()` |
| `src/app/error.tsx` | Criar | Página de erro global (Client Component) |
| `src/app/not-found.tsx` | Criar | Página 404 global |
| `src/proxy.ts` | Modificar | Troca checagem de cookie por `auth.api.getSession()` real |
| `docs/SPEC.md` | Modificar (já feito antes desta fase) | Escopo da Fase 4 realinhado |

---

## Task 1: Seed automático na criação da empresa

- [x] `CreateUserWithCompany` passa a receber um segundo parâmetro no construtor: `stageRepo: IFunnelStageRepository`.
- [x] Depois de `const company = await this.companyRepo.create(...)`, chama `await new SeedFunnelStages(this.stageRepo).execute({ companyId: company.id })` — sem checar o resultado (se falhar, `SeedFunnelStages` já captura o erro internamente e retorna `{ ok: false }`, não lança exceção; o seed lazy do bootstrap cobre o caso depois).
- [x] `signup.ts` instancia `DrizzleFunnelStageRepository(db)` e passa como segundo argumento: `new CreateUserWithCompany(companyRepo, stageRepo)`.

```typescript
// src/use-cases/auth/CreateUserWithCompany.ts (trecho)
const company = await this.companyRepo.create({ name: companyName, slug, ownerId: userId });

// Seed das etapas padrão do funil (falha aqui não deve impedir o cadastro —
// o bootstrap do funil também seeda de forma lazy como segunda camada de proteção)
await new SeedFunnelStages(this.stageRepo).execute({ companyId: company.id });

return { ok: true };
```

---

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

---

## Task 4: Validação real de sessão no Proxy

- [x] `src/proxy.ts`: removida a checagem de presença de cookie, substituída por:

```typescript
import { auth } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicPaths.includes(pathname) || pathname.startsWith(authApiPrefix)) {
    return NextResponse.next();
  }

  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}
```

Não foi necessário (e não é permitido) declarar `export const runtime` — o Proxy do Next.js 16 já roda sempre em Node.js.

---

## Task 5: Verificação final

- [x] `npm run build` — sem erros de TypeScript/ESLint.
- [x] `npx eslint` nos arquivos novos/modificados desta fase — zero erros/warnings.
- [x] Smoke test com o servidor de dev: cookie de sessão inválido (`better-auth.session_token=garbage-invalid-token`) em `/prospeccao` → redireciona para `/login` (antes, um cookie com qualquer valor passava).
- [x] Sem cookie nenhum em `/funil` → redireciona para `/login` (comportamento já esperado, continua funcionando).
- [ ] **Manual, com um cadastro novo** (não automatizável nesta sessão via curl, pois passa por Server Action do formulário de registro): criar uma conta nova em `/register` e confirmar, via query direta no Neon, que `funnel_stages` já tem 8 linhas para a empresa recém-criada **antes** de visitar `/funil` pela primeira vez.
- [ ] **Manual**: acessar uma rota autenticada inexistente (ex: `/prospeccao/rota-que-nao-existe`) e confirmar que `not-found.tsx` renderiza (o teste via curl sem sessão sempre cai no redirect do Proxy antes de chegar no roteamento do Next, então não dá para verificar isso sem uma sessão real).
- [ ] **Manual**: forçar um erro temporário em alguma página (ex: um `throw new Error("teste")` no topo de um Server Component) e confirmar que `error.tsx` renderiza com o botão "Tentar novamente" funcional — depois remover o throw.

---

## Armadilhas desta fase

### `export const runtime` no Proxy é erro de build no Next.js 16
Diferente de versões anteriores (onde middleware podia rodar em Edge ou declarar `runtime: "nodejs"` explicitamente), o Next.js 16 já fixa o Proxy em Node.js e **rejeita** qualquer `route segment config` no arquivo. Se você vier de um projeto Next 14/15, não tente adicionar essa linha — vai quebrar o build.

### `SeedFunnelStages` nunca deve lançar exceção que aborte o cadastro
Como o seed roda dentro do mesmo `try/catch` de `CreateUserWithCompany.execute()`, se `SeedFunnelStages` lançasse uma exceção não capturada, o cadastro inteiro falharia por causa de uma etapa de funil. Isso não acontece porque `SeedFunnelStages.execute()` já captura seus próprios erros e retorna `{ ok: false }` em vez de lançar — mas é importante manter essa garantia se o use case for alterado no futuro.

### Testar Proxy/sessão via curl tem limite
Como o Proxy roda antes do roteamento do Next.js, qualquer requisição sem sessão válida para uma rota inexistente redireciona para `/login` — não dá para provar que `not-found.tsx` funciona sem uma sessão real. Os testes automatizados desta fase cobriram a validação de sessão (cookie ausente/inválido), mas os testes de `not-found.tsx`/`error.tsx` em rotas autenticadas ficaram como verificação manual.

---

## Pendências (fora desta fase)

- **Rate limiting nas server actions de IA** (`generate-diagnosis.ts`, `generate-message.ts`) — adiado por decisão do desenvolvedor. Quando for revisitado, a opção recomendada é um contador no próprio Neon (sem precisar de Redis/Upstash), já que o projeto não tem nenhuma infraestrutura de KV/cache configurada.
- **Seletor de empresa** e **convite de membros por email** — fora de escopo desta versão (ver `docs/SPEC.md`, Fase 4).
