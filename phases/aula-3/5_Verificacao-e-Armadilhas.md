# Aula 3 — 5. Verificação, Armadilhas e Próximos Passos

> Parte de `aula-3`. Pré-requisito: `4_Integracao-com-Prospeccao.md`. Fecha a Aula 3 — próxima pasta: `aula-4/`.

## Task 12: Verificação final

- [ ] `npx drizzle-kit push` — tabelas e enums criados sem prompt destrutivo.
- [ ] `npm run build` — compila sem erros de TypeScript, sem `any`.
- [ ] `npx eslint` nos arquivos novos/modificados da Fase 3 — zero erros/warnings.
- [ ] `/funil` sem sessão redireciona para `/login` (guard de tenant funcionando).
- [ ] Primeira visita a `/funil` de uma empresa nova cria as 8 etapas (posições 0–7) uma única vez, sem duplicar ao recarregar.
- [ ] Converter um lead de prospecção cria o `CrmLead` na etapa "Novo" com `origin: "prospecting"` e registra a atividade "Lead convertido da prospecção"; o botão fica "Já convertido".
- [ ] Arrastar um card entre colunas atualiza o `stageId` e registra uma `LeadActivity` com a descrição do movimento; soltar na mesma coluna não gera atividade.

---

## Armadilhas desta fase

### Índice único `(companyId, position)` exige inserção em lote
Como `funnel_stages` tem `UNIQUE(company_id, position)`, o seed **precisa** inserir as 8 etapas de uma vez via `bulkCreate` (um único `INSERT ... VALUES (...), (...), ...`). Inserir uma a uma correria o risco de erros de índice caso a ordem de posição não seja controlada com cuidado — `bulkCreate` com o array já ordenado evita esse problema.

### `numeric` do Postgres chega como `string`
`node-postgres` não converte automaticamente `numeric` para `number` (evita perda de precisão silenciosa). Isso é resolvido inteiramente dentro de `DrizzleCrmLeadRepository` — o domínio nunca vê uma string onde espera um número.

### Manual → Triagem, Prospecção → Novo
As duas origens de `CrmLead` entram em etapas diferentes por design: leads manuais precisam de vetting (Triagem), leads de prospecção já foram qualificados por score na Fase 2 (Novo). Não uniformizar isso apagaria essa distinção de processo comercial.

### `MoveLead` é no-op quando solto na mesma coluna
`@dnd-kit` dispara `onDragEnd` mesmo quando o card é solto de volta na coluna de origem. Sem a checagem `lead.stageId === toStageId`, cada "arrasto indeciso" geraria uma `LeadActivity` falsa de movimentação.

### `PointerSensor` sem `activationConstraint` quebra o clique
Sem `activationConstraint: { distance: 5 }`, todo clique num card (inclusive o que abre o drawer de detalhes) é interpretado como início de drag, e o `onClick` do card nunca dispara.

### Seed lazy é uma escolha deliberada, não um atalho
A Fase 4 do SPEC menciona seed automático no cadastro — isso é uma peça da Fase 4. O seed lazy no Data Loader do funil (leitura direta no Server Component) resolve o problema imediato (empresas sem etapas) sem acoplar a Fase 3 a essa peça. Na Fase 4 o seed passa a rodar também no cadastro (`CreateUserWithCompany`), e o lazy continua como segunda camada de proteção.

### `ssr: false` não pode ficar num Server Component
**Sintoma:** `npm run dev` sobe, mas `/funil` quebra com `Ecmascript file had an error: "ssr: false" is not allowed with next/dynamic in Server Components. Please move it into a Client Component.`
**Causa:** `page.tsx` é um Server Component (`generateMetadata` + `async function`). Chamar `dynamic(() => import(...), { ssr: false })` diretamente nele é permitido em versões antigas do Next.js, mas o Next.js 16 passou a rejeitar explicitamente. `CampaignMap`/`LeadsMap` na Fase 2 não têm esse problema porque o `dynamic(ssr:false)` deles está dentro de Client Components (`CampanhaDetailContent`/`LeadsContent`), nunca dentro de um `page.tsx`.
**Solução:** isolar a chamada `dynamic(..., { ssr: false })` num arquivo `"use client"` próprio (`FunilContentLoader.tsx`, ver `3_Interface-Kanban.md`) e importar o componente resultante normalmente no `page.tsx` — sem `dynamic` nenhum ali.

---

## Commits sugeridos da fase (na branch `aula-3`)

A Aula 3 começa criando a branch `aula-3` **a partir da `aula-2`** (`git switch -c aula-3 aula-2`). Commit por funcionalidade:

```bash
git switch -c aula-3 aula-2

# 1_Fundacao-Schema-Domain-Infra.md
git add . && git commit -m "feat: schema do funil (3 tabelas) + domain + repositórios Drizzle"

# 2_Regras-de-Negocio.md
git add . && git commit -m "feat: use-cases do funil (seed, criar, mover, converter) + actions"

# 3_Interface-Kanban.md
git add . && git commit -m "feat: kanban com dnd-kit + drawer + criação de lead"

# 4_Integracao-com-Prospeccao.md
git add . && git commit -m "feat: converter lead de prospecção para o CRM + item de sidebar"
```

---

## Próximos passos — Fase 4

Conforme o SPEC (Fase 4, rescopada): `SeedFunnelStages` disparado no cadastro (`CreateUserWithCompany`), mantendo o seed lazy como segunda camada; `generateMetadata()` nas páginas que faltam (dashboard); `error.tsx`/`not-found.tsx` globais; validação real de sessão no `proxy.ts` (não só presença de cookie); rate limiting nas Server Actions que chamam Cloudflare AI. **Fora de escopo** (não serão implementados nas lives): seletor de empresa e convite de membros por e-mail — a série mantém uma empresa por usuário.
