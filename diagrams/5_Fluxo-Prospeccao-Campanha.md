# Fluxo — Prospecção (Criar Campanha e Executar Busca)

> Parte de `diagrams/`. Ver `0_Indice.md` para o mapa completo. Fonte: `docs/SPEC.md` (Integrações externas), `phases/aula-2/`.

---

## O que este diagrama explica

Este é o fluxo mais rico do sistema: o usuário digita só um **CEP**, o formulário resolve cidade/estado/coordenadas automaticamente (client-side), e ao rodar a campanha o use case `RunCampaign` orquestra a busca geo-referenciada, o algoritmo de score e a qualificação por IA — sem que nenhuma dessas integrações apareça em `use-cases/` como implementação concreta (tudo via `IGeoService`/`IAIService`).

---

## Diagrama 1 — Preenchimento do formulário (client-side)

```mermaid
sequenceDiagram
    participant Form as Formulário de Campanha (client)
    participant ViaCEP as ViaCEP API
    participant Nominatim as Nominatim (OSM)

    Form->>Form: onBlur no campo CEP
    Form->>ViaCEP: GET viacep.com.br/ws/{cep}/json
    ViaCEP-->>Form: { localidade, uf, logradouro }
    Form->>Nominatim: GET nominatim.openstreetmap.org/search?q=...
    Nominatim-->>Form: [{ lat, lon }]
    Form->>Form: preenche cidade/estado (editáveis) + lat/lon (read-only)
```

---

## Diagrama 2 — Execução da campanha (`RunCampaign`)

```mermaid
sequenceDiagram
    participant Action as run-campaign action
    participant UC as RunCampaign (use-case)
    participant Geo as OverpassGeoService
    participant Overpass as Overpass API
    participant LeadRepo as DrizzleLeadRepository
    participant CampRepo as DrizzleCampaignRepository
    participant DB as Neon Postgres

    Action->>UC: execute({ campaignId, companyId })
    UC->>CampRepo: findById(campaignId, companyId)
    CampRepo->>DB: SELECT campaign
    UC->>CampRepo: updateStatus('running')
    UC->>Geo: search({ lat, lon, radiusKm, keywords })
    Geo->>Geo: monta query dupla (amenity + name)
    Geo->>Overpass: POST /api/interpreter
    Note over Geo,Overpass: Headers obrigatórios:<br/>Accept + User-Agent<br/>(senão 406)
    Overpass-->>Geo: nodes/ways encontrados
    Geo-->>UC: GeoResult[]
    loop cada resultado
        UC->>UC: calcula score (0 a 100)
    end
    UC->>LeadRepo: bulkCreate(leads com score)
    LeadRepo->>DB: INSERT INTO prospecting_leads
    UC->>CampRepo: updateStatus('completed', totalFound)
    CampRepo->>DB: UPDATE campaign
    UC-->>Action: { ok: true, data: { totalFound } }
```

---

## Diagrama 3 — Qualificação de um lead com IA (sob demanda)

```mermaid
sequenceDiagram
    participant UI as Sheet de detalhes do lead
    participant Action as generate-diagnosis action
    participant UC as GenerateDiagnosis
    participant AI as CloudflareAIService
    participant CF as Cloudflare Workers AI
    participant LeadRepo as DrizzleLeadRepository

    UI->>Action: generateDiagnosisAction(leadId)
    Action->>UC: execute({ leadId, companyId })
    UC->>AI: complete(systemPrompt, userPrompt)
    AI->>CF: POST .../ai/run/@cf/meta/llama-3-8b-instruct
    CF-->>AI: { aiOverview, suggestedOffer } (JSON)
    AI-->>UC: string (JSON)
    UC->>LeadRepo: update(leadId, companyId, { aiOverview, suggestedOffer })
    UC-->>Action: { ok: true }
    Action-->>UI: atualiza sheet
```

---

## Como ler este diagrama

- **A "query dupla" do Overpass existe por causa do idioma.** As keywords do nicho são em português ("restaurante"), mas o OpenStreetMap usa `amenity` em inglês ("restaurant"). A busca por `amenity` pega a maioria dos casos; a busca por `name~"restaurante",i` é o fallback para estabelecimentos sem essa tag.
- **O score é calculado no use case, não na infraestrutura** — `OverpassGeoService` só devolve dados brutos (`GeoResult[]`). A regra de pontuação (website +20, telefone +15, rating, etc.) é lógica de negócio, então mora em `RunCampaign`.
- **O header `Accept` no fetch server-side é uma armadilha real** — o Node.js não envia esse header por padrão como o browser envia, e o proxy da Overpass responde `406 Not Acceptable` sem ele.
- **`GenerateDiagnosis`/`GenerateMessage` são chamadas sob demanda**, uma por lead, diferente do `RunCampaign` que processa em lote — por isso são actions/use cases separados, cada um só qualifica um lead.
