# Aula 2 — 6. Verificação, Armadilhas e Próximos Passos

> Parte de `aula-2`. Pré-requisito: `5_Dashboard-e-Layout.md`. Fecha a Aula 2 — próxima pasta: `aula-3/`.

## Task 18: Verificação final

- [ ] **Step 1: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "docs/ui_loveble"
```

Resultado esperado: zero erros em `src/`.

- [ ] **Step 2: Testar fluxo completo**

| Ação | Resultado esperado |
|---|---|
| Acessar `/prospeccao` | Dashboard com cards de métricas (zeros se sem dados) |
| Acessar `/prospeccao/nichos` | Lista vazia com botão "Criar primeiro nicho" |
| Criar nicho | Card aparece na grid |
| Clicar "Gerar com IA" no modal | Campos preenchidos com preset |
| Acessar `/prospeccao/campanhas` | Lista vazia |
| Criar campanha com nicho ativo | Linha aparece na tabela com status "Rascunho" |
| Clicar "Executar" na campanha | Status muda para "Executando" → "Concluída" com N leads |
| Acessar detalhe da campanha | Mapa com CircleMarkers coloridos por score |
| Acessar `/prospeccao/leads` | Tabela com leads encontrados |
| Filtrar por campanha/status/score | Tabela atualiza em tempo real |
| Clicar em lead | Sheet abre com dados detalhados |
| Clicar "Gerar" diagnóstico | aiOverview e suggestedOffer aparecem |
| Clicar "Gerar" mensagem | Textarea preenchida com mensagem personalizada |
| Clicar "Abrir WhatsApp" | Abre `wa.me/` em nova aba com a mensagem |

---

## Armadilhas desta fase

### Leaflet e SSR + Turbopack (duas armadilhas distintas)
**Armadilha 1 — SSR:** O Leaflet usa `window` e `document`. Nunca importe diretamente em Server Components. Sempre use `dynamic(() => import(...), { ssr: false })` na página que importa os componentes de mapa.

**Armadilha 2 — Turbopack CSS:** `require("leaflet/dist/leaflet.css")` dentro de `useEffect` **falha com Turbopack** (Next.js 16 dev mode) com o erro "module factory is not available". O Turbopack não suporta `require()` de CSS em runtime. A solução é importar o CSS no **topo do arquivo** como import estático:

```typescript
// ERRADO — falha com Turbopack
useEffect(() => {
  const L = require("leaflet");
  require("leaflet/dist/leaflet.css"); // ← erro: module factory not available
}, []);

// CORRETO — import estático no topo do arquivo
import "leaflet/dist/leaflet.css"; // ← Turbopack processa corretamente
// ...
useEffect(() => {
  const L = require("leaflet"); // só o JS precisa de require dinâmico
}, []);
```

O motivo de ainda usar `require("leaflet")` em vez de `import L from "leaflet"` é que o `MapContainer` do Leaflet referencia `window` no module level — o import estático quebraria o SSR mesmo com `dynamic({ ssr: false })`. O CSS não tem esse problema.

### Overpass API — keywords PT ≠ amenity OSM (armadilha crítica)
A tag `amenity` no OpenStreetMap usa **inglês**: `restaurant`, `fast_food`, `cafe`, `bar`. Buscar `amenity~"restaurante"` retorna sempre 0 resultados porque nenhum dado OSM usa português nos valores de amenity.

**Solução implementada — IA gera as tags OSM dinamicamente:**
O use case `RunCampaign` chama `IAIService.complete()` com o nome/descrição do nicho em português e recebe de volta um JSON com os valores corretos para cada categoria OSM (`amenity`, `shop`, `craft`, `tourism`, `office`, `leisure`). O `OverpassGeoService` usa essas tags como query primária. Fallback por nome (`name~"keyword",i`) só ativa se a IA falhar.

```typescript
// RunCampaign — geração de tags OSM via IA
const raw = await this.aiService.complete(OSM_TAG_SYSTEM_PROMPT, `Niche: ${niche.name}`);
const match = raw.match(/\{[\s\S]*\}/);
if (match) {
  const parsed = JSON.parse(match[0]) as OsmTags;
  // osmTags = { amenity: ["restaurant","fast_food"], shop: [], ... }
  if (Object.values(parsed).some((v) => Array.isArray(v) && v.length > 0))
    osmTags = parsed;
}
```

Vantagem sobre dicionário estático: funciona para qualquer nicho sem manutenção manual. Desvantagem: adiciona ~1–2s de latência da IA antes de chamar o Overpass.

### Overpass API — HTTP 406 em server-side fetch (Node.js)
O Apache que faz proxy para a Overpass API retorna **406 Not Acceptable** quando o header `Accept` está ausente ou inválido. O browser envia `Accept: */*` por padrão, mas o Node.js fetch (usado em Server Actions) **não envia esse header**. Resultado: 406 em produção, funciona no browser.

**Solução:** sempre incluir explicitamente no fetch:
```typescript
headers: {
  "Content-Type": "application/x-www-form-urlencoded",
  "Accept": "application/json, text/plain, */*",
  "User-Agent": "ProspFlow/1.0 (prospflow@aivonlabs.com)",
}
```

### Overpass API — `around:` vs bounding box
A implementação usa `around:raioEmMetros,lat,lon` (círculo exato) em vez de bounding box (retângulo). A suposição inicial de que bbox seria mais rápido por usar índice espacial provou-se errada na prática — bbox retornou 0 resultados em testes enquanto `around:` retornou leads corretamente.

```typescript
// CORRETO — círculo centrado no ponto
const radiusMeters = radiusKm * 1000;
const around = `around:${radiusMeters},${lat},${lon}`;
lines.push(`  node["amenity"~"${amenity}"](${around});`);
```

### Overpass API — mirrors e cobertura do Brasil
`overpass-api.de` é o servidor primário com cobertura global completa. `kumi.systems` foi adicionado como **fallback secundário** — testado e funcional para dados do Brasil, mas com capacidade menor. `openstreetmap.ru` não é usado (sem dados do Brasil).

```typescript
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",       // primário — cobertura total
  "https://overpass.kumi.systems/api/interpreter",  // fallback — funcional para BR
];
```

A estratégia de fallback tenta o próximo endpoint apenas em caso de erro de rede ou HTTP 5xx/504 — nunca em caso de 429 (rate limit por IP, afeta todos os endpoints igualmente).

### Overpass API — timeout e performance da query

**`[timeout:30]` + `out tags center qt 200`** é a combinação ideal:

- `timeout:30` — o servidor Overpass aborta após 30s (menos que o default de 60s, reduz carga)
- `out tags` — retorna apenas as tags, sem coordenadas dos nós-membro de ways (muito mais leve que `out body`)
- `center` — calcula e retorna o centro geométrico de ways (necessário para plotar no mapa)
- `qt` — sem ordenação de resultado (mais rápido que o default que ordena por id)
- `200` — limite máximo retornado pelo Overpass; `maxResults` real é aplicado no código após filtrar `el.tags?.name`

```typescript
// CORRETO — leve e rápido
lines.push(");", "out tags center qt 200;");

// NÃO USAR — body retorna coordenadas de todos os nós-membro, muito pesado para ways complexos
lines.push(");", "out body center;");
```

O `AbortController` no cliente usa 35s (ligeiramente maior que o timeout da query) para garantir que a Overpass responda o erro de timeout antes de o cliente abortar — evita que a request fique presa indefinidamente.

### `after()` — execução em background de Server Actions
A busca Overpass + IA pode levar 5–30s. Usar `await` na action travaria a request do Next.js e causaria timeout em Vercel Serverless (limite de 10s). A solução é `after()` do `next/server`:

```typescript
// PADRÃO: action retorna imediatamente, trabalho pesado roda em background
after(async () => {
  // Este bloco executa APÓS a response ser enviada ao cliente
  await useCase.execute({ campaignId, companyId });
});
return { ok: true, queued: true }; // cliente recebe isso em ~200ms
```

**Consequências de design:**
1. A action nunca retorna `totalFound` — o valor só existe quando o background termina
2. O cliente precisa de polling para detectar a conclusão (setInterval a cada 3s)
3. O status "running" deve ser setado na DB *antes* do `after()` — senão o cliente não sabe que começou
4. As dependências (repos, services) precisam ser reinstanciadas *dentro* do `after()` — o escopo da request já fechou quando o callback executa

### Select component mostrando UUID em vez do nome do nicho
O componente `@base-ui/react/select` (shadcn) **não** resolve automaticamente o texto do item selecionado a partir do `value` prop — comportamento diferente do Radix UI clássico. Sem `children` explícitos em `SelectValue`, exibe o UUID cru.

```tsx
// ERRADO — exibe o UUID do nicho
<SelectValue placeholder="Selecione um nicho" />

// CORRETO — passa o texto como children explícito
<SelectValue placeholder="Selecione um nicho">
  {activeNiches.find((n) => n.id === form.nicheId)?.name}
</SelectValue>
```

### Coluna CEP na tabela de campanhas
O formulário de campanha usa CEP para geocodificação (ViaCEP + Nominatim), mas o CEP deve ser persistido para exibição posterior nos detalhes da campanha. Adicionado `cep varchar(8)` nullable em `prospectingCampaignsTable`. O `drizzle-kit push` aplica a coluna sem downtime (ADD COLUMN nullable).

### Arrays PostgreSQL com Drizzle
O Drizzle usa `sql\`'{}'\`` como default para arrays PostgreSQL. Sem isso, o banco retorna erro de tipo.

### doublePrecision vs real
`doublePrecision` (8 bytes) para lat/lng — precisão necessária para coordenadas geográficas. `real` (4 bytes) apenas para rating onde decimais grossos bastam.

### Campos de lat/lon no formulário de campanha → usar CEP
Expor latitude e longitude como campos numéricos editáveis é inutilizável na prática. A solução implementada usa **ViaCEP + Nominatim** para geocodificação automática:

1. Usuário digita o CEP → `onBlur` dispara `handleCepBlur`
2. Chamada à ViaCEP (`https://viacep.com.br/ws/{cep}/json/`) retorna cidade, estado e logradouro
3. Chamada ao Nominatim (`https://nominatim.openstreetmap.org/search`) converte o endereço em lat/lon
4. Campos `city`, `state`, `latitude`, `longitude` do formulário são preenchidos automaticamente
5. Cidade e estado ficam editáveis (correção manual possível); lat/lon são exibidos só como confirmação

**Atenção:** Nominatim tem rate limit de 1 req/s por IP. Em produção com muitos usuários, considere cache ou proxy. Para testes locais não há problema.

**Atenção 2:** `onBlur` no campo de CEP era pouco confiável (não disparava ao pressionar Enter ou navegar com Tab). A solução definitiva foi um botão "Buscar" explícito — mais previsível para o usuário e sem dependência de eventos de foco.

```typescript
// fetchCep — cliente (campanhas/page.tsx)
// Disparado pelo botão "Buscar" (não onBlur — onBlur é pouco confiável)
async function fetchCep(digits: string) {
  setCepLoading(true);
  setCepError("");
  try {
    const viacepData = await fetch(`https://viacep.com.br/ws/${digits}/json/`).then(r => r.json());
    if (viacepData.erro) { setCepError("CEP não encontrado"); return; }
    const city: string = viacepData.localidade;
    const state: string = viacepData.uf;
    const query = encodeURIComponent(`${viacepData.logradouro || city}, ${city}, ${state}, Brazil`);
    const nominatimData = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
      { headers: { "Accept-Language": "pt-BR" } }
    ).then(r => r.json());
    const lat = nominatimData[0] ? parseFloat(nominatimData[0].lat) : 0;
    const lon = nominatimData[0] ? parseFloat(nominatimData[0].lon) : 0;
    setForm((f) => ({ ...f, city, state, latitude: lat, longitude: lon }));
  } catch {
    setCepError("Erro ao buscar CEP");
  } finally {
    setCepLoading(false);
  }
}
```

### Cloudflare AI — JSON parsing
O modelo pode retornar texto extra antes/depois do JSON. O `JSON.parse(raw.trim())` pode falhar. Em produção, usar regex para extrair o JSON do response ou adicionar tentativa com fallback.

### Route Handlers no Next.js 16
`params` em Route Handlers é uma `Promise` — sempre `await params` antes de desestruturar.

---

## Próximos passos — Fase 3

Na Fase 3 vamos construir o **Funil Comercial (CRM Kanban)**:

- Kanban com drag-and-drop via `@dnd-kit`
- 8 etapas padrão por empresa (SeedFunnelStages)
- Conversão de lead prospectado em lead do CRM
- Sheet de detalhes com histórico de atividades
- Tabelas: `funnel_stages`, `crm_leads`, `lead_activities`

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```
