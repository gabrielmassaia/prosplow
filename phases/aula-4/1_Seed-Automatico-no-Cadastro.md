# Aula 4 — 1. Seed Automático na Criação da Empresa

> Parte de `aula-4`. Pré-requisito: `0_Conceitos-e-Mapa-de-Arquivos.md`. Próximo arquivo: `2_Metadata-Error-e-NotFound.md`.

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

