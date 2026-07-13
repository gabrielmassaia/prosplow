# Aula 3 — 5. Verificação, Armadilhas e Próximos Passos

> Parte de `aula-3`. Pré-requisito: `4_Integracao-com-Prospeccao.md`. Fecha a Aula 3 — próxima pasta: `aula-4/`.

## Task 12: Verificação final

- [x] `npx drizzle-kit push` — tabelas e enums criados sem prompt destrutivo.
- [x] `npm run build` — compila sem erros de TypeScript, sem `any`.
- [x] `npx eslint` nos arquivos novos/modificados da Fase 3 — zero erros/warnings.
- [x] Smoke test: `/funil` sem sessão redireciona para `/login` (guard de tenant funcionando).
- [x] **Verificado com uso manual real** (empresa "Teste321"): seed rodou uma única vez (8 linhas, posições 0–7, sem duplicar); conversão de um lead de prospecção ("Marriagge") criou o `CrmLead` corretamente na etapa "Novo" com `origin: "prospecting"` e registrou a atividade "Lead convertido da prospecção"; arrastar o card entre colunas (Novo → Contato Iniciado → Respondeu) atualizou o `stageId` e registrou `LeadActivity` com a descrição correta a cada movimento, confirmado via query direta no Neon.

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
A Fase 4 do SPEC menciona seed automático no primeiro login — isso pressupõe um hook de autenticação que ainda não existe. O seed lazy dentro do bootstrap do funil resolve o problema imediato (empresas sem etapas) sem acoplar a Fase 3 a uma peça de infraestrutura da Fase 4.

---

## Próximos passos — Fase 4

Conforme o SPEC: seletor de empresa multi-tenant, `SeedFunnelStages` disparado automaticamente no primeiro login (substituindo/complementando o seed lazy desta fase), `generateMetadata()` em todas as páginas, `error.tsx`/`not-found.tsx` globais, validação real de sessão no middleware, rate limiting nas Server Actions que chamam Cloudflare AI, e convite de membros por e-mail.
