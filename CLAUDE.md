# CLAUDE.md — ProspFlow

Instruções para agentes de IA trabalhando neste projeto.

---

## Identidade do projeto

**ProspFlow** é um SaaS multi-tenant de prospecção ativa e gestão comercial para agências de marketing digital. Desenvolvido em Next.js 16 + React 19 + Better Auth + Drizzle ORM + Neon PostgreSQL + Cloudflare AI.

Este projeto tem um propósito duplo:
1. Ser um produto funcional
2. Ser reescrito ao vivo em uma live de programação pelo desenvolvedor

Por isso, **tudo que você implementar precisa ser documentado** em `phases/` de forma que um humano consiga replicar manualmente, com explicações técnicas e justificativas de cada decisão.

---

## Leitura obrigatória antes de qualquer trabalho

Antes de escrever qualquer linha de código, leia nesta ordem:

1. `/docs/SPEC.md` — visão geral, arquitetura, fases, schema completo, integrações
2. `/docs/setup-next16-better-auth-neon.md` — referência de configuração do stack base
3. `/docs/DOC_INDEX.md` — mapa de todas as páginas e entidades
4. `DOC_[Pagina].md` correspondente à feature que vai implementar

---

## Regra de ouro: documentar enquanto constrói

**Nunca termine uma fase sem criar o arquivo de fase correspondente.**

A cada fase concluída, crie ou atualize `phases/FASE_[N]_[nome].md` com:

- O que foi construído (lista de arquivos criados/alterados)
- Por que cada decisão foi tomada (justificativa técnica)
- Conceitos importantes explicados para um desenvolvedor iniciante/intermediário
- O passo a passo manual para replicar (como se fosse um tutorial)
- Armadilhas encontradas e como evitar
- Comandos executados na ordem exata

O arquivo de fase é o material de estudo da live. Escreva como se estivesse explicando para alguém que nunca viu o projeto.

---

## Arquitetura — regras inegociáveis

A estrutura segue Clean Architecture pragmático. Respeite sempre:

```
domain/        → interfaces puras. Zero import de lib externa (Drizzle, Next.js, fetch, etc.)
infrastructure/ → implementações concretas. Conhece Drizzle, fetch, APIs externas.
use-cases/     → lógica de negócio. Recebe interfaces, nunca implementações.
app/actions/   → controllers finos. Valida input → instancia deps → chama use case → retorna.
```

**Violações que nunca devem acontecer:**

- ❌ Action importando `db` diretamente e fazendo query
- ❌ Use case importando `DrizzleXRepository` (concreto)
- ❌ Repositório com lógica de negócio (score, validação de regra)
- ❌ `domain/` importando qualquer coisa de fora do próprio `domain/`
- ❌ Componente de página fazendo fetch direto sem passar por action ou Server Component

**Injeção de dependência nas actions:**

```typescript
// CORRETO
export async function runCampaignAction(campaignId: string) {
  "use server";
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const campaignRepo = new DrizzleCampaignRepository(db);
  const leadRepo = new DrizzleLeadRepository(db);
  const geoService = new OverpassGeoService();

  const useCase = new RunCampaign(campaignRepo, leadRepo, geoService);
  return useCase.execute({ campaignId, companyId });
}

// ERRADO
export async function runCampaignAction(campaignId: string) {
  "use server";
  const leads = await db.query.prospectingLeads.findMany(...); // ❌
}
```

---

## Convenções de código

| Item | Regra |
|---|---|
| Exports do schema | Sempre sufixo `Table` (ex: `nichesTable`) |
| Server Actions | `"use server"` no topo do arquivo |
| Toda action começa com | `requireUser()` → `requireCompany(user.id)` |
| Repositórios | Recebem `db` no construtor, nunca importam globalmente |
| `"use client"` | Só em formulários, modais, mapas, DnD e hooks de estado |
| Leaflet / DnD | Sempre `dynamic(() => import(...), { ssr: false })` |
| Nomes de arquivos | kebab-case para arquivos, PascalCase para classes e componentes |
| Retorno de actions | Sempre `{ ok: true, data? } | { ok: false, error: string }` |

---

## Como executar cada fase

1. Leia o SPEC e identifique o escopo exato da fase
2. Leia os DOC_*.md das páginas envolvidas
3. Implemente seguindo a ordem: schema → domain → infrastructure → use-cases → actions → UI
4. Ao finalizar, crie `phases/FASE_[N]_[nome].md` (ver formato em AGENTS.md)
5. Rode `npx drizzle-kit push` se adicionou tabelas
6. Verifique se o comportamento esperado no SPEC está funcionando

---

## Tenant safety

Todo use case e toda action recebe `companyId` explicitamente.
Toda query no banco filtra por `companyId`. Sem exceção.

```typescript
// CORRETO
findAllByCompany(companyId: string): Promise<Niche[]>

// ERRADO
findAll(): Promise<Niche[]>  // ← vaza dados entre tenants
```

---

## Variáveis de ambiente

Fase 1:
```env
DATABASE_URL=
BETTER_AUTH_URL=
BETTER_AUTH_SECRET=
```

Fase 2 (adicionar):
```env
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_AI_TOKEN=
```

Sempre atualizar `.env.local.example` ao adicionar nova variável.

---

## O que NÃO fazer

- **Nunca fazer `git commit` automaticamente.** O desenvolvedor faz commits manualmente.
- Não iniciar implementação de uma fase sem ler o SPEC e os DOCs correspondentes
- Não criar tabelas sem adicionar ao `schema.ts` e rodar `drizzle-kit push`
- Não esquecer de criar o arquivo `phases/FASE_[N].md` ao final
- Não pular a injeção de dependência para "simplificar"
- Não colocar lógica de negócio em componentes React
- Não usar `any` em TypeScript — inferir ou tipar explicitamente
- Não hardcodar `companyId` — sempre vem da sessão via `requireCompany()`
