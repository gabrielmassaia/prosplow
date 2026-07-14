// ProspFlow — gerador dos diagramas em HTML/CSS puro (sem Mermaid/lib externa).
// Fonte de conteúdo: os arquivos diagrams/*.md. Rode com `node generate.mjs`
// sempre que um diagrama .md mudar, para regenerar as páginas em diagrams/html/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;

const esc = (s) =>
  String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderPanelLabel(label) {
  return label ? `<p class="panel-label">${esc(label)}</p>` : "";
}

function renderFlow(steps) {
  return `<div class="flow">${steps
    .map((s, i) => {
      const step = `<div class="step tone-${s.tone || "signal"}">
        ${s.k ? `<div class="k">${esc(s.k)}</div>` : ""}
        <div class="t">${s.t}</div>
        ${s.d ? `<div class="d">${s.d}</div>` : ""}
      </div>`;
      const isLast = i === steps.length - 1;
      const pipe = isLast
        ? ""
        : `<div class="pipe tone-${s.pipeTone || s.tone || "signal"}">${
            s.pipeLabel ? `<span class="label">${esc(s.pipeLabel)}</span>` : ""
          }</div>`;
      return step + pipe;
    })
    .join("\n")}</div>`;
}

function renderColumns(columns) {
  return `<div class="columns">${columns
    .map(
      (c) => `<div class="col tone-${c.tone || "signal"}">
        <div class="col-head"><span class="dot"></span>${esc(c.head)}</div>
        ${c.steps
          .map(
            (s) => `<div class="step tone-${s.tone || c.tone || "signal"}">
              ${s.k ? `<div class="k">${esc(s.k)}</div>` : ""}
              <div class="t">${s.t}</div>
              ${s.d ? `<div class="d">${s.d}</div>` : ""}
            </div>`
          )
          .join("\n")}
      </div>`
    )
    .join("\n")}</div>`;
}

// participants: string[]; rows: array of row descriptors
//   { type: 'msg', from, to, label, tone }
//   { type: 'self', at, label }
//   { type: 'note', text }
//   { type: 'loop', label, rows: [...] }
function renderSequence(participants, rows) {
  const n = participants.length;
  const cols = `repeat(${n}, minmax(0, 1fr))`;
  const idx = (name) => participants.indexOf(name);

  function renderMsgRow(r) {
    const i = idx(r.from);
    const j = idx(r.to);
    const lo = Math.min(i, j);
    const hi = Math.max(i, j);
    const dir = j >= i ? "dir-r" : "dir-l";
    const toneClass = r.tone ? `tone-${r.tone}` : "";
    return `<div class="msg-row" style="grid-template-columns:${cols}">
      <div class="msg-line ${dir} ${toneClass}" style="grid-column:${lo + 1} / ${hi + 2}">
        <span class="msg-label">${esc(r.label)}</span>
      </div>
    </div>`;
  }

  function renderSelfRow(r) {
    const i = idx(r.at);
    return `<div class="msg-row" style="grid-template-columns:${cols}">
      <div class="msg-self" style="grid-column:${i + 1} / ${i + 2}"><span class="curl">&#8635;</span>${esc(
        r.label
      )}</div>
    </div>`;
  }

  function renderRows(list) {
    return list
      .map((r) => {
        if (r.type === "msg") return renderMsgRow(r);
        if (r.type === "self") return renderSelfRow(r);
        if (r.type === "note")
          return `<div class="note-row">${esc(r.text)}</div>`;
        if (r.type === "loop")
          return `<div class="loop-row"><div class="loop-label">loop — ${esc(
            r.label
          )}</div>${renderRows(r.rows)}</div>`;
        return "";
      })
      .join("\n");
  }

  return `<div class="sequence">
    <div class="lanes" style="grid-template-columns:${cols}">
      ${participants.map((p) => `<div class="lane-head">${esc(p)}</div>`).join("\n")}
    </div>
    <div class="lane-field" style="grid-template-columns:${cols}">
      <div class="lifelines" style="grid-template-columns:${cols}">
        ${participants.map(() => `<div class="lifeline"></div>`).join("\n")}
      </div>
      ${renderRows(rows)}
    </div>
  </div>`;
}

// tables: [{ name, domain, fields: [{name, type, pk, fk}] }]
// relationships: [{ from, to, label }]
function renderERD(tables, relationships) {
  return `<div class="erd-grid">
    ${tables
      .map(
        (t) => `<div class="table-card">
          <div class="th"><span class="dot dot-${t.domain}"></span>${esc(t.name)}</div>
          <div class="rows">
            ${t.fields
              .map(
                (f) => `<div class="field-row">
                  <span class="fname">${f.pk ? '<span class="badge pk">PK</span>' : ""}${
                  f.fk ? '<span class="badge fk">FK</span>' : ""
                }${esc(f.name)}</span>
                  <span class="ftype">${esc(f.type)}</span>
                </div>`
              )
              .join("\n")}
          </div>
        </div>`
      )
      .join("\n")}
  </div>
  <div class="rel-list">
    ${relationships
      .map(
        (r) =>
          `<div class="rel-item"><b>${esc(r.from)}</b><span class="arrow">&#8594;</span>${esc(
            r.to
          )} <span>${esc(r.label)}</span></div>`
      )
      .join("\n")}
  </div>`;
}

function renderLegend(items) {
  return `<div class="legend">${items
    .map((i) => `<span><i style="background:${i.color}"></i>${esc(i.label)}</span>`)
    .join("\n")}</div>`;
}

function renderReading(items) {
  return `<div class="reading">
    <h2>Como ler este diagrama</h2>
    ${items.map((t) => `<div class="callout">${t}</div>`).join("\n")}
  </div>`;
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

function page({ n, slug, title, eyebrow, thesis, body, prev, next }) {
  return `<!doctype html>
<html lang="pt-BR" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — ProspFlow Diagrams</title>
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
<div class="topbar">
  <div class="crumbs">
    <a href="index.html">diagrams</a><span class="sep">/</span><span class="current">${esc(slug)}</span>
  </div>
  <div class="actions">
    <a class="btn" href="index.html">&#8962; Índice</a>
    <button class="btn" id="theme-toggle">&#9788; Tema</button>
  </div>
</div>
<main>
  <div class="hero">
    <p class="eyebrow">${esc(eyebrow)}</p>
    <h1 class="title">${esc(title)}</h1>
    <p class="thesis">${thesis}</p>
  </div>
  ${body}
  <div class="pagenav">
    ${
      prev
        ? `<a href="${prev.href}"><span class="nav-k">&larr; Anterior</span>${esc(prev.title)}</a>`
        : `<span></span>`
    }
    ${
      next
        ? `<a class="next" href="${next.href}"><span class="nav-k">Próximo &rarr;</span>${esc(next.title)}</a>`
        : `<span></span>`
    }
  </div>
</main>
<footer class="credits">ProspFlow — diagrams/html — gerado a partir de diagrams/${n}_${slug}.md</footer>
<script src="assets/app.js"></script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Content — one entry per diagrams/N_*.md
// ---------------------------------------------------------------------------

const pages = [];

// 1 — Arquitetura --------------------------------------------------------
pages.push({
  n: 1,
  slug: "arquitetura",
  file: "1_Arquitetura-Clean-Architecture",
  title: "Clean Architecture Pragmático",
  eyebrow: "Arquitetura · 01/10",
  thesis:
    "As setas de dependência sempre apontam para dentro: <strong>app → use-cases → domain</strong>, e <strong>infrastructure → domain</strong>. Nunca o contrário.",
  body: `
    <div class="panel">
      ${renderPanelLabel("As camadas")}
      ${renderColumns([
        {
          tone: "fog",
          head: "app/ — controllers finos",
          steps: [
            { t: "Server Actions", d: "app/actions/*.ts" },
            { t: "Server Components / Pages", d: "app/(protected)/*" },
          ],
        },
        {
          tone: "signal",
          head: "use-cases/ — negócio",
          steps: [{ t: "RunCampaign, MoveLead, CreateUserWithCompany…", d: "Recebem apenas interfaces" }],
        },
        {
          tone: "signal",
          head: "domain/ — contratos",
          steps: [
            { t: "ICampaignRepository", d: "" },
            { t: "ILeadRepository · IGeoService · IAIService", d: "" },
          ],
        },
        {
          tone: "circuit",
          head: "infrastructure/ — implementações",
          steps: [
            { t: "DrizzleCampaignRepository", d: "implementa ICampaignRepository" },
            { t: "OverpassGeoService · CloudflareAIService", d: "implementam IGeoService / IAIService" },
            { t: "db/schema.ts + db/index.ts", d: "Drizzle + pool Neon" },
          ],
        },
      ])}
    </div>
    <div class="panel">
      ${renderPanelLabel("Injeção de dependência — runCampaignAction")}
      ${renderSequence(
        ["UI", "Action", "RunCampaign", "DrizzleCampaignRepository", "OverpassGeoService", "Neon"],
        [
          { type: "msg", from: "UI", to: "Action", label: "runCampaignAction(campaignId)" },
          { type: "self", at: "Action", label: "requireUser() + requireCompany()" },
          { type: "note", text: "Action instancia as implementações concretas — único lugar que faz isso" },
          { type: "msg", from: "Action", to: "RunCampaign", label: "new RunCampaign(repo, geo)" },
          { type: "msg", from: "RunCampaign", to: "DrizzleCampaignRepository", label: "findById(id, companyId)", tone: "circuit" },
          { type: "msg", from: "DrizzleCampaignRepository", to: "Neon", label: "SELECT … WHERE company_id = $1" },
          { type: "msg", from: "Neon", to: "DrizzleCampaignRepository", label: "campaign", tone: "return" },
          { type: "msg", from: "RunCampaign", to: "OverpassGeoService", label: "search(params)", tone: "circuit" },
          { type: "msg", from: "OverpassGeoService", to: "RunCampaign", label: "GeoResult[]", tone: "return" },
          { type: "msg", from: "RunCampaign", to: "Action", label: "{ ok: true, data }" },
        ]
      )}
    </div>
    ${renderReading([
      `A seta <b>implementa</b> é a inversão de dependência (DIP): <code>DrizzleCampaignRepository</code> e <code>OverpassGeoService</code> apontam <em>para</em> a interface — o use case só enxerga <code>ICampaignRepository</code>/<code>IGeoService</code>.`,
      `<strong>app/ nunca fala com <code>db</code> diretamente.</strong> Se aparecer <code>db.query…</code> dentro de <code>app/actions/</code>, é violação de arquitetura.`,
      `Trocar Overpass por outro provider de geo significa criar uma nova classe em <code>infrastructure/services/</code> e mudar uma linha na action — nada em <code>use-cases/</code> muda (OCP).`,
      `<code>companyId</code> sempre explícito nos parâmetros — nunca contexto global. Ver <code>3_multi-tenant</code>.`,
    ])}
  `,
});

// 2 — ERD -----------------------------------------------------------------
pages.push({
  n: 2,
  slug: "banco-de-dados",
  file: "2_Banco-de-Dados-ERD",
  title: "ERD — Banco de Dados Completo",
  eyebrow: "Schema · 02/10",
  thesis:
    "Multi-tenant: <strong>toda</strong> tabela de negócio pendura em <code>companies</code> via <code>company_id</code>. Tabelas anotadas por aula em que foram introduzidas.",
  body: `
    <div class="panel">
      ${renderPanelLabel("Tabelas e chaves")}
      ${renderLegend([
        { color: "var(--fog)", label: "Better Auth" },
        { color: "var(--signal)", label: "aula-1 · tenant" },
        { color: "var(--circuit)", label: "aula-2 · prospecção" },
        { color: "var(--ok)", label: "aula-3 · funil" },
      ])}
      ${renderERD(
        [
          {
            name: "users", domain: "auth",
            fields: [
              { name: "id", type: "text", pk: true },
              { name: "email", type: "text unique" },
              { name: "email_verified", type: "boolean" },
            ],
          },
          {
            name: "sessions", domain: "auth",
            fields: [
              { name: "id", type: "text", pk: true },
              { name: "token", type: "text unique" },
              { name: "user_id", type: "text", fk: true },
            ],
          },
          {
            name: "accounts", domain: "auth",
            fields: [
              { name: "id", type: "text", pk: true },
              { name: "user_id", type: "text", fk: true },
              { name: "password", type: "text" },
            ],
          },
          {
            name: "companies", domain: "tenant",
            fields: [
              { name: "id", type: "uuid", pk: true },
              { name: "slug", type: "text unique" },
              { name: "owner_id", type: "text", fk: true },
            ],
          },
          {
            name: "company_members", domain: "tenant",
            fields: [
              { name: "id", type: "uuid", pk: true },
              { name: "company_id", type: "uuid", fk: true },
              { name: "user_id", type: "text", fk: true },
              { name: "role", type: "enum owner|member" },
            ],
          },
          {
            name: "prospecting_niches", domain: "prospeccao",
            fields: [
              { name: "id", type: "uuid", pk: true },
              { name: "company_id", type: "uuid", fk: true },
              { name: "keywords", type: "text[]" },
              { name: "is_active", type: "boolean" },
            ],
          },
          {
            name: "prospecting_campaigns", domain: "prospeccao",
            fields: [
              { name: "id", type: "uuid", pk: true },
              { name: "company_id", type: "uuid", fk: true },
              { name: "niche_id", type: "uuid", fk: true },
              { name: "status", type: "enum draft…failed" },
              { name: "total_found", type: "int" },
            ],
          },
          {
            name: "prospecting_leads", domain: "prospeccao",
            fields: [
              { name: "id", type: "uuid", pk: true },
              { name: "company_id", type: "uuid", fk: true },
              { name: "campaign_id", type: "uuid", fk: true },
              { name: "niche_id", type: "uuid", fk: true },
              { name: "score", type: "int 20-100" },
              { name: "status", type: "enum new…do_not_contact" },
              { name: "ai_overview", type: "text" },
            ],
          },
          {
            name: "funnel_stages", domain: "funil",
            fields: [
              { name: "id", type: "uuid", pk: true },
              { name: "company_id", type: "uuid", fk: true },
              { name: "position", type: "int" },
              { name: "kind", type: "enum normal|won|lost|triage" },
            ],
          },
          {
            name: "crm_leads", domain: "funil",
            fields: [
              { name: "id", type: "uuid", pk: true },
              { name: "company_id", type: "uuid", fk: true },
              { name: "prospecting_lead_id", type: "uuid?", fk: true },
              { name: "stage_id", type: "uuid", fk: true },
              { name: "origin", type: "enum manual|prospecting" },
            ],
          },
          {
            name: "lead_activities", domain: "funil",
            fields: [
              { name: "id", type: "uuid", pk: true },
              { name: "company_id", type: "uuid", fk: true },
              { name: "lead_id", type: "uuid", fk: true },
              { name: "from_stage_id", type: "uuid?", fk: true },
              { name: "to_stage_id", type: "uuid?", fk: true },
              { name: "created_by", type: "text", fk: true },
            ],
          },
        ],
        [
          { from: "companies", to: "todas as tabelas de negócio", label: "1:N via company_id" },
          { from: "prospecting_niches", to: "prospecting_campaigns / prospecting_leads", label: "1:N" },
          { from: "prospecting_campaigns", to: "prospecting_leads", label: "1:N" },
          { from: "prospecting_leads", to: "crm_leads", label: "1:1 nullable — ConvertProspectingLead" },
          { from: "funnel_stages", to: "crm_leads", label: "1:N" },
          { from: "crm_leads", to: "lead_activities", label: "1:N — histórico" },
          { from: "funnel_stages", to: "lead_activities", label: "from_stage_id / to_stage_id (nullable)" },
        ]
      )}
    </div>
    ${renderReading([
      `<strong>Toda tabela de negócio pendura em <code>companies</code>.</strong> Se você adicionar uma tabela nova e ela não tiver <code>company_id</code>, algo está errado no design.`,
      `<code>prospecting_leads → crm_leads</code> é 1:1 nullable — um lead de prospecção pode virar (ou não) um lead do funil comercial.`,
      `<code>lead_activities</code> tem duas FKs para <code>funnel_stages</code> (from/to), ambas nullable — a primeira atividade de um lead não tem "de onde".`,
      `<code>users.id</code> é <b>text</b> (Better Auth gera IDs como string) enquanto o resto do schema usa <b>uuid</b> — nunca referenciar <code>owner_id</code>/<code>created_by</code> como uuid.`,
    ])}
  `,
});

// 3 — Multi-tenant ----------------------------------------------------------
pages.push({
  n: 3,
  slug: "multi-tenant",
  file: "3_Multi-Tenant-Isolamento",
  title: "Multi-Tenant — Isolamento por companyId",
  eyebrow: "Tenant safety · 03/10",
  thesis: `A regra de ouro: <strong>toda query filtra por company_id, sem exceção.</strong> O tenant nasce na sessão e é carregado explicitamente por todas as camadas.`,
  body: `
    <div class="panel">
      ${renderPanelLabel("Do cookie até o WHERE")}
      ${renderFlow([
        { tone: "fog", k: "Sessão", t: "Cookie / token Better Auth", d: "" },
        { tone: "signal", k: "src/lib/tenant.ts", t: "requireUser()", d: "resolve o usuário autenticado", pipeLabel: "user.id" },
        { tone: "signal", k: "src/lib/tenant.ts", t: "requireCompany(user.id)", d: "resolve a empresa do usuário", pipeLabel: "{ companyId }" },
        { tone: "signal", k: "app/actions", t: "Server Action (controller fino)", d: "", pipeLabel: "companyId explícito" },
        { tone: "signal", k: "use-cases", t: "execute({ ..., companyId })", d: "", pipeLabel: "companyId explícito" },
        { tone: "circuit", k: "infrastructure", t: "findAllByCompany(companyId)", d: "", pipeLabel: "WHERE company_id = $1" },
        { tone: "circuit", k: "Neon Postgres", t: "Query filtrada por tenant", d: "" },
      ])}
    </div>
    <div class="panel">
      ${renderPanelLabel("Nunca fazer")}
      ${renderColumns([
        {
          tone: "danger",
          head: "❌ Vaza dados entre tenants",
          steps: [
            { t: "findAll() sem companyId", d: "" },
            { t: "Action lendo companyId de variável global", d: "" },
            { t: "Repositório assumindo tenant do contexto", d: "" },
          ],
        },
      ])}
    </div>
    ${renderReading([
      `<code>requireCompany(user.id)</code> é o único lugar que resolve "qual empresa é essa" — depois disso <code>companyId</code> é só um valor passado por parâmetro.`,
      `Compare a assinatura correta com a errada: <code>findAllByCompany(companyId)</code> ✅ vs. <code>findAll()</code> ❌.`,
      `Por que importa: se um repositório esquecer o <code>WHERE company_id</code>, a query retorna dados de <em>todas</em> as agências — um vazamento real de dados entre clientes do SaaS, do tipo que não aparece testando com um único usuário.`,
      `Toda action começa com <code>requireUser()</code> → <code>requireCompany(user.id)</code> — convenção fixa do projeto, sem exceção.`,
    ])}
  `,
});

// 4 — Autenticação -----------------------------------------------------------
pages.push({
  n: 4,
  slug: "autenticacao",
  file: "4_Fluxo-Autenticacao",
  title: "Fluxo — Autenticação",
  eyebrow: "Aula 1 · 04/10",
  thesis: `Cadastro cria <strong>user + company + company_member</strong> em uma única transação — login e proteção de rotas usam a sessão gerada por esse cadastro.`,
  body: `
    <div class="panel">
      ${renderPanelLabel("Signup — CreateUserWithCompany")}
      ${renderSequence(
        ["UI", "signup action", "CreateUserWithCompany", "Better Auth", "DrizzleCompanyRepository", "Neon"],
        [
          { type: "msg", from: "UI", to: "signup action", label: "signup({ name, email, password, companyName })" },
          { type: "msg", from: "signup action", to: "CreateUserWithCompany", label: "execute(input)" },
          { type: "msg", from: "CreateUserWithCompany", to: "Better Auth", label: "auth.api.signUpEmail()" },
          { type: "msg", from: "Better Auth", to: "Neon", label: "INSERT INTO users" },
          { type: "msg", from: "Neon", to: "CreateUserWithCompany", label: "user criado", tone: "return" },
          { type: "self", at: "CreateUserWithCompany", label: "slugify(companyName)" },
          { type: "msg", from: "CreateUserWithCompany", to: "DrizzleCompanyRepository", label: "create({ name, slug, ownerId })" },
          { type: "note", text: "db.transaction() — atômico: companies + company_members ou nada" },
          { type: "msg", from: "DrizzleCompanyRepository", to: "Neon", label: "INSERT companies + company_members" },
          { type: "msg", from: "Neon", to: "CreateUserWithCompany", label: "company", tone: "return" },
          { type: "msg", from: "CreateUserWithCompany", to: "UI", label: "{ ok: true } → redireciona /prospeccao" },
        ]
      )}
    </div>
    <div class="panel">
      ${renderPanelLabel("Login")}
      ${renderSequence(
        ["UI", "authClient", "/api/auth", "Neon"],
        [
          { type: "msg", from: "UI", to: "authClient", label: "signIn.email({ email, password })" },
          { type: "msg", from: "authClient", to: "/api/auth", label: "POST /sign-in/email" },
          { type: "msg", from: "/api/auth", to: "Neon", label: "valida credenciais (bcrypt.compare)" },
          { type: "msg", from: "Neon", to: "/api/auth", label: "usuário válido", tone: "return" },
          { type: "msg", from: "/api/auth", to: "UI", label: "sessão criada (cookie) → redireciona", tone: "return" },
        ]
      )}
    </div>
    <div class="panel">
      ${renderPanelLabel("Proteção de rotas")}
      ${renderFlow([
        { tone: "signal", t: "Requisição para (protected)/*", d: "" },
        { tone: "signal", t: "src/proxy.ts", d: "checa presença do cookie de sessão", pipeLabel: "cookie ausente → /login" },
        { tone: "signal", t: "Server Component da página", d: "", pipeLabel: "cookie presente" },
        { tone: "ok", t: "requireUser() valida a sessão no banco", d: "renderiza a página se válida", pipeTone: "ok" },
      ])}
    </div>
    ${renderReading([
      `A transação no signup é o ponto mais importante: sem <code>db.transaction()</code>, um <code>INSERT company_members</code> que falhar deixaria uma empresa órfã, sem dono.`,
      `<code>users.id</code> é <b>text</b> (gerado pelo Better Auth) — <code>companies.owner_id</code> referencia esse campo como texto, nunca uuid.`,
      `O proxy hoje só checa se o <em>cookie existe</em> — a validade real da sessão é checada depois, em <code>requireUser()</code>. A Aula 4 move essa validação para o próprio proxy.`,
      `<code>role: "owner"</code> é o único valor usado hoje — <code>member</code> existe no schema para um fluxo futuro de convite de equipe, fora do escopo atual.`,
    ])}
  `,
});

// 5 — Prospecção --------------------------------------------------------------
pages.push({
  n: 5,
  slug: "prospeccao-campanha",
  file: "5_Fluxo-Prospeccao-Campanha",
  title: "Fluxo — Prospecção (Campanha)",
  eyebrow: "Aula 2 · 05/10",
  thesis: `O usuário digita um <strong>CEP</strong> — o resto (cidade, coordenadas, busca georreferenciada, score e qualificação por IA) é orquestrado pelo use case, nunca pela infraestrutura.`,
  body: `
    <div class="panel">
      ${renderPanelLabel("Formulário — CEP → coordenadas (client-side)")}
      ${renderSequence(
        ["Formulário", "ViaCEP", "Nominatim"],
        [
          { type: "self", at: "Formulário", label: "onBlur no campo CEP" },
          { type: "msg", from: "Formulário", to: "ViaCEP", label: "GET /ws/{cep}/json", tone: "circuit" },
          { type: "msg", from: "ViaCEP", to: "Formulário", label: "{ localidade, uf, logradouro }", tone: "return" },
          { type: "msg", from: "Formulário", to: "Nominatim", label: "GET /search?q=…", tone: "circuit" },
          { type: "msg", from: "Nominatim", to: "Formulário", label: "[{ lat, lon }]", tone: "return" },
          { type: "note", text: "cidade/estado ficam editáveis; lat/lon aparecem como confirmação read-only" },
        ]
      )}
    </div>
    <div class="panel">
      ${renderPanelLabel("Execução — RunCampaign")}
      ${renderSequence(
        ["Action", "RunCampaign", "OverpassGeoService", "Overpass", "LeadRepo", "CampRepo", "Neon"],
        [
          { type: "msg", from: "Action", to: "RunCampaign", label: "execute({ campaignId, companyId })" },
          { type: "msg", from: "RunCampaign", to: "CampRepo", label: "findById + updateStatus('running')" },
          { type: "msg", from: "RunCampaign", to: "OverpassGeoService", label: "search({ lat, lon, radiusKm, keywords })", tone: "circuit" },
          { type: "self", at: "OverpassGeoService", label: "monta query dupla (amenity + name)" },
          { type: "msg", from: "OverpassGeoService", to: "Overpass", label: "POST /api/interpreter", tone: "circuit" },
          { type: "note", text: "Headers obrigatórios: Accept + User-Agent — senão 406" },
          { type: "msg", from: "Overpass", to: "OverpassGeoService", label: "nodes/ways encontrados", tone: "return" },
          { type: "msg", from: "OverpassGeoService", to: "RunCampaign", label: "GeoResult[]", tone: "return" },
          { type: "loop", label: "cada resultado", rows: [{ type: "self", at: "RunCampaign", label: "calcula score (20–100)" }] },
          { type: "msg", from: "RunCampaign", to: "LeadRepo", label: "bulkCreate(leads com score)" },
          { type: "msg", from: "LeadRepo", to: "Neon", label: "INSERT prospecting_leads" },
          { type: "msg", from: "RunCampaign", to: "CampRepo", label: "updateStatus('completed', totalFound)" },
        ]
      )}
    </div>
    <div class="panel">
      ${renderPanelLabel("Qualificação por IA — sob demanda")}
      ${renderSequence(
        ["Sheet do lead", "Action", "GenerateDiagnosis", "CloudflareAIService", "Cloudflare AI", "LeadRepo"],
        [
          { type: "msg", from: "Sheet do lead", to: "Action", label: "generateDiagnosisAction(leadId)" },
          { type: "msg", from: "Action", to: "GenerateDiagnosis", label: "execute({ leadId, companyId })" },
          { type: "msg", from: "GenerateDiagnosis", to: "CloudflareAIService", label: "complete(system, user)", tone: "circuit" },
          { type: "msg", from: "CloudflareAIService", to: "Cloudflare AI", label: "POST …/llama-3-8b-instruct", tone: "circuit" },
          { type: "msg", from: "Cloudflare AI", to: "CloudflareAIService", label: "{ aiOverview, suggestedOffer }", tone: "return" },
          { type: "msg", from: "GenerateDiagnosis", to: "LeadRepo", label: "update(leadId, companyId, {...})" },
        ]
      )}
    </div>
    ${renderReading([
      `A <strong>query dupla</strong> do Overpass existe por causa do idioma: keywords em português, mas o OSM usa <code>amenity</code> em inglês. A busca por nome é o fallback.`,
      `O <strong>score é calculado no use case</strong>, não na infraestrutura — <code>OverpassGeoService</code> só devolve dados brutos.`,
      `O header <code>Accept</code> no fetch server-side é uma armadilha real: Node não envia isso por padrão como o navegador envia, e a Overpass responde <code>406</code> sem ele.`,
      `<code>GenerateDiagnosis</code>/<code>GenerateMessage</code> qualificam <em>um</em> lead por vez, sob demanda — diferente do <code>RunCampaign</code>, que processa em lote.`,
    ])}
  `,
});

// 6 — Funil ---------------------------------------------------------------
pages.push({
  n: 6,
  slug: "funil-kanban",
  file: "6_Fluxo-Funil-Kanban",
  title: "Fluxo — Funil Comercial (Kanban)",
  eyebrow: "Aula 3 · 06/10",
  thesis: `Arrastar um card faz <strong>duas escritas</strong>: muda o <code>stage_id</code> e registra uma <code>LeadActivity</code> como histórico da jornada.`,
  body: `
    <div class="panel">
      ${renderPanelLabel("Arrastar um card — MoveLead")}
      ${renderSequence(
        ["Kanban (dnd-kit)", "move-lead action", "MoveLead", "CrmLeadRepo", "ActivityRepo", "Neon"],
        [
          { type: "self", at: "Kanban (dnd-kit)", label: "onDragEnd(leadId, from, to)" },
          { type: "msg", from: "Kanban (dnd-kit)", to: "move-lead action", label: "moveLeadAction({ leadId, toStageId })" },
          { type: "msg", from: "move-lead action", to: "MoveLead", label: "execute({ leadId, toStageId, companyId, userId })" },
          { type: "msg", from: "MoveLead", to: "CrmLeadRepo", label: "findById(leadId, companyId)" },
          { type: "msg", from: "MoveLead", to: "CrmLeadRepo", label: "updateStage(leadId, companyId, toStageId)" },
          { type: "msg", from: "CrmLeadRepo", to: "Neon", label: "UPDATE crm_leads SET stage_id = …" },
          { type: "msg", from: "MoveLead", to: "ActivityRepo", label: "create({ leadId, fromStageId, toStageId, createdBy })" },
          { type: "msg", from: "ActivityRepo", to: "Neon", label: "INSERT lead_activities" },
          { type: "msg", from: "MoveLead", to: "Kanban (dnd-kit)", label: "{ ok: true } → atualiza card", tone: "return" },
        ]
      )}
    </div>
    <div class="panel">
      ${renderPanelLabel("Bootstrap — SeedFunnelStages")}
      ${renderFlow([
        { tone: "signal", t: "Primeiro acesso ao /funil de uma empresa nova", d: "" },
        { tone: "amber", t: "Empresa já tem funnel_stages?", d: "decisão", pipeLabel: "não" },
        { tone: "signal", t: "SeedFunnelStages.execute(companyId)", d: "", pipeLabel: "" },
        { tone: "ok", t: "INSERT das 8 etapas padrão", d: "kind: normal / won / lost / triage" },
      ])}
    </div>
    ${renderReading([
      `Duas escritas em uma ação: <code>UPDATE</code> (posição atual) + <code>INSERT</code> (histórico) — é o que alimenta a aba "Histórico" do <code>LeadDrawer</code>.`,
      `<code>fromStageId</code> pode ser nulo — a primeira atividade de um lead criado direto numa coluna não tem "de onde veio".`,
      `O bootstrap hoje é <em>lazy</em> (roda ao abrir <code>/funil</code>) — a Aula 4 move esse gatilho para o cadastro/primeiro login.`,
      `<code>stageKind</code> marca quais colunas são estados finais (won/lost) vs. estágios normais — relevante para métricas futuras de conversão.`,
    ])}
  `,
});

// 7 — React -----------------------------------------------------------------
pages.push({
  n: 7,
  slug: "conceitos-react",
  file: "7_Conceitos-React",
  title: "Conceitos — Por que React?",
  eyebrow: "Fundamentos · 07/10",
  thesis: `Antes do código: React troca <strong>"eu manipulo o DOM manualmente"</strong> por <strong>"eu descrevo como a UI deve ser"</strong> — o resto é reconciliação.`,
  body: `
    <div class="panel">
      ${renderPanelLabel("O problema: DOM imperativo (era jQuery)")}
      ${renderColumns([
        {
          tone: "danger",
          head: "❌ Antes — imperativo",
          steps: [
            { t: "Estado muda (ex: novo lead)", d: "" },
            { t: "Você encontra o elemento na tela", d: "" },
            { t: "Você cria/atualiza/remove nós do DOM", d: "" },
            { t: "Repete isso em cada lugar que usa o dado", d: "" },
          ],
        },
        {
          tone: "ok",
          head: "✅ Com React — declarativo",
          steps: [
            { t: "Estado muda (ex: novo lead)", d: "" },
            { t: "Você descreve: \"a lista de leads é isto\"", d: "" },
            { t: "React decide o que mudar na tela", d: "reconciliação" },
          ],
        },
      ])}
    </div>
    <div class="panel">
      ${renderPanelLabel("Virtual DOM e reconciliação")}
      ${renderFlow([
        { tone: "signal", t: "setState() / re-render", d: "" },
        { tone: "signal", t: "Nova árvore Virtual DOM em memória", d: "" },
        { tone: "signal", t: "Diffing com a árvore anterior", d: "" },
        { tone: "signal", t: "Patch mínimo calculado", d: "" },
        { tone: "ok", t: "Só o patch é aplicado no DOM real", d: "" },
      ])}
    </div>
    <div class="panel">
      ${renderPanelLabel("Server Components vs Client Components (React 19 + Next.js 16)")}
      ${renderColumns([
        {
          tone: "signal",
          head: "Servidor (RSC)",
          steps: [
            { t: "app/(protected)/prospeccao/page.tsx", d: "Server Component" },
            { t: "Busca dados direto via requireUser() + repositório", d: "" },
          ],
        },
        {
          tone: "circuit",
          head: "\"use client\" — fronteira",
          steps: [
            { t: "NichoForm.tsx", d: "useState, onSubmit" },
            { t: "LeadsMap.tsx", d: "Leaflet — só client" },
            { t: "KanbanBoard.tsx", d: "@dnd-kit, drag state" },
          ],
        },
      ])}
    </div>
    ${renderReading([
      `React nasceu para eliminar a manipulação manual do DOM em apps grandes com estado compartilhado — você descreve "como a UI deve ser para este estado" e a lib aplica as mudanças.`,
      `Virtual DOM não é mágica, é otimização de diffing: manipular o DOM real é caro; comparar duas árvores em memória (JS puro) é barato.`,
      `Por padrão, todo componente em <code>app/</code> roda no <strong>servidor</strong> — só vira Client Component (<code>"use client"</code>) quando precisa de interatividade real.`,
      `<strong>Hidratação</strong> é o navegador "religando" o JS nos Client Components após o HTML inicial chegar — por isso Leaflet precisa de <code>dynamic(() =&gt; import(...), &#123; ssr: false &#125;)</code>.`,
    ])}
  `,
});

// 8 — Next.js -----------------------------------------------------------------
pages.push({
  n: 8,
  slug: "conceitos-nextjs",
  file: "8_Conceitos-NextJS",
  title: "Conceitos — Por que Next.js?",
  eyebrow: "Fundamentos · 08/10",
  thesis: `React puro não decide <strong>onde</strong> renderizar nem tem roteamento. Next.js resolve os dois: pastas viram rotas, e o servidor renderiza por padrão.`,
  body: `
    <div class="panel">
      ${renderPanelLabel("O problema do SPA puro (sem framework)")}
      ${renderSequence(
        ["Navegador", "Servidor estático", "Bundle JS"],
        [
          { type: "msg", from: "Navegador", to: "Servidor estático", label: "GET /prospeccao" },
          { type: "msg", from: "Servidor estático", to: "Navegador", label: "HTML quase vazio (&lt;div id=root&gt;)", tone: "return" },
          { type: "msg", from: "Navegador", to: "Bundle JS", label: "baixa o bundle inteiro" },
          { type: "self", at: "Bundle JS", label: "executa React + busca dados (client-side)" },
          { type: "note", text: "Crawlers veem página vazia. Usuário espera o JS baixar + rodar para ver algo." },
        ]
      )}
    </div>
    <div class="panel">
      ${renderPanelLabel("Ciclo de vida de uma requisição — App Router")}
      ${renderFlow([
        { tone: "signal", t: "GET /prospeccao/campanhas", d: "" },
        { tone: "signal", t: "src/proxy.ts (middleware)", d: "checa cookie / rota pública", pipeLabel: "" },
        { tone: "signal", t: "app/(protected)/layout.tsx", d: "Server Component" },
        { tone: "signal", t: "page.tsx — renderiza no servidor", d: "requireUser() + repositório + HTML" },
        { tone: "circuit", t: "HTML + RSC payload enviados", d: "" },
        { tone: "ok", t: "Navegador hidrata só os Client Components", d: "página interativa" },
      ])}
    </div>
    <div class="panel">
      ${renderPanelLabel("Estratégias de renderização")}
      ${renderColumns([
        {
          tone: "ok",
          head: "SSR — usado no ProspFlow",
          steps: [{ t: "Renderiza a cada requisição", d: "dashboard, leads, kanban — dados sempre atuais" }],
        },
        {
          tone: "fog",
          head: "SSG — não usado aqui",
          steps: [{ t: "Renderiza uma vez, no build", d: "ideal para páginas públicas quase estáticas" }],
        },
        {
          tone: "fog",
          head: "ISR — não usado aqui",
          steps: [{ t: "Estático, revalida periodicamente", d: "meio termo entre SSR e SSG" }],
        },
      ])}
    </div>
    ${renderReading([
      `Next.js resolve dois problemas do React puro: <strong>roteamento</strong> (pastas em <code>app/</code> viram rotas) e <strong>onde renderizar</strong> (servidor por padrão).`,
      `<code>src/proxy.ts</code> roda antes de qualquer coisa — primeira parada de toda requisição, antes do React entrar em cena.`,
      `Todo Server Component do ProspFlow usa <strong>SSR</strong>, não SSG — um dashboard de leads muda a cada minuto, não faria sentido gerar uma vez no build.`,
      `O <strong>RSC payload</strong> é a serialização que acompanha o HTML e diz ao navegador quais partes já estão prontas (Server) e quais precisam hidratar (Client).`,
    ])}
  `,
});

// 9 — Neon -----------------------------------------------------------------
pages.push({
  n: 9,
  slug: "conceitos-neon",
  file: "9_Conceitos-Neon-Postgres",
  title: "Conceitos — Por que Neon?",
  eyebrow: "Fundamentos · 09/10",
  thesis: `Postgres tradicional foi feito para servidores de vida longa. Serverless/edge nasce e morre a cada requisição — Neon resolve esse descompasso.`,
  body: `
    <div class="panel">
      ${renderPanelLabel("O problema — serverless + Postgres tradicional")}
      ${renderColumns([
        {
          tone: "danger",
          head: "Sem pooling",
          steps: [
            { t: "Requisição 1, 2, 3…N", d: "cada uma sobe uma função efêmera" },
            { t: "Cada função abre uma conexão TCP nova", d: "" },
            { t: "Postgres tem limite fixo (ex: 100)", d: "" },
            { t: "Pico de tráfego → \"too many connections\"", d: "" },
          ],
        },
      ])}
    </div>
    <div class="panel">
      ${renderPanelLabel("A solução — Neon (serverless Postgres + pooling)")}
      ${renderFlow([
        { tone: "signal", t: "Requisições 1, 2, 3…N", d: "funções serverless" },
        { tone: "signal", t: "Pool singleton — src/infrastructure/db/index.ts", d: "criado uma única vez", pipeLabel: "" },
        { tone: "circuit", t: "Connection pooler do Neon", d: "multiplexa conexões" },
        { tone: "ok", t: "Neon Postgres — compute serverless", d: "escala para zero quando ocioso" },
      ])}
    </div>
    ${renderReading([
      `O pool é criado <strong>uma única vez</strong>, como singleton — não uma conexão nova por requisição. É esse arquivo que os repositórios recebem por injeção no construtor.`,
      `<code>sslmode=require</code> na <code>DATABASE_URL</code> não é opcional — o Neon exige TLS, diferente de um Postgres local em Docker.`,
      `"Escala para zero": em dev (ou tráfego baixo à noite), o compute hiberna e você não paga por capacidade ociosa — acorda na próxima query, com pequena latência de cold start.`,
      `<strong>Branching</strong> (não usado ainda no projeto): o Neon permite copiar o banco copy-on-write para testar uma migration arriscada sem tocar em produção.`,
    ])}
  `,
});

// 10 — Visão geral -----------------------------------------------------------------
pages.push({
  n: 10,
  slug: "visao-geral",
  file: "10_Visao-Geral-Stack",
  title: "Visão Geral — O Stack Completo",
  eyebrow: "Slide de abertura · 10/10",
  thesis: `Um mapa único ligando tudo — use este diagrama para abrir qualquer aula antes de mergulhar no assunto específico do dia.`,
  body: `
    <div class="panel">
      ${renderPanelLabel("Do navegador ao banco")}
      ${renderFlow([
        { tone: "fog", k: "Cliente", t: "🖥️ Navegador — React 19 + Client Components", d: "" },
        { tone: "signal", k: "Vercel", t: "proxy.ts → Server Components / Server Actions", d: "Next.js 16 App Router", pipeLabel: "requisição" },
        { tone: "signal", k: "Núcleo", t: "use-cases/ → domain/ (interfaces)", d: "Clean Architecture", pipeLabel: "companyId explícito" },
        { tone: "circuit", k: "infrastructure/", t: "Drizzle repositories + services", d: "implementam as interfaces", pipeLabel: "implementa" },
        { tone: "ok", k: "Dados", t: "🗄️ Neon Postgres — serverless + pool", d: "" },
      ])}
    </div>
    <div class="panel">
      ${renderPanelLabel("Integrações externas")}
      ${renderColumns([
        { tone: "fog", head: "Auth", steps: [{ t: "Better Auth", d: "sessão / credenciais" }] },
        { tone: "circuit", head: "Client-side", steps: [{ t: "ViaCEP", d: "CEP → cidade/UF" }, { t: "Nominatim/OSM", d: "endereço → lat/lon" }] },
        { tone: "circuit", head: "Server-side", steps: [{ t: "Overpass API", d: "busca georreferenciada" }, { t: "Cloudflare Workers AI", d: "diagnóstico + mensagem" }] },
      ])}
    </div>
    ${renderReading([
      `<strong>Duas famílias de chamada externa:</strong> ViaCEP e Nominatim rodam direto do navegador (client-side); Overpass e Cloudflare AI rodam do servidor, atrás de uma interface.`,
      `Better Auth fica <em>ao lado</em> do núcleo, não dentro dele — é infraestrutura de autenticação consumida direto por <code>app/</code>, não modelada como repositório de domínio.`,
      `Todo caminho até o banco passa pelo núcleo — não existe atalho de <code>app/</code> direto para <code>db</code>. Ver <code>1_arquitetura</code> para o detalhe.`,
      `Para a live: comece por este diagrama, depois desça para o específico do assunto do dia.`,
    ])}
  `,
});

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const navMeta = pages.map((p) => ({ href: `${p.n}_${p.slug}.html`, title: p.title }));

for (let i = 0; i < pages.length; i++) {
  const p = pages[i];
  const prev = i > 0 ? navMeta[i - 1] : null;
  const next = i < pages.length - 1 ? navMeta[i + 1] : null;
  const html = page({
    n: p.n,
    slug: p.slug,
    title: p.title,
    eyebrow: p.eyebrow,
    thesis: p.thesis,
    body: p.body,
    prev,
    next,
  });
  const outPath = path.join(OUT_DIR, `${p.n}_${p.slug}.html`);
  fs.writeFileSync(outPath, html, "utf-8");
  console.log(`wrote ${outPath}`);
}

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

const indexHtml = `<!doctype html>
<html lang="pt-BR" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ProspFlow — Diagramas</title>
<link rel="stylesheet" href="assets/style.css">
<style>
  .grid-index {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
    margin-top: 2rem;
  }
  .card-index {
    display: block;
    text-decoration: none;
    color: var(--paper);
    background: var(--ink-2);
    border: 1px solid var(--hairline);
    border-radius: var(--radius);
    padding: 1.25rem 1.4rem;
    transition: border-color 0.15s, transform 0.15s;
    opacity: 0;
    transform: translateY(8px);
    animation: rise 0.6s ease-out forwards;
  }
  .card-index:hover { border-color: var(--signal); transform: translateY(-2px); }
  .card-index .num { font-family: var(--font-mono); color: var(--signal); font-size: 0.78rem; }
  .card-index h3 { margin: 0.4rem 0 0.35rem; font-family: var(--font-mono); font-size: 1.02rem; }
  .card-index p { margin: 0; color: var(--fog); font-size: 0.86rem; }
</style>
</head>
<body>
<div class="topbar">
  <div class="crumbs"><span class="current">diagrams</span></div>
  <div class="actions"><button class="btn" id="theme-toggle">&#9788; Tema</button></div>
</div>
<main>
  <div class="hero">
    <p class="eyebrow">ProspFlow · Material de apoio para as lives</p>
    <h1 class="title">Diagramas</h1>
    <p class="thesis">Arquitetura, banco de dados, fluxos de negócio e os fundamentos de React/Next.js/Neon — construídos em HTML e CSS puro, sem lib de diagramação. Abra qualquer página com duplo clique: funciona offline.</p>
  </div>
  <div class="grid-index">
    ${pages
      .map(
        (p, i) => `<a class="card-index" style="animation-delay:${i * 0.04}s" href="${p.n}_${p.slug}.html">
      <span class="num">${String(p.n).padStart(2, "0")}/10</span>
      <h3>${esc(p.title)}</h3>
      <p>${esc(p.eyebrow.split("·")[0].trim())}</p>
    </a>`
      )
      .join("\n")}
  </div>
  <footer class="credits">Fonte de verdade: diagrams/*.md — regenerar com <code>node generate.mjs</code></footer>
</main>
<script src="assets/app.js"></script>
</body>
</html>
`;

fs.writeFileSync(path.join(OUT_DIR, "index.html"), indexHtml, "utf-8");
console.log(`wrote ${path.join(OUT_DIR, "index.html")}`);
