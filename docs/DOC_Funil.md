# Funil Comercial (Kanban CRM)

## Rota
Atual: `/funil` → Sugerida: `/(app)/funil/page.tsx`

## Propósito
Pipeline comercial visual no estilo Kanban. Gerencia leads do CRM arrastando-os entre colunas (etapas do funil: Triagem → Novo → Contato Iniciado → Respondeu → Reunião Marcada → Proposta Enviada → Fechado / Perdido). Cada lead pode ser inspecionado em sheet lateral com dados de contato, classificação, valor, observações e histórico de atividades. Permite criar leads manualmente e avançar etapas.

---

## Componentes utilizados

- `Card`, `CardContent` (shadcn/ui)
- `Button` (shadcn/ui)
- `Input` (shadcn/ui)
- `Badge` (shadcn/ui)
- `Label` (shadcn/ui)
- `Textarea` (shadcn/ui)
- `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle` (shadcn/ui)
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` (shadcn/ui)
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`, `DialogTrigger` (shadcn/ui)
- `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` (shadcn/ui)
- `DndContext`, `DragOverlay`, `PointerSensor`, `useSensor`, `useSensors`, `useDraggable`, `useDroppable` (@dnd-kit/core)
- `Plus`, `Phone`, `Target`, `User`, `Kanban`, `Search`, `ArrowRight`, `Mail`, `X` (lucide-react)
- `formatBRL()` (lib/format)
- `format()`, `formatDistanceToNow()` (date-fns)
- `ptBR` (date-fns/locale)
- `toast` (sonner)

---

## Componentes — Detalhamento

### `FunilPage`

**Localização:** `src/routes/_app.funil.tsx`

**Responsabilidade:** Página principal do Kanban. Gerencia estado de busca, arrasto, lead selecionado e criação de leads.

**Props:** Nenhuma.

**Estado interno (useState):**
| Estado | Tipo | Valor inicial | Descrição |
|--------|------|---------------|-----------|
| search | string | "" | Texto de busca (filtra por nome ou telefone) |
| selectedId | string \| null | null | ID do lead selecionado para o sheet |
| newOpen | boolean | false | Controla abertura do modal de novo lead |
| activeId | string \| null | null | ID do lead sendo arrastado |

**Contexto consumido (useApp):**
| Propriedade | Descrição |
|-------------|-----------|
| stages | Lista de etapas do funil (FunnelStage[]) |
| crmLeads | Lista de leads do CRM |
| setCrmLeads | Atualiza leads (drag, criação, edição) |
| activities | Histórico de atividades |
| setActivities | Registra novas atividades |
| user | Usuário atual (para createdBy) |

**Sensores DnD:**
```typescript
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
);
```

**Dados filtrados (`useMemo`):**
```typescript
const filteredLeads = crmLeads.filter(l =>
  !search.trim() || 
  l.name.toLowerCase().includes(q) || 
  (l.phone ?? "").includes(q)
);
```

**Leads agrupados por estágio (`useMemo`):**
```typescript
const leadsByStage: Record<string, CrmLead[]> = {};
stages.forEach(s => (leadsByStage[s.id] = []));
filteredLeads.forEach(l => { if (leadsByStage[l.stageId]) leadsByStage[l.stageId].push(l); });
```

**Eventos / Callbacks:**
| Evento | Ação |
|--------|------|
| Início do drag (`handleDragStart`) | Seta `activeId` |
| Fim do drag (`handleDragEnd`) | Se soltou em stage diferente: atualiza `stageId` do lead, registra `LeadActivity`, exibe toast |
| Clique "Avançar Etapa" | Move lead para próxima etapa (ordem por position), registra atividade |
| Clique "Novo Lead" | Abre modal de criação |

---

### `KanbanColumn`

**Localização:** `src/routes/_app.funil.tsx` (componente interno)

**Responsabilidade:** Coluna do Kanban que recebe leads via droppable.

**Props:**
| Prop | Tipo | Obrigatório | Descrição |
|------|------|-------------|-----------|
| id | string | ✅ | ID da stage (usado como droppable ID) |
| name | string | ✅ | Nome da etapa |
| colorHex | string | ✅ | Cor da etapa |
| kind | string | ✅ | Tipo: "normal" \| "won" \| "lost" \| "triage" |
| count | number | ✅ | Quantidade de leads na coluna |
| total | number | ✅ | Soma dos valores dos leads |
| children | React.ReactNode | ✅ | Cards de leads |

**Renderização condicional:**
- Borda verde se `kind === "won"`, vermelha se `kind === "lost"`, cinza caso contrário
- Efeito visual (`ring-2 ring-indigo-300 bg-indigo-50`) quando está recebendo drag (`isOver`)

---

### `DraggableLeadCard`

**Localização:** `src/routes/_app.funil.tsx` (componente interno)

**Responsabilidade:** Card de lead que pode ser arrastado.

**Props:**
| Prop | Tipo | Obrigatório | Descrição |
|------|------|-------------|-----------|
| lead | CrmLead | ✅ | Dados do lead |
| onClick | () => void | ✅ | Callback ao clicar no card |

**Renderização condicional:**
- Opacidade reduzida (`opacity-30`) quando está sendo arrastado (`isDragging`)

---

### `LeadCard`

**Localização:** `src/routes/_app.funil.tsx` (componente interno)

**Responsabilidade:** Card visual do lead com nome, nicho, telefone, valor e botão WhatsApp.

**Props:**
| Prop | Tipo | Obrigatório | Descrição |
|------|------|-------------|-----------|
| lead | CrmLead | ✅ | Dados do lead |

**Renderização condicional:**
- Ícone de origem: `Target` (prospecção) ou `User` (manual)
- Badge de nicho: apenas se `lead.niche` existe
- Telefone: apenas se `lead.phone` existe
- Valor: apenas se `lead.value != null`
- Botão WhatsApp: apenas se `lead.phone` existe

---

### `LeadDrawer`

**Localização:** `src/routes/_app.funil.tsx` (componente interno)

**Responsabilidade:** Sheet lateral com detalhes do lead, abas "Dados" e "Histórico".

**Props:**
| Prop | Tipo | Obrigatório | Descrição |
|------|------|-------------|-----------|
| lead | CrmLead \| null | ✅ | Lead selecionado |
| onClose | () => void | ✅ | Fecha o sheet |
| activities | LeadActivity[] | ✅ | Atividades do lead |
| onSave | (patch: Partial<CrmLead>) => void | ✅ | Salva alterações (valor, notas) |
| onAdvance | () => void | ✅ | Avança para próxima etapa |

**Estado interno (useState):**
| Estado | Tipo | Valor inicial | Descrição |
|--------|------|---------------|-----------|
| notes | string | lead?.notes ?? "" | Observações editáveis |
| value | string | lead?.value?.toString() ?? "" | Valor monetário editável |

**Efeitos:**
| Efeito | Quando roda | O que faz |
|--------|-------------|-----------|
| `useMemo` sincronizando notes/value com lead?.id | Toda vez que lead.id muda | Atualiza estado local |

**Renderização condicional:**
- Aba "Dados": formulário de contato, classificação, valor, observações
- Aba "Histórico": timeline de atividades
- Botão "Avançar Etapa": sempre visível
- Botão "WhatsApp": apenas se `lead.phone` existe

---

### `NewLeadButton`

**Localização:** `src/routes/_app.funil.tsx` (componente interno)

**Responsabilidade:** Modal de criação manual de lead no CRM.

**Props:**
| Prop | Tipo | Obrigatório | Descrição |
|------|------|-------------|-----------|
| open | boolean | ✅ | Controla abertura |
| setOpen | (b: boolean) => void | ✅ | Alterna abertura |

**Estado interno (useState):**
| Estado | Tipo | Valor inicial | Descrição |
|--------|------|---------------|-----------|
| form | { name, phone, email, niche, subniche, value, origin, notes } | Objeto vazio | Dados do formulário |

**Eventos / Callbacks:**
| Evento | Ação |
|--------|------|
| Submit | Valida nome obrigatório, cria CrmLead com `id: crm-${Date.now()}`, adiciona ao estado, registra atividade "Lead criado manualmente", fecha modal |

---

### `Section` / `Row`

**Localização:** `src/routes/_app.funil.tsx` (componentes inline)

**Responsabilidade:** Componentes auxiliares de layout para o sheet.

**`Section` props:**
| Prop | Tipo | Obrigatório | Descrição |
|------|------|-------------|-----------|
| title | string | ✅ | Título da seção |
| children | ReactNode | ✅ | Conteúdo |

**`Row` props:**
| Prop | Tipo | Obrigatório | Descrição |
|------|------|-------------|-----------|
| label | string | ✅ | Rótulo |
| children | ReactNode | ✅ | Valor |

---

## Formato de dados (Data Shape)

```typescript
interface FunnelStage {
  id: string;
  companyId: string;
  name: string;        // ex: "Triagem"
  position: number;    // ordem (0-7)
  colorHex: string;    // ex: "#94a3b8"
  kind: 'normal' | 'won' | 'lost' | 'triage';
  isActive: boolean;
}

interface CrmLead {
  id: string;
  companyId: string;
  prospectingLeadId: string | null;  // FK para ProspectingLead (se origin = prospecting)
  stageId: string;                   // FK para FunnelStage
  name: string;
  phone: string | null;
  email: string | null;
  niche: string | null;              // Nome do nicho (denormalizado)
  subniche: string | null;
  origin: 'manual' | 'prospecting';
  value: number | null;              // Valor em reais
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LeadActivity {
  id: string;
  companyId: string;
  leadId: string;
  fromStageId: string | null;
  toStageId: string | null;
  description: string;               // ex: "Lead movido de Novo para Contato Iniciado"
  createdBy: string;                 // User ID
  createdAt: string;
}
```

### Relacionamentos
- `FunnelStage` → `CrmLead` (1:N via `stageId`)
- `CrmLead` → `LeadActivity` (1:N via `leadId`)
- `ProspectingLead` → `CrmLead` (1:1 via `prospectingLeadId`, nullable)

---

## Dados mockados identificados

```typescript
// src/data/mock-funnel-stages.ts — 8 stages
const MOCK_FUNNEL_STAGES: FunnelStage[] = [
  { id: "stage-001", name: "Triagem", position: 0, colorHex: "#94a3b8", kind: "triage", ... },
  { id: "stage-002", name: "Novo", position: 1, colorHex: "#6366f1", kind: "normal", ... },
  { id: "stage-003", name: "Contato Iniciado", position: 2, colorHex: "#8b5cf6", ... },
  { id: "stage-004", name: "Respondeu", position: 3, colorHex: "#f59e0b", ... },
  { id: "stage-005", name: "Reunião Marcada", position: 4, colorHex: "#f97316", ... },
  { id: "stage-006", name: "Proposta Enviada", position: 5, colorHex: "#06b6d4", ... },
  { id: "stage-007", name: "Fechado", position: 6, colorHex: "#22c55e", kind: "won", ... },
  { id: "stage-008", name: "Perdido", position: 7, colorHex: "#ef4444", kind: "lost", ... },
];

// src/data/mock-crm-leads.ts — 6 leads
const MOCK_CRM_LEADS: CrmLead[] = [
  { id: "crm-001", name: "Sushi Hana", stageId: "stage-004", origin: "prospecting", value: 3800, ... },
  { id: "crm-002", name: "Bistrô Ilha Verde", stageId: "stage-005", origin: "prospecting", value: 5200, ... },
  { id: "crm-003", name: "Clínica Bem Estar", stageId: "stage-002", origin: "manual", value: 2400, ... },
  { id: "crm-004", name: "Studio Cabelo & Arte", stageId: "stage-006", origin: "manual", value: 1800, ... },
  { id: "crm-005", name: "Restaurante Sabor do Mar", stageId: "stage-001", origin: "prospecting", value: null, ... },
  { id: "crm-006", name: "Advocacia Torres & Lima", stageId: "stage-007", origin: "manual", value: 4500, ... },
];

// src/data/mock-crm-leads.ts — 5 atividades
const MOCK_LEAD_ACTIVITIES: LeadActivity[] = [
  { id: "act-001", leadId: "crm-001", fromStageId: "stage-003", toStageId: "stage-004", description: "...", ... },
  { id: "act-002", leadId: "crm-001", fromStageId: "stage-002", toStageId: "stage-003", ... },
  // ...
];
```

No projeto real, esses dados devem vir de **queries ao banco** via Server Components ou Server Actions.

---

## Observações para migração

1. **Must be `"use client"`**: DnD, sheets, formulários, estado — página inteiramente client-side
2. **@dnd-kit**: Totalmente compatível com Next.js/React 19 — manter
3. **Drag and Drop**: 
   - `DndContext` → funciona no client
   - `useDraggable` / `useDroppable` → idem
   - `DragOverlay` → mantido
4. **Data mutation**: Toda operação (drag, criar, editar, avançar) deve chamar Server Action Drizzle
5. **Etapas do funil**: Podem ser configuráveis no banco (já é o caso — `FunnelStage` é uma entidade)
6. **CompanyId**: Deve vir da sessão, não hardcoded como `"company-001"`
7. **Date-fns locale**: `ptBR` continua funcionando
8. **Timeline de atividades**: Ordenação decrescente por data
9. **Sheet**: `LeadDrawer` mantido como componente `"use client"` com shadcn Sheet
10. **Criação de lead**: Manual cria CrmLead vinculado a stage de triagem; prospecção converte ProspectingLead em CrmLead
11. **Busca**: O campo de busca filtra localmente — para muitos leads, implementar busca server-side
12. **Formatação de valores**: `formatBRL()` da lib/format continua igual

---

## Sugestão de schema de banco

```sql
CREATE TABLE funnel_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  position INTEGER NOT NULL,
  color_hex VARCHAR(7) NOT NULL DEFAULT '#6366f1',
  kind VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (kind IN ('normal', 'won', 'lost', 'triage')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, position)
);

CREATE TABLE crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  prospecting_lead_id UUID REFERENCES prospecting_leads(id) ON DELETE SET NULL,
  stage_id UUID NOT NULL REFERENCES funnel_stages(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(30),
  email VARCHAR(255),
  niche VARCHAR(255),
  subniche VARCHAR(255),
  origin VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'prospecting')),
  value NUMERIC(10, 2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES funnel_stages(id) ON DELETE SET NULL,
  to_stage_id UUID REFERENCES funnel_stages(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_crm_leads_company_id ON crm_leads(company_id);
CREATE INDEX idx_crm_leads_stage_id ON crm_leads(stage_id);
CREATE INDEX idx_lead_activities_lead_id ON lead_activities(lead_id);
CREATE INDEX idx_lead_activities_created_at ON lead_activities(created_at DESC);
```
