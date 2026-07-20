# Aula 2 — 2. Nichos

> Parte de `aula-2`. Pré-requisito: `1_Fundacao-Schema-e-Utilitarios.md`. Próximo arquivo: `3_Campanhas.md`.
>
> Fluxo completo da funcionalidade de Nichos: domínio, infraestrutura, use-cases, Server Actions e UI, do início ao fim.

---

## Domínio — `INicheRepository`

- [ ] **Step 1: Criar `src/domain/repositories/INicheRepository.ts`**

```typescript
export interface Niche {
  id: string;
  companyId: string;
  name: string;
  description: string;
  keywords: string[];
  targetServices: string[];
  commonPains: string[];
  baseMessageTemplate: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date | null;
}

export type CreateNicheData = Omit<Niche, "id" | "createdAt" | "updatedAt">;

export interface INicheRepository {
  findAllByCompany(companyId: string): Promise<Niche[]>;
  findById(id: string, companyId: string): Promise<Niche | null>;
  create(data: CreateNicheData): Promise<Niche>;
  update(id: string, companyId: string, data: Partial<CreateNicheData>): Promise<Niche>;
  delete(id: string, companyId: string): Promise<void>;
}
```

---

## Infraestrutura — `DrizzleNicheRepository`

- [ ] **Step 1: Criar `src/infrastructure/repositories/DrizzleNicheRepository.ts`**

```typescript
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { CreateNicheData, INicheRepository, Niche } from "@/domain/repositories/INicheRepository";
import { prospectingNichesTable } from "@/infrastructure/db/schema";
import type * as schema from "@/infrastructure/db/schema";

type DB = NodePgDatabase<typeof schema>;

export class DrizzleNicheRepository implements INicheRepository {
  constructor(private db: DB) {}

  async findAllByCompany(companyId: string): Promise<Niche[]> {
    return this.db
      .select()
      .from(prospectingNichesTable)
      .where(eq(prospectingNichesTable.companyId, companyId))
      .orderBy(prospectingNichesTable.createdAt);
  }

  async findById(id: string, companyId: string): Promise<Niche | null> {
    const [row] = await this.db
      .select()
      .from(prospectingNichesTable)
      .where(
        and(
          eq(prospectingNichesTable.id, id),
          eq(prospectingNichesTable.companyId, companyId)
        )
      )
      .limit(1);
    return row ?? null;
  }

  async create(data: CreateNicheData): Promise<Niche> {
    const [row] = await this.db
      .insert(prospectingNichesTable)
      .values(data)
      .returning();
    return row;
  }

  async update(id: string, companyId: string, data: Partial<CreateNicheData>): Promise<Niche> {
    const [row] = await this.db
      .update(prospectingNichesTable)
      .set(data)
      .where(
        and(
          eq(prospectingNichesTable.id, id),
          eq(prospectingNichesTable.companyId, companyId)
        )
      )
      .returning();
    return row;
  }

  async delete(id: string, companyId: string): Promise<void> {
    await this.db
      .delete(prospectingNichesTable)
      .where(
        and(
          eq(prospectingNichesTable.id, id),
          eq(prospectingNichesTable.companyId, companyId)
        )
      );
  }
}
```

---

## Task 7: Use Cases — Nichos

- [ ] **Step 1: Criar `src/use-cases/nichos/CreateNiche.ts`**

```typescript
import type { CreateNicheData, INicheRepository, Niche } from "@/domain/repositories/INicheRepository";

type Input = Omit<CreateNicheData, "companyId"> & { companyId: string };
type Result = { ok: true; data: Niche } | { ok: false; error: string };

export class CreateNiche {
  constructor(private nicheRepo: INicheRepository) {}

  async execute(input: Input): Promise<Result> {
    try {
      if (!input.name.trim()) return { ok: false, error: "Nome do nicho é obrigatório" };
      const niche = await this.nicheRepo.create(input);
      return { ok: true, data: niche };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erro ao criar nicho" };
    }
  }
}
```

- [ ] **Step 2: Criar `src/use-cases/nichos/UpdateNiche.ts`**

```typescript
import type { CreateNicheData, INicheRepository, Niche } from "@/domain/repositories/INicheRepository";

type Input = { id: string; companyId: string; data: Partial<CreateNicheData> };
type Result = { ok: true; data: Niche } | { ok: false; error: string };

export class UpdateNiche {
  constructor(private nicheRepo: INicheRepository) {}

  async execute({ id, companyId, data }: Input): Promise<Result> {
    try {
      const existing = await this.nicheRepo.findById(id, companyId);
      if (!existing) return { ok: false, error: "Nicho não encontrado" };
      const niche = await this.nicheRepo.update(id, companyId, data);
      return { ok: true, data: niche };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erro ao atualizar nicho" };
    }
  }
}
```

- [ ] **Step 3: Criar `src/use-cases/nichos/DeleteNiche.ts`**

```typescript
import type { INicheRepository } from "@/domain/repositories/INicheRepository";

type Input = { id: string; companyId: string };
type Result = { ok: true } | { ok: false; error: string };

export class DeleteNiche {
  constructor(private nicheRepo: INicheRepository) {}

  async execute({ id, companyId }: Input): Promise<Result> {
    try {
      const existing = await this.nicheRepo.findById(id, companyId);
      if (!existing) return { ok: false, error: "Nicho não encontrado" };
      if (existing.isActive) return { ok: false, error: "Desative o nicho antes de excluir" };
      await this.nicheRepo.delete(id, companyId);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erro ao excluir nicho" };
    }
  }
}
```


---

## Server Actions

- [ ] **Step 1: Criar `src/app/actions/nichos/create-niche.ts`**

```typescript
"use server";

import { z } from "zod";
import { db } from "@/infrastructure/db";
import { DrizzleNicheRepository } from "@/infrastructure/repositories/DrizzleNicheRepository";
import { CreateNiche } from "@/use-cases/nichos/CreateNiche";
import { requireCompany, requireUser } from "@/lib/tenant";

const schema = z.object({
  name: z.string().min(2),
  description: z.string().default(""),
  keywords: z.array(z.string()).default([]),
  targetServices: z.array(z.string()).default([]),
  commonPains: z.array(z.string()).default([]),
  baseMessageTemplate: z.string().default(""),
  isActive: z.boolean().default(true),
});

export async function createNicheAction(input: z.infer<typeof schema>) {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  const repo = new DrizzleNicheRepository(db);
  const useCase = new CreateNiche(repo);
  return useCase.execute({ ...parsed.data, companyId });
}
```

- [ ] **Step 2: Criar `src/app/actions/nichos/update-niche.ts`**

```typescript
"use server";

import { z } from "zod";
import { db } from "@/infrastructure/db";
import { DrizzleNicheRepository } from "@/infrastructure/repositories/DrizzleNicheRepository";
import { UpdateNiche } from "@/use-cases/nichos/UpdateNiche";
import { requireCompany, requireUser } from "@/lib/tenant";

const schema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  targetServices: z.array(z.string()).optional(),
  commonPains: z.array(z.string()).optional(),
  baseMessageTemplate: z.string().optional(),
  isActive: z.boolean().optional(),
});

export async function updateNicheAction(input: z.infer<typeof schema>) {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  const { id, ...data } = parsed.data;
  const repo = new DrizzleNicheRepository(db);
  const useCase = new UpdateNiche(repo);
  return useCase.execute({ id, companyId, data });
}
```

- [ ] **Step 3: Criar `src/app/actions/nichos/delete-niche.ts`**

```typescript
"use server";

import { db } from "@/infrastructure/db";
import { DrizzleNicheRepository } from "@/infrastructure/repositories/DrizzleNicheRepository";
import { DeleteNiche } from "@/use-cases/nichos/DeleteNiche";
import { requireCompany, requireUser } from "@/lib/tenant";

export async function deleteNicheAction(id: string) {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);
  const repo = new DrizzleNicheRepository(db);
  const useCase = new DeleteNiche(repo);
  return useCase.execute({ id, companyId });
}
```

> A leitura inicial dos nichos **não** tem Server Action própria: como a carga acontece no servidor, o Data Loader da página (`nichos/page.tsx`, mais abaixo) instancia o `DrizzleNicheRepository` e consulta o banco direto. Ver "Server Component lendo direto vs Client Component buscando via API" no `0_`. As Server Actions de nichos são só de **escrita** (`create-`, `update-`, `delete-`).

---

## Componente — `TagInput.tsx`

> Usado nos campos de array do formulário de nicho (`keywords`, `targetServices`, `commonPains`).

- [ ] **Step 1: Criar `src/components/TagInput.tsx`**

```tsx
"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface TagInputProps {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}

export function TagInput({ label, values, onChange, placeholder }: TagInputProps) {
  const [input, setInput] = useState("");

  function addTag() {
    const tag = input.trim().replace(/,$/, "");
    if (tag && !values.includes(tag)) {
      onChange([...values, tag]);
    }
    setInput("");
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-input bg-transparent p-2 min-h-10">
        {values.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 pr-1">
            {tag}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => onChange(values.filter((t) => t !== tag))}
              className="ml-0.5 size-4 rounded-sm text-current hover:bg-transparent hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </Button>
          </Badge>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          onBlur={addTag}
          placeholder={values.length === 0 ? (placeholder ?? "Digite e pressione Enter") : ""}
          className="flex-1 min-w-24 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}
```

O botão de remover tag usa o `Button` do shadcn (`variant="ghost" size="icon-xs"`) em vez de um `<button>` cru — mantém o mesmo padrão de foco/hover/acessibilidade dos outros botões do app, em vez de reimplementar esses estados manualmente.


---

## Task 14: Nichos — `src/app/(protected)/prospeccao/nichos/page.tsx`

> Segue o padrão thin-page + Suspense + Data Loader lendo direto + `_components/` explicado em "Conceitos que você precisa entender antes de codar".

- [ ] **Step 1: Criar `src/app/(protected)/prospeccao/nichos/page.tsx`**

```tsx
import type { Metadata } from "next";
import { Suspense } from "react";

import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleNicheRepository } from "@/infrastructure/repositories/DrizzleNicheRepository";
import { BasePageLayout } from "@/components/BasePageLayout/BasePageLayout";
import { LoadingContent } from "@/components/shared/loading-content";

import { NichosContent } from "./_components/NichosContent";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Nichos" };
}

export default function NichosPage() {
  return (
    <BasePageLayout title="Nichos" description="Segmentos de mercado que você prospecta">
      <Suspense fallback={<LoadingContent title="Carregando nichos..." withHeader={false} rows={4} />}>
        <NichosDataLoader />
      </Suspense>
    </BasePageLayout>
  );
}

async function NichosDataLoader() {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const nicheRepo = new DrizzleNicheRepository(db);
  const niches = await nicheRepo.findAllByCompany(companyId);

  return <NichosContent initialNiches={niches} />;
}
```

- [ ] **Step 2: Criar `src/app/(protected)/prospeccao/nichos/_components/NichosContent.tsx`**

Toda a interatividade (modais, formulário, TagInput, chamadas às actions de mutação) fica aqui. Recebe `initialNiches` como estado inicial — sem `useEffect` de fetch.

```tsx
"use client";

import { useState } from "react";
import { FileText, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { Niche } from "@/domain/repositories/INicheRepository";
import { createNicheAction } from "@/app/actions/nichos/create-niche";
import { deleteNicheAction } from "@/app/actions/nichos/delete-niche";
import { updateNicheAction } from "@/app/actions/nichos/update-niche";
import { TagInput } from "@/components/TagInput";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type NicheForm = {
  name: string;
  description: string;
  keywords: string[];
  targetServices: string[];
  commonPains: string[];
  baseMessageTemplate: string;
  isActive: boolean;
};

const emptyForm: NicheForm = {
  name: "",
  description: "",
  keywords: [],
  targetServices: [],
  commonPains: [],
  baseMessageTemplate: "",
  isActive: true,
};

interface NichosContentProps {
  initialNiches: Niche[];
}

export function NichosContent({ initialNiches }: NichosContentProps) {
  const [niches, setNiches] = useState<Niche[]>(initialNiches);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Niche | null>(null);
  const [form, setForm] = useState<NicheForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(niche: Niche) {
    setEditing(niche);
    setForm({
      name: niche.name,
      description: niche.description,
      keywords: niche.keywords,
      targetServices: niche.targetServices,
      commonPains: niche.commonPains,
      baseMessageTemplate: niche.baseMessageTemplate,
      isActive: niche.isActive,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (editing) {
        const result = await updateNicheAction({ id: editing.id, ...form });
        if (!result.ok) { toast.error(result.error); return; }
        setNiches((prev) => prev.map((n) => (n.id === editing.id ? result.data : n)));
        toast.success("Nicho atualizado");
      } else {
        const result = await createNicheAction(form);
        if (!result.ok) { toast.error(result.error); return; }
        setNiches((prev) => [result.data, ...prev]);
        toast.success("Nicho criado");
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(niche: Niche) {
    const result = await updateNicheAction({ id: niche.id, isActive: !niche.isActive });
    if (!result.ok) { toast.error(result.error); return; }
    setNiches((prev) => prev.map((n) => (n.id === niche.id ? result.data : n)));
  }

  async function handleDelete(niche: Niche) {
    const result = await deleteNicheAction(niche.id);
    if (!result.ok) { toast.error(result.error); return; }
    setNiches((prev) => prev.filter((n) => n.id !== niche.id));
    toast.success("Nicho excluído");
  }

  function fillDefaults() {
    if (!form.name.trim()) { toast.error("Digite o nome do nicho primeiro"); return; }
    const name = form.name.trim().toLowerCase();
    setForm((f) => ({
      ...f,
      description: `Empresas do segmento de ${name} que buscam crescer com marketing digital e precisam de presença online profissional.`,
      keywords: [name, "marketing digital", "presença online"],
      targetServices: [
        "Site profissional responsivo",
        "Gestão de redes sociais",
        "Google Meu Negócio",
        "Google Ads",
        "Tráfego pago",
      ],
      commonPains: [
        "Baixa presença digital",
        "Poucos clientes vindos da internet",
        "Dependência de indicações",
        "Sem site ou site desatualizado",
        "Dificuldade em atrair clientes na região",
      ],
      baseMessageTemplate:
        "Olá, {nome}! Tudo bem? Vi que vocês estão em {cidade} e notei que poderiam fortalecer a presença digital. Trabalho com empresas do segmento para atrair mais clientes online. Gostaria de conversar sobre como posso ajudar?",
    }));
    toast.success("Campos preenchidos com valores sugeridos");
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> Novo nicho
        </Button>
      </div>

      {niches.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
          <p className="text-sm text-muted-foreground">Nenhum nicho criado ainda</p>
          <Button onClick={openCreate} variant="outline" size="sm" className="mt-4">
            <Plus className="mr-1.5 h-4 w-4" /> Criar primeiro nicho
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {niches.map((niche) => (
            <div key={niche.id} className="flex flex-col rounded-xl border border-border/60 bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground">{niche.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{niche.description}</p>
                </div>
                <Badge className={niche.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}>
                  {niche.isActive ? "Ativo" : "Inativo"}
                </Badge>
              </div>
              <div className="mb-4 flex flex-wrap gap-1">
                {niche.keywords.slice(0, 3).map((kw) => (
                  <Badge key={kw} variant="secondary" className="text-[11px]">{kw}</Badge>
                ))}
                {niche.keywords.length > 3 && (
                  <Badge variant="secondary" className="text-[11px]">+{niche.keywords.length - 3}</Badge>
                )}
              </div>
              <div className="mt-auto flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(niche)} className="flex-1">
                  <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleToggleActive(niche)} title={niche.isActive ? "Desativar" : "Ativar"}>
                  <Power className="h-4 w-4" />
                </Button>
                {!niche.isActive && (
                  <AlertDialog>
                    <AlertDialogTrigger>
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-destructive transition-colors hover:bg-accent">
                        <Trash2 className="h-4 w-4" />
                      </span>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir nicho?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação não pode ser desfeita. O nicho &quot;{niche.name}&quot; será removido permanentemente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(niche)} className="bg-destructive text-destructive-foreground">
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar nicho" : "Novo nicho"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="niche-name">Nome *</Label>
                <Input id="niche-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex: Restaurantes" />
              </div>
              <div className="flex items-end">
                <Button type="button" variant="outline" size="sm" onClick={fillDefaults}>
                  <FileText className="h-4 w-4" />
                  <span className="ml-1.5">Preencher</span>
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="niche-desc">Descrição</Label>
              <Textarea id="niche-desc" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>

            <TagInput label="Keywords de busca" values={form.keywords} onChange={(v) => setForm((f) => ({ ...f, keywords: v }))} placeholder="restaurante, pizzaria..." />
            <TagInput label="Serviços oferecidos" values={form.targetServices} onChange={(v) => setForm((f) => ({ ...f, targetServices: v }))} placeholder="Site, Google Ads..." />
            <TagInput label="Dores comuns" values={form.commonPains} onChange={(v) => setForm((f) => ({ ...f, commonPains: v }))} placeholder="Sem presença digital..." />

            <div className="space-y-1.5">
              <Label htmlFor="msg-template">Template de mensagem</Label>
              <Textarea
                id="msg-template"
                rows={3}
                value={form.baseMessageTemplate}
                onChange={(e) => setForm((f) => ({ ...f, baseMessageTemplate: e.target.value }))}
                placeholder="Use {nome} e {cidade} como variáveis"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

