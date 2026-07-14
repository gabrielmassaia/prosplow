"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, Power, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { Niche } from "@/domain/repositories/INicheRepository";
import { createNicheAction } from "@/app/actions/nichos/create-niche";
import { deleteNicheAction } from "@/app/actions/nichos/delete-niche";
import { updateNicheAction } from "@/app/actions/nichos/update-niche";
import { TagInput } from "@/components/TagInput";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [generating, setGenerating] = useState(false);

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
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setNiches((prev) => prev.map((n) => (n.id === editing.id ? result.data : n)));
        toast.success("Nicho atualizado");
      } else {
        const result = await createNicheAction(form);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
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
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setNiches((prev) => prev.map((n) => (n.id === niche.id ? result.data : n)));
  }

  async function handleDelete(niche: Niche) {
    const result = await deleteNicheAction(niche.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setNiches((prev) => prev.filter((n) => n.id !== niche.id));
    toast.success("Nicho excluído");
  }

  async function generateAI() {
    if (!form.name) {
      toast.error("Digite o nome do nicho primeiro");
      return;
    }
    setGenerating(true);
    await new Promise((r) => setTimeout(r, 800));
    const name = form.name.toLowerCase();
    if (name.includes("restaur") || name.includes("alimenta") || name.includes("pizza")) {
      setForm((f) => ({
        ...f,
        description:
          "Estabelecimentos de alimentação que precisam de presença digital e captação de clientes online.",
        keywords: ["restaurante", "pizzaria", "hamburgueria", "cafeteria", "lanchonete"],
        targetServices: ["Site profissional", "Cardápio digital", "Google Meu Negócio"],
        commonPains: ["Baixa presença digital", "Poucos pedidos online", "Sem site próprio"],
        baseMessageTemplate:
          "Olá, {nome}! Vi que vocês estão em {cidade} e quero apresentar uma solução para aumentar seus pedidos online.",
      }));
    } else if (name.includes("salon") || name.includes("beleza") || name.includes("estet")) {
      setForm((f) => ({
        ...f,
        description:
          "Salões de beleza e estética que buscam atrair novos clientes via redes sociais.",
        keywords: ["salão", "beleza", "estética", "cabeleireiro", "barbearia"],
        targetServices: ["Instagram profissional", "Agendamento online", "Google Ads"],
        commonPains: ["Agenda vazia", "Dependência de indicações", "Sem presença no Instagram"],
        baseMessageTemplate:
          "Oi, {nome}! Encontrei o salão de vocês em {cidade}. Posso ajudar a lotar a agenda usando o Instagram.",
      }));
    } else {
      setForm((f) => ({
        ...f,
        description: `Empresas do segmento ${form.name} que precisam de marketing digital para crescer.`,
        keywords: [form.name.toLowerCase()],
        targetServices: ["Site profissional", "Redes sociais", "Google Ads"],
        commonPains: ["Baixa presença digital", "Poucos clientes pelo digital"],
        baseMessageTemplate:
          "Olá, {nome}! Vi que vocês estão em {cidade} e tenho uma proposta para ajudar a crescer digitalmente.",
      }));
    }
    setGenerating(false);
    toast.success("Campos preenchidos com sugestão");
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
            <div
              key={niche.id}
              className="flex flex-col rounded-xl border border-border/60 bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground">{niche.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {niche.description}
                  </p>
                </div>
                <Badge
                  className={
                    niche.isActive
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  }
                >
                  {niche.isActive ? "Ativo" : "Inativo"}
                </Badge>
              </div>
              <div className="mb-4 flex flex-wrap gap-1">
                {niche.keywords.slice(0, 3).map((kw) => (
                  <Badge key={kw} variant="secondary" className="text-[11px]">
                    {kw}
                  </Badge>
                ))}
                {niche.keywords.length > 3 && (
                  <Badge variant="secondary" className="text-[11px]">
                    +{niche.keywords.length - 3}
                  </Badge>
                )}
              </div>
              <div className="mt-auto flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEdit(niche)}
                  className="flex-1"
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleToggleActive(niche)}
                  title={niche.isActive ? "Desativar" : "Ativar"}
                >
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
                          Esta ação não pode ser desfeita. O nicho &quot;{niche.name}&quot; será
                          removido permanentemente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(niche)}
                          className="bg-destructive text-destructive-foreground"
                        >
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
                <Input
                  id="niche-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Restaurantes"
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={generateAI}
                  disabled={generating}
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  <span className="ml-1.5">Gerar com IA</span>
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="niche-desc">Descrição</Label>
              <Textarea
                id="niche-desc"
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <TagInput
              label="Keywords de busca"
              values={form.keywords}
              onChange={(v) => setForm((f) => ({ ...f, keywords: v }))}
              placeholder="restaurante, pizzaria..."
            />
            <TagInput
              label="Serviços oferecidos"
              values={form.targetServices}
              onChange={(v) => setForm((f) => ({ ...f, targetServices: v }))}
              placeholder="Site, Google Ads..."
            />
            <TagInput
              label="Dores comuns"
              values={form.commonPains}
              onChange={(v) => setForm((f) => ({ ...f, commonPains: v }))}
              placeholder="Sem presença digital..."
            />

            <div className="space-y-1.5">
              <Label htmlFor="msg-template">Template de mensagem</Label>
              <Textarea
                id="msg-template"
                rows={3}
                value={form.baseMessageTemplate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, baseMessageTemplate: e.target.value }))
                }
                placeholder="Use {nome} e {cidade} como variáveis"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
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
