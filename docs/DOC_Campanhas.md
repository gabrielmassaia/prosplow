# Campanhas (Prospecting Campaigns)

## Rota
Atual: `/prospeccao/campanhas/` → Sugerida: `/(app)/prospeccao/campanhas/page.tsx`

## Propósito
Página de listagem e criação de campanhas de prospecção georreferenciada. O usuário define um nicho, cidade, raio e keywords adicionais — a campanha simula a descoberta de leads em uma região. A lista exibe nome, nicho, segmentação (cidade/raio), total de leads encontrados, status e ações (executar, ver detalhes).

---

## Componentes utilizados

- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`, `DialogTrigger` (shadcn/ui)
- `Button` (shadcn/ui)
- `Input` (shadcn/ui)
- `Label` (shadcn/ui)
- `Badge` (shadcn/ui)
- `Card`, `CardContent` (shadcn/ui)
- `Slider` (shadcn/ui)
- `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` (shadcn/ui)
- `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` (shadcn/ui)
- `Plus`, `Send`, `Play`, `Eye`, `X`, `Loader2`, `MapPin` (lucide-react)
- `Link` (TanStack Router → Next.js `next/link`)
- `toast` (sonner)

---

## Componentes — Detalhamento

### `CampanhasListPage`

**Localização:** `src/routes/_app.prospeccao.campanhas.index.tsx`

**Responsabilidade:** Renderiza tabela de campanhas + modal de criação. Gerencia estado do formulário de nova campanha.

**Props:** Nenhuma.

**Estado interno (useState):**
| Estado | Tipo | Valor inicial | Descrição |
|--------|------|---------------|-----------|
| open | boolean | false | Controla abertura do modal de criação |
| form | ProspectingCampaign | `empty` | Dados do formulário de nova campanha |
| kwInput | string | "" | Valor do input de keywords adicionais |

**Constante `empty`:**
```typescript
const empty: ProspectingCampaign = {
  id: "",
  companyId: "company-001",
  nicheId: niches.find(n => n.isActive)?.id ?? "",
  name: "",
  city: "",
  state: "",
  country: "Brazil",
  latitude: -27.5954,   // Florianópolis
  longitude: -48.548,    // Florianópolis
  radiusKm: 5,
  maxResults: 50,
  additionalKeywords: [],
  status: "draft",
  totalFound: 0,
  lastRunAt: null,
  createdAt: new Date().toISOString(),
};
```

**Contexto consumido (useApp):**
| Propriedade | Descrição |
|-------------|-----------|
| campaigns | Lista de campanhas |
| setCampaigns | Atualiza campanhas |
| niches | Lista de nichos (para dropdown e nome do nicho) |

**Eventos / Callbacks:**
| Evento | Ação |
|--------|------|
| Clique "Nova Campanha" | Abre modal com formulário vazio |
| Submit do formulário | Valida campos obrigatórios (nome, nicho, cidade, estado), cria objeto com `id: campaign-${Date.now()}`, adiciona ao estado, fecha modal |
| Clique "Executar" | Muda status para "running", após 2s simula descoberta de 10-35 leads aleatórios e muda para "completed" |
| Clique "Ver" | Navega para `/prospeccao/campanhas/$id` |

**Renderização condicional:**
- Badge de status com classes dinâmicas (`CAMPAIGN_STATUS_CLASSES`)
- Ícone `Loader2` animado quando status é "running"
- Botão "Executar" desabilitado se status === "running"

---

### `CampanhasLayout`

**Localização:** `src/routes/_app.prospeccao.campanhas.tsx`

**Responsabilidade:** Layout wrapper para as rotas filhas de campanhas. Apenas renderiza `<Outlet />` (Next.js: `{children}`).

---

## Formato de dados (Data Shape)

```typescript
interface ProspectingCampaign {
  id: string;
  companyId: string;
  nicheId: string;
  name: string;
  city: string;
  state: string;           // UF (2 caracteres)
  country: string;         // Default: "Brazil"
  latitude: number;
  longitude: number;
  radiusKm: number;        // 1-20
  maxResults: number;      // 25, 50, ou 100
  additionalKeywords: string[];
  status: 'draft' | 'running' | 'completed' | 'failed';
  totalFound: number;
  lastRunAt: string | null;
  createdAt: string;
}
```

### Relacionamentos
- `ProspectingCampaign` → `ProspectingNiche` (N:1 via `nicheId`)
- `ProspectingCampaign` → `ProspectingLead` (1:N via `campaignId`)

---

## Dados mockados identificados

```typescript
// src/data/mock-campaigns.ts
const MOCK_CAMPAIGNS: ProspectingCampaign[] = [
  {
    id: "campaign-001",
    companyId: "company-001",
    nicheId: "niche-001",
    name: "Restaurantes - Florianópolis Centro",
    city: "Florianópolis",
    state: "SC",
    country: "Brazil",
    latitude: -27.5954,
    longitude: -48.548,
    radiusKm: 5,
    maxResults: 50,
    additionalKeywords: ["bistrô", "churrascaria", "sushi"],
    status: "completed",
    totalFound: 34,
    lastRunAt: "2024-11-15T14:30:00Z",
    createdAt: "2024-11-10T09:00:00Z",
  },
  {
    id: "campaign-002",
    // ... Restaurantes - Joinville Norte
    status: "completed", totalFound: 28,
  },
  {
    id: "campaign-003",
    // ... Clínicas - Florianópolis
    status: "draft", totalFound: 0, lastRunAt: null,
  },
];
```

No projeto real, esses dados devem vir de uma **API REST** (Server Action ou Route Handler) que consulta o banco e integra com serviço real de geolocalização (Google Places, Overpass API, etc.).

---

## Observações para migração

1. **Must be `"use client"`**: Formulário interativo, modais, estado para execução de campanha
2. **Execução de campanha mock**: A simulação de busca (setTimeout 2s) deve ser substituída por:
   - Chamada a uma API externa real (Google Places / Overpass)
   - Ou Server Action que persiste os leads no banco
3. **Formulário de criação**: Usar `react-hook-form` + `zod` para validação no lugar de validação manual
4. **Slider**: Continua funcionando no client
5. **Tags de keywords**: Mesmo padrão do `TagInput` usado em Nichos
6. **Navegação**: `<Link to="/prospeccao/campanhas/$id" params={{id}}>` → `<Link href={"/prospeccao/campanhas/"+id}>`
7. **CompanyId**: Deve vir da sessão, não hardcoded
8. **Geolocalização**: Coordenadas iniciais (lat/lng) devem ser obtidas por geocoding real do endereço

---

## Sugestão de schema de banco

```sql
CREATE TABLE prospecting_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  niche_id UUID NOT NULL REFERENCES prospecting_niches(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  city VARCHAR(255) NOT NULL,
  state VARCHAR(2) NOT NULL,
  country VARCHAR(100) NOT NULL DEFAULT 'Brazil',
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  radius_km INTEGER NOT NULL DEFAULT 5,
  max_results INTEGER NOT NULL DEFAULT 50,
  additional_keywords TEXT[] NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'completed', 'failed')),
  total_found INTEGER NOT NULL DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaigns_company_id ON prospecting_campaigns(company_id);
CREATE INDEX idx_campaigns_niche_id ON prospecting_campaigns(niche_id);
```
