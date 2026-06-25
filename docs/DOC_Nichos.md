# Nichos (Prospecting Niches)

## Rota
Atual: `/prospeccao/nichos` → Sugerida: `/(app)/prospeccao/nichos/page.tsx`

## Propósito
Página de CRUD de nichos de prospecção. Nichos representam segmentos de mercado (ex: "Restaurantes", "Clínicas") que a empresa alvo aborda. Cada nicho tem keywords, serviços-alvo, dores comuns e um template de mensagem para abordagem via WhatsApp. A página permite criar, editar, ativar/desativar e excluir nichos.

---

## Componentes utilizados

- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`, `DialogTrigger` (shadcn/ui)
- `AlertDialog`, `AlertDialogAction`, `AlertDialogCancel`, `AlertDialogContent`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogTrigger` (shadcn/ui)
- `Button` (shadcn/ui)
- `Input` (shadcn/ui)
- `Textarea` (shadcn/ui)
- `Label` (shadcn/ui)
- `Badge` (shadcn/ui)
- `Card`, `CardContent` (shadcn/ui)
- `Switch` (shadcn/ui)
- `Plus`, `Sparkles`, `Pencil`, `Trash2`, `Tag`, `X`, `Loader2`, `Power` (lucide-react)
- `toast` (sonner)

---

## Componentes — Detalhamento

### `NichosPage`

**Localização:** `src/routes/_app.prospeccao.nichos.tsx` (componente principal)

**Responsabilidade:** Renderiza grid de cards de nichos com ações de criar, editar, ativar/desativar e excluir.

**Props:** Nenhuma.

**Estado interno (useState):**
| Estado | Tipo | Valor inicial | Descrição |
|--------|------|---------------|-----------|
| modalOpen | boolean | false | Controla abertura/fechamento do modal de criação/edição |
| editing | ProspectingNiche \| null | null | Nicho sendo editado (null = modo criação) |

**Contexto consumido (useApp):**
| Propriedade | Tipo | Descrição |
|-------------|------|-----------|
| niches | ProspectingNiche[] | Lista de nichos |
| setNiches | Dispatch<SetStateAction<...>> | Atualiza nichos |
| campaigns | ProspectingCampaign[] | Usado para contar campanhas vinculadas |

**Eventos / Callbacks:**
| Evento | Ação |
|--------|------|
| Clique "Novo Nicho" | Abre modal com formulário vazio (editing = null) |
| Clique "Editar" | Abre modal com dados do nicho preenchidos |
| Clique "Ativar/Desativar" | Alterna `isActive` no estado |
| Clique "Excluir" | Abre AlertDialog de confirmação; remove do estado |
| `save(niche)` | Se existe: atualiza; senão: adiciona ao início do array |

**Renderização condicional:**
- Se `niches.length === 0`: exibe card com dashed border e botão "Criar primeiro nicho"
- Badge "Ativo" (verde) / "Inativo" (cinza) conforme `n.isActive`
- Botão "Editar" sempre visível
- Botão "Ativar/Desativar" sempre visível
- Botão "Excluir" (ícone lixeira) visível **apenas** se o nicho está inativo
- Keywords exibidas: até 3, com badge `+N` se houver mais

---

### `NicheModal`

**Localização:** `src/routes/_app.prospeccao.nichos.tsx` (componente interno)

**Responsabilidade:** Modal de criação/edição de nicho com formulário completo e geração por IA simulada.

**Props:**
| Prop | Tipo | Obrigatório | Descrição |
|------|------|-------------|-----------|
| niche | ProspectingNiche \| null | ✅ | Nicho para editar (null = criação) |
| open | boolean | ✅ | Controla visibilidade do Dialog |
| onOpenChange | (b: boolean) ⇒ void | ✅ | Callback de abertura/fechamento |
| onSave | (n: ProspectingNiche) ⇒ void | ✅ | Callback ao salvar |

**Estado interno (useState):**
| Estado | Tipo | Valor inicial | Descrição |
|--------|------|---------------|-----------|
| form | ProspectingNiche | niche ?? empty | Dados do formulário |
| generating | boolean | false | Indicador de geração IA em andamento |

**Função `empty`:**
```typescript
const empty: ProspectingNiche = {
  id: "",
  companyId: "company-001",
  name: "",
  description: "",
  keywords: [],
  targetServices: [],
  commonPains: [],
  baseMessageTemplate: "",
  isActive: true,
  createdAt: new Date().toISOString(),
};
```

**Geração IA simulada (`generateAI`):**
- Detecta keywords no nome do nicho (ex: "restaur" → preset de restaurantes)
- Preenche description, keywords, targetServices, commonPains, baseMessageTemplate
- Delay de 1500ms simulado
- 3 presets: Restaurantes, Clínicas/Saúde, Genérico

**Eventos / Callbacks:**
| Evento | Ação |
|--------|------|
| Submit | Valida nome obrigatório, chama `onSave`, fecha modal |
| Clique "Gerar com IA" | Chama `generateAI()` |
| Alteração em TagInput | Atualiza array correspondente no form |

---

### `TagInput`

**Localização:** `src/routes/_app.prospeccao.nichos.tsx` (componente interno)

**Responsabilidade:** Input de tags com suporte a Enter/Vírgula para adicionar e botão X para remover.

**Props:**
| Prop | Tipo | Obrigatório | Descrição |
|------|------|-------------|-----------|
| label | string | ✅ | Rótulo do campo |
| values | string[] | ✅ | Array de tags atual |
| onChange | (v: string[]) ⇒ void | ✅ | Callback quando tags mudam |
| placeholder | string | ❌ | Placeholder do input |

**Estado interno (useState):**
| Estado | Tipo | Valor inicial | Descrição |
|--------|------|---------------|-----------|
| input | string | "" | Valor atual do campo de texto |

**Eventos / Callbacks:**
| Evento | Ação |
|--------|------|
| Enter ou Vírgula no input | Adiciona tag se não vazia e não duplicada |
| OnBlur | Adiciona tag |
| Clique X na badge | Remove a tag |

---

## Formato de dados (Data Shape)

```typescript
interface ProspectingNiche {
  id: string;
  companyId: string;
  name: string;
  description: string;
  keywords: string[];
  targetServices: string[];
  commonPains: string[];
  baseMessageTemplate: string;    // Template com {nome} e {cidade}
  isActive: boolean;
  createdAt: string;              // ISO 8601
}
```

### Relacionamentos
- `ProspectingNiche` → `ProspectingCampaign` (1:N via `nicheId`)
- `ProspectingNiche` → `ProspectingLead` (1:N via `nicheId`)

---

## Dados mockados identificados

```typescript
// src/data/mock-niches.ts
const MOCK_NICHES: ProspectingNiche[] = [
  {
    id: "niche-001",
    companyId: "company-001",
    name: "Restaurantes",
    description: "Estabelecimentos de alimentação que precisam de presença digital...",
    keywords: ["restaurante", "pizzaria", "hamburgueria", "cafeteria", "lanchonete"],
    targetServices: ["Site profissional", "Cardápio digital", "Google Meu Negócio", "Redes sociais"],
    commonPains: ["Baixa presença digital", "Poucos pedidos online", "Cardápio desatualizado", "Sem avaliações no Google"],
    baseMessageTemplate: "Olá, {nome}! Vi que vocês estão em {cidade}...",
    isActive: true,
    createdAt: "2024-10-02T09:00:00Z",
  },
  {
    id: "niche-002",
    companyId: "company-001",
    name: "Clínicas e Consultórios",
    // ...similar
    isActive: true,
  },
  {
    id: "niche-003",
    companyId: "company-001",
    name: "Salões de Beleza",
    // ...similar
    isActive: false,
  },
];
```

No projeto real, esses dados devem vir de uma **API REST** ou **Server Component** com consulta Drizzle a `prospecting_niches`.

---

## Observações para migração

1. **Must be `"use client"`**: Todo o CRUD é interativo com modais, formulários, estado
2. **Geração IA mock**: Substituir `setTimeout(1500)` por chamada real a uma API de IA (ex: OpenAI, Anthropic)
3. **Modal editing**: O `key={editing?.id ?? "new"}` no DialogTrigger força remontagem — no Next.js manter a mesma lógica
4. **Data mutation**: Usar Server Actions com Drizzle para persistir nichos
5. **CompanyId**: Deve vir da sessão do Better Auth, não hardcoded como `"company-001"`
6. **Validacao Zod**: Adicionar schema de validação com zod para o formulário
7. **SEO**: `generateMetadata()` com título "Nichos — ProspectCRM"

---

## Sugestão de schema de banco

```sql
CREATE TABLE prospecting_niches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  keywords TEXT[] NOT NULL DEFAULT '{}',
  target_services TEXT[] NOT NULL DEFAULT '{}',
  common_pains TEXT[] NOT NULL DEFAULT '{}',
  base_message_template TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prospecting_niches_company_id ON prospecting_niches(company_id);
```
