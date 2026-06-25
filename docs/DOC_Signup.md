# Signup (Cadastro)

## Rota
Atual: `/signup` → Sugerida: `/(auth)/signup/page.tsx`

## Propósito
Página pública de cadastro. Cria simultaneamente um usuário e uma empresa (workspace multi-tenant). O usuário preenche nome, email, senha e nome da empresa — o sistema mocka a criação da empresa e redireciona para o dashboard.

---

## Componentes utilizados

- `Button` (shadcn/ui)
- `Input` (shadcn/ui)
- `Label` (shadcn/ui)
- `Target`, `Building2`, `User`, `Mail`, `Lock`, `Loader2` (lucide-react)
- `Link` (TanStack Router → Next.js `next/link`)
- `toast` (sonner)

---

## Componentes — Detalhamento

### `SignupPage`

**Localização:** `src/routes/signup.tsx` (componente inline da rota)

**Responsabilidade:** Formulário de cadastro com 4 campos (empresa, nome, email, senha) + simulação de criação de workspace.

**Props:** Nenhuma (componente de página).

**Estado interno (useState):**
| Estado | Tipo | Valor inicial | Descrição |
|--------|------|---------------|-----------|
| name | string | `""` | Nome do usuário |
| email | string | `""` | Email do usuário |
| password | string | `""` | Senha do usuário |
| companyName | string | `""` | Nome da empresa |
| loading | boolean | `false` | Indica se a requisição mock está em andamento |

**Funções auxiliares:**
| Função | Descrição |
|--------|-----------|
| `slugify(s)` | Converte string para slug (lowercase, sem acentos, hífens) |

**Eventos / Callbacks:**
| Evento | Ação |
|--------|------|
| Submit do formulário | Valida campos obrigatórios, seta loading, após 700ms cria objeto `newCompany` mockado, exibe toast de sucesso, navega para `/prospeccao` |

**Renderização condicional:**
- Sidebar esquerda (gradiente): visível apenas em `lg:`
- Botão de submit: exibe `Loader2` animado + texto "Criando workspace..." quando `loading === true`
- Toast de erro se campos vazios

---

## Formato de dados (Data Shape)

### Insumos do formulário

```typescript
interface SignupFormData {
  name: string;
  email: string;
  password: string;
  companyName: string;
}
```

### Company (criada no mock)

```typescript
interface Company {
  id: string;           // Gerado: `company-${Date.now()}`
  ownerId: string;      // Gerado: `user-${Date.now()}`
  name: string;
  slug: string;         // Derivado de companyName
  createdAt: string;    // ISO string
}
```

---

## Dados mockados identificados

```typescript
// Objeto criado inline no handleSubmit:
const newCompany = {
  id: `company-${Date.now()}`,
  ownerId: `user-${Date.now()}`,
  name: companyName,
  slug: slugify(companyName),
  createdAt: new Date().toISOString(),
};
```

Nenhum dado pré-existente. Tudo é gerado no momento do cadastro.

---

## Observações para migração

1. **Autenticação real**: Substituir mock por Better Auth com:
   - Server action `signup()` criando `User` + `Company` + `CompanyMember` em transação
   - Slug único validado no banco
   - Link de verificação de email (opcional)
2. **Multi-tenancy**: Toda query futura deve ser filtrada por `companyId` extraído da sessão
3. **Navegação**: `useNavigate()` → `useRouter().push()`
4. **Componente**: `"use client"` (formulário interativo)
5. **Validação**: Adicionar validação com `react-hook-form` + `zod` (tamanho mínimo de senha, email válido, nome da empresa obrigatório)
6. **Loading**: Manter `Loader2` para feedback visual
7. **SEO**: `generateMetadata()` com título "Criar conta — ProspectCRM"
8. **Toast**: `sonner` continua funcionando com `"use client"`

---

## Sugestão de schema de banco

```sql
-- Gerenciado pelo Better Auth (tabelas user, session, account, verification)
-- Já inclui: id, name, email, emailVerified, image, createdAt, updatedAt

CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, user_id)
);
```
