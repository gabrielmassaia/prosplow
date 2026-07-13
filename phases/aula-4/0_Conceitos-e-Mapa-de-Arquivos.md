# Aula 4 — Polish e Produção (implementação parcial)

> Parte de `aula-4`. Este é o índice de leitura da Aula 4.

---

## Roteiro desta pasta

| Arquivo | O que constrói |
|---|---|
| `1_Seed-Automatico-no-Cadastro.md` | `CreateUserWithCompany` passa a semear as etapas do funil na criação da empresa |
| `2_Metadata-Error-e-NotFound.md` | `generateMetadata()` no dashboard, `error.tsx` e `not-found.tsx` globais |
| `3_Proxy-Validacao-de-Sessao.md` | `src/proxy.ts` passa a validar a sessão de verdade, não só a presença do cookie |
| `4_Verificacao-Armadilhas-e-Pendencias.md` | Checklist final, armadilhas, pendências fora de escopo |

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
