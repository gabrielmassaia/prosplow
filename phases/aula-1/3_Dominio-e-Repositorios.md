# Aula 1 — 3. Domínio e Repositórios

> Parte de `aula-1`. Pré-requisito: `2_Banco-de-Dados.md`. Próximo arquivo: `4_Autenticacao-Better-Auth.md`.

---

### Passo 8 — Interfaces de domínio

Crie as pastas:
```bash
mkdir -p src/domain/repositories
mkdir -p src/infrastructure/repositories
mkdir -p src/use-cases/auth
mkdir -p src/app/actions/auth
mkdir -p src/app/api/auth/'[...all]'
mkdir -p src/app/\(auth\)/login
mkdir -p src/app/\(auth\)/register
mkdir -p src/app/\(protected\)/prospeccao
mkdir -p src/lib
```

Crie `src/domain/repositories/IUserRepository.ts`:

```typescript
export interface IUserRepository {
  findById(id: string): Promise<{ id: string; name: string; email: string } | null>;
}
```

Crie `src/domain/repositories/ICompanyRepository.ts`:

```typescript
export interface ICompanyRepository {
  create(data: {
    name: string;
    slug: string;
    ownerId: string;
  }): Promise<{ id: string; name: string; slug: string }>;

  findByUserId(userId: string): Promise<{ id: string; name: string; slug: string } | null>;
}
```

**Por que interfaces simples aqui?** Na Fase 1 só precisamos criar e buscar empresa. Não vale a pena criar uma interface com 10 métodos que ainda não existem. YAGNI — You Ain't Gonna Need It. A interface cresce conforme os use cases precisam.

---

### Passo 9 — Implementação dos repositórios (empresa e usuário)

Crie `src/infrastructure/repositories/DrizzleCompanyRepository.ts`:

```typescript
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { companiesTable, companyMembersTable } from "@/infrastructure/db/schema";
import type { ICompanyRepository } from "@/domain/repositories/ICompanyRepository";
import type * as schema from "@/infrastructure/db/schema";

type DB = NodePgDatabase<typeof schema>;

export class DrizzleCompanyRepository implements ICompanyRepository {
  constructor(private db: DB) {}

  async create(data: { name: string; slug: string; ownerId: string }) {
    return await this.db.transaction(async (tx) => {
      const [company] = await tx
        .insert(companiesTable)
        .values({ name: data.name, slug: data.slug, ownerId: data.ownerId })
        .returning({ id: companiesTable.id, name: companiesTable.name, slug: companiesTable.slug });

      await tx.insert(companyMembersTable).values({
        companyId: company.id,
        userId: data.ownerId,
        role: "owner",
      });

      return company;
    });
  }

  async findByUserId(userId: string) {
    const result = await this.db
      .select({
        id: companiesTable.id,
        name: companiesTable.name,
        slug: companiesTable.slug,
      })
      .from(companyMembersTable)
      .innerJoin(companiesTable, eq(companyMembersTable.companyId, companiesTable.id))
      .where(eq(companyMembersTable.userId, userId))
      .limit(1);

    return result[0] ?? null;
  }
}
```

**Pontos importantes:**
- `implements ICompanyRepository` → TypeScript garante que todos os métodos da interface estão implementados
- `private db: DB` → injeção de dependência. O `db` vem de fora, não é importado aqui. `DB` é declarado localmente como `NodePgDatabase<typeof schema>` em vez de vir de um tipo compartilhado — cada repositório define seu próprio alias (mesmo padrão repetido nos repositórios da Fase 2).
- `.returning({ id, name, slug })` → o Drizzle retorna só os campos que pedimos, já tipados
- `result[0] ?? null` → `findFirst` no Drizzle com `.select()` retorna um array; pegamos o primeiro ou null

Crie também `src/infrastructure/repositories/DrizzleUserRepository.ts` — a implementação de `IUserRepository` (Passo 8). Ela ainda não é chamada por nenhum use case desta fase, mas faz parte dos entregáveis obrigatórios da estrutura de pastas (ver `AGENTS.md`) porque a Fase 4 vai precisar de `findById` para o convite de membros por email:

```typescript
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { usersTable } from "@/infrastructure/db/schema";
import type { IUserRepository } from "@/domain/repositories/IUserRepository";
import type * as schema from "@/infrastructure/db/schema";

type DB = NodePgDatabase<typeof schema>;

export class DrizzleUserRepository implements IUserRepository {
  constructor(private db: DB) {}

  async findById(id: string) {
    const result = await this.db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);

    return result[0] ?? null;
  }
}
```

**Por que criar um repositório que ninguém usa ainda?** É a mesma exceção ao YAGNI que abrimos para `IUserRepository` no Passo 8: a interface e a implementação concreta já nascem junto com o resto da camada de infraestrutura porque o contrato (`findById`) é trivial e estável — não vai mudar quando o use case de convite de membros (Fase 4) precisar dele. Diferente de deixar métodos especulativos numa interface grande, aqui é uma implementação completa de um contrato já fechado.
