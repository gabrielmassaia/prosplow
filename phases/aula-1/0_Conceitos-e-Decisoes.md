# Aula 1 — Setup Base

> **Para a live:** Este é o índice de leitura da Aula 1. Leia este arquivo por inteiro antes de abrir o editor — ele explica os conceitos e decisões que os arquivos numerados (`1_...` a `9_...`) vão aplicar na prática.
> Tempo estimado da aula inteira: 2–3 horas ao vivo.
> Ao final: login, cadastro e proteção de rotas funcionando com banco real.

---

## Roteiro desta pasta

| Arquivo | O que constrói |
|---|---|
| `1_Setup-Projeto-e-Dependencias.md` | Criação do projeto Next.js, dependências, shadcn/ui, variáveis de ambiente, Drizzle Kit |
| `2_Banco-de-Dados.md` | Pool de conexão + schema da Fase 1 |
| `3_Dominio-e-Repositorios.md` | Interfaces (`IUserRepository`, `ICompanyRepository`) + implementações Drizzle |
| `4_Autenticacao-Better-Auth.md` | Use case `CreateUserWithCompany`, configuração do Better Auth, helpers de tenant, route handler |
| `5_Actions-Login-e-Cadastro.md` | Server Actions `signup` e `login` |
| `6_Proxy-Protecao-de-Rotas.md` | `src/proxy.ts` |
| `7_UI-Paginas-Auth.md` | Root layout, layout de auth, páginas e formulários de login/cadastro |
| `8_Layout-Protegido-e-Sidebar.md` | Layout protegido, sidebar (shadcn), página inicial |
| `9_Verificacao-e-Armadilhas.md` | Aplicar schema no banco, testar, checklist de verificação, armadilhas comuns, próximos passos |

---

## O que foi construído nesta fase

| Arquivo | Propósito |
|---|---|
| `drizzle.config.ts` | Configura o Drizzle Kit (onde está o schema, qual banco, onde gerar migrations) |
| `.env.example` | Template das variáveis de ambiente necessárias |
| `src/infrastructure/db/index.ts` | Pool de conexão PostgreSQL singleton + instância Drizzle tipada |
| `src/infrastructure/db/schema.ts` | Todas as tabelas da Fase 1 (4 do Better Auth + companies + company_members) |
| `src/domain/repositories/IUserRepository.ts` | Contrato de repositório de usuário |
| `src/domain/repositories/ICompanyRepository.ts` | Contrato de repositório de empresa |
| `src/infrastructure/repositories/DrizzleCompanyRepository.ts` | Implementação concreta com Drizzle |
| `src/infrastructure/repositories/DrizzleUserRepository.ts` | Implementação concreta com Drizzle (ainda sem consumidor nesta fase — usado na Fase 4) |
| `src/use-cases/auth/CreateUserWithCompany.ts` | Lógica de negócio: criar usuário + empresa em transação |
| `src/lib/auth.ts` | Instância central do Better Auth (servidor) |
| `src/lib/auth-client.ts` | Cliente React do Better Auth (browser) |
| `src/lib/tenant.ts` | `requireUser()` e `requireCompany()` para proteger Server Components e actions |
| `src/app/api/auth/[...all]/route.ts` | Handler universal de autenticação |
| `src/app/actions/auth/signup.ts` | Server Action de cadastro (controller) |
| `src/app/(auth)/layout.tsx` | Layout público centralizado |
| `src/app/(auth)/login/page.tsx` | Página de login |
| `src/app/(auth)/register/page.tsx` | Página de cadastro |
| `src/app/(protected)/layout.tsx` | Layout protegido: `SidebarProvider` + `AppSidebar` + `SidebarInset` |
| `src/app/(protected)/prospeccao/page.tsx` | Página inicial protegida: header + empty-state (Fase 2 substitui pelo dashboard real) |
| `src/components/layout/Sidebar.tsx` | `AppSidebar` — construída sobre o bloco `sidebar` do shadcn/ui |
| `src/components/ui/sidebar.tsx` | Bloco `sidebar` do shadcn/ui (`npx shadcn add sidebar`) |
| `src/hooks/use-mobile.ts` | Hook usado pelo `sidebar` para detectar viewport mobile |
| `src/app/layout.tsx` | Root layout do Next.js |
| `src/proxy.ts` | Proteção de rotas — redireciona não-autenticados para `/login` |

---

## Conceitos que você precisa entender antes de codar

### 1. O que é Drizzle ORM e por que não usamos Prisma

**Drizzle** é um ORM TypeScript que representa o schema do banco como código TypeScript — não como um arquivo `.prisma` separado. Isso significa que os tipos das suas queries são inferidos diretamente das definições de tabela, sem geração de código intermediário.

```typescript
// Drizzle: você define assim
export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
});

// E usa assim — totalmente tipado, sem geração de código
const user = await db.query.usersTable.findFirst({
  where: eq(usersTable.email, "joao@email.com"),
});
// user é inferido como { id: string, name: string, email: string } | undefined
```

Por que não Prisma? O Prisma gera um cliente em `node_modules/.prisma/client` — isso cria problemas no Edge Runtime do Next.js e requer um passo extra de geração. O Drizzle funciona direto, sem geração, e tem suporte nativo ao `pg` pool que precisamos para o Neon.

---

### 2. Por que usamos Pool de conexão e não conexão direta

O Neon é um PostgreSQL serverless. Cada requisição ao Next.js pode criar uma nova função serverless. Se cada função abrisse uma conexão nova ao banco e não a encerrasse, em poucos segundos teríamos centenas de conexões abertas — o banco recusa novas conexões e a aplicação cai.

O **Pool** mantém um conjunto fixo de conexões abertas (no nosso caso, `max: 5`) e as reutiliza entre requisições. Quando uma requisição termina, a conexão volta pro pool, não é fechada.

```typescript
// SEM pool (errado para serverless)
const client = new Client({ connectionString }); // nova conexão a cada request
await client.connect();
// ...query...
await client.end(); // fecha — mas e se der erro antes?

// COM pool (correto)
const pool = new Pool({ connectionString, max: 5 });
// O pool gerencia abertura, reuso e encerramento automaticamente
```

O truque do `globalThis.__drizzlePool` evita que o pool seja recriado a cada hot-reload durante o desenvolvimento. Sem isso, ao salvar um arquivo você criaria um pool novo sem encerrar o anterior.

---

### 3. O que é Better Auth e como funciona o fluxo

**Better Auth** é uma biblioteca de autenticação que funciona 100% no servidor. Ela gerencia:
- Criação e validação de usuários (email + senha com bcrypt)
- Sessões com tokens seguros em cookies HTTP-only
- Rotas de API para todas as operações de auth

O fluxo completo de login:

```
Usuário → POST /api/auth/sign-in/email
         ↓
[...all]/route.ts recebe → toNextJsHandler(auth) despacha
         ↓
Better Auth valida email + senha no banco
         ↓
Cria registro em `sessions` + seta cookie `better-auth-session`
         ↓
Responde 200 com dados da sessão
         ↓
authClient.signIn.email() no browser recebe e redireciona
```

O cookie é HTTP-only — JavaScript do browser não consegue lê-lo. Isso previne XSS roubar a sessão.

---

### 4. Grupos de rotas no Next.js App Router: `(auth)` e `(protected)`

Parênteses no nome de uma pasta criam um **grupo de rotas** — a pasta existe na estrutura de arquivos mas não aparece na URL.

```
app/
├── (auth)/
│   ├── login/page.tsx     → URL: /login
│   └── register/page.tsx  → URL: /register
└── (protected)/
    └── prospeccao/page.tsx → URL: /prospeccao
```

Por que usamos isso? Para ter **layouts diferentes** sem afetar as URLs:
- `(auth)/layout.tsx` → tela centralizada, sem sidebar, sem autenticação
- `(protected)/layout.tsx` → com sidebar, verifica sessão

Se não usássemos grupos, teríamos que colocar tudo no mesmo layout e fazer lógica condicional feia.

---

### 5. O que é Clean Architecture e como aplicamos aqui

Clean Architecture é uma forma de organizar o código onde as **regras de negócio não dependem de frameworks**. Na prática:

**Camada de Domínio** (`src/domain/`) — define *contratos* (interfaces TypeScript). Não sabe que Drizzle existe.
```typescript
// ICompanyRepository.ts — só uma interface
export interface ICompanyRepository {
  create(data: { name: string; slug: string; ownerId: string }): Promise<Company>;
  findByUserId(userId: string): Promise<Company | null>;
}
```

**Camada de Infraestrutura** (`src/infrastructure/`) — implementa os contratos com ferramentas reais.
```typescript
// DrizzleCompanyRepository.ts — usa Drizzle, implementa a interface
export class DrizzleCompanyRepository implements ICompanyRepository {
  constructor(private db: DrizzleDB) {}

  async create(data) {
    return await this.db.transaction(async (tx) => { /* ... */ });
  }
}
```

**Use Cases** (`src/use-cases/`) — lógica de negócio. Recebe interfaces, não sabe que Drizzle existe.
```typescript
export class CreateUserWithCompany {
  constructor(private companyRepo: ICompanyRepository) {} // ← interface, não Drizzle

  async execute(input: Input) { /* orquestra a lógica */ }
}
```

**Controllers** (`src/app/actions/`) — único lugar que "conecta" as camadas. Instancia o concreto, passa para o use case.
```typescript
export async function signupAction(data) {
  "use server";
  const companyRepo = new DrizzleCompanyRepository(db); // ← escolha do concreto
  const useCase = new CreateUserWithCompany(companyRepo); // ← injeta a interface
  return useCase.execute(data);
}
```

**Por que isso importa na prática:** se amanhã trocarmos Neon por PlanetScale, só `DrizzleCompanyRepository` muda. O use case, a action e os componentes React continuam idênticos.

---

### 6. Server Actions vs Route Handlers no Next.js 16

**Server Actions** são funções com `"use server"` que rodam no servidor e podem ser chamadas diretamente de componentes React ou formulários.

```typescript
// app/actions/auth/signup.ts
"use server";
export async function signupAction(data: SignupInput) {
  // roda no servidor, pode acessar banco, variáveis de ambiente, etc.
}

// app/(auth)/register/page.tsx (client component)
"use client";
import { signupAction } from "@/app/actions/auth/signup";

const result = await signupAction({ name, email, password, companyName });
```

**Route Handlers** são arquivos `route.ts` que criam endpoints HTTP convencionais (GET, POST, etc.).

Usamos Server Actions para operações de negócio (criar empresa, mover lead) e Route Handlers só para o Better Auth (`[...all]/route.ts`) porque a biblioteca precisa de endpoints HTTP reais.

---

### 7. O que é Multi-tenancy e como implementamos

Multi-tenancy significa que um único sistema atende múltiplos clientes (tenants) isolados. No ProspFlow, cada **empresa** é um tenant.

O risco: sem isolamento, um usuário da empresa A poderia ver dados da empresa B.

Nossa solução: toda query ao banco inclui `WHERE company_id = ?` com o ID da empresa ativa na sessão.

```typescript
// SEGURO — filtra pelo tenant
const niches = await db
  .select()
  .from(prospectingNichesTable)
  .where(eq(prospectingNichesTable.companyId, companyId)); // ← sempre presente

// INSEGURO — vaza dados entre tenants
const niches = await db.select().from(prospectingNichesTable); // ❌
```

O `requireCompany(userId)` em `tenant.ts` extrai o `companyId` da sessão e do banco. Toda action começa com isso.

---

## Decisões técnicas e justificativas

### Por que `id` do usuário é `text` e não `uuid`?

**Decisão:** O Better Auth usa `text` como tipo de PK para a tabela `users`.

**Motivo:** O Better Auth gera IDs próprios no formato de strings (não UUIDs padrão PostgreSQL). Ele precisa controlar o formato do ID para garantir unicidade entre providers OAuth (Google, GitHub) e email/senha. Se forçarmos `uuid`, o adaptador quebra na inserção.

**Impacto:** As tabelas de negócio que referenciam `users.id` (como `company_members.user_id`) também precisam usar `text`, não `uuid`.

```typescript
// CORRETO
userId: text("user_id").notNull().references(() => usersTable.id)

// ERRADO — vai quebrar na FK
userId: uuid("user_id").notNull().references(() => usersTable.id)
```

---

### Por que usamos `db.transaction()` na criação de empresa?

**Cenário sem transação:**
1. Criamos a empresa ✅
2. Tentamos criar o `company_member` — falha por constraint ❌
3. Empresa existe no banco sem dono. Dado corrompido.

**Com transação:**
1. Abrimos transação
2. Criamos empresa
3. Criamos company_member
4. Se qualquer passo falhar → tudo é revertido (rollback automático)
5. Banco sempre consistente

```typescript
await db.transaction(async (tx) => {
  const [company] = await tx.insert(companiesTable).values({ name, slug, ownerId }).returning();
  await tx.insert(companyMembersTable).values({ companyId: company.id, userId: ownerId, role: "owner" });
  return company;
});
```

---

### Por que o repositório recebe `db` no construtor?

**Alternativa descartada:** importar `db` globalmente dentro do repositório.
```typescript
// ERRADO
import { db } from "@/infrastructure/db"; // acoplamento direto
export class DrizzleCompanyRepository {
  async create(data) { return db.insert(...) } // db hardcoded
}
```

**Por que é ruim:** não dá para trocar o `db` em testes unitários. O repositório está acoplado à implementação concreta do banco.

**Nossa abordagem:**
```typescript
// CORRETO
export class DrizzleCompanyRepository implements ICompanyRepository {
  constructor(private db: DrizzleDB) {} // recebe de fora

  async create(data) { return this.db.insert(...) }
}

// Na action, quem escolhe qual `db` usar:
const repo = new DrizzleCompanyRepository(db);
```

Em testes, você passa um `db` mockado. Em produção, passa o `db` real. O repositório não sabe a diferença.
