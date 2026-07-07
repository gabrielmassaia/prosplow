"use server";

import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleCrmLeadRepository } from "@/infrastructure/repositories/DrizzleCrmLeadRepository";
import { DrizzleFunnelStageRepository } from "@/infrastructure/repositories/DrizzleFunnelStageRepository";
import { DrizzleLeadActivityRepository } from "@/infrastructure/repositories/DrizzleLeadActivityRepository";
import { DrizzleLeadRepository } from "@/infrastructure/repositories/DrizzleLeadRepository";
import { DrizzleNicheRepository } from "@/infrastructure/repositories/DrizzleNicheRepository";
import { SeedFunnelStages } from "@/use-cases/funil/SeedFunnelStages";
import { ConvertProspectingLead } from "@/use-cases/funil/ConvertProspectingLead";

export async function convertProspectingLeadAction(prospectingLeadId: string) {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const crmLeadRepo = new DrizzleCrmLeadRepository(db);
  const leadRepo = new DrizzleLeadRepository(db);
  const nicheRepo = new DrizzleNicheRepository(db);
  const stageRepo = new DrizzleFunnelStageRepository(db);
  const leadActivityRepo = new DrizzleLeadActivityRepository(db);

  const seedResult = await new SeedFunnelStages(stageRepo).execute({ companyId });
  const stages = seedResult.ok ? seedResult.data : await stageRepo.findAllByCompany(companyId);

  const targetStage =
    stages.filter((s) => s.kind === "normal").sort((a, b) => a.position - b.position)[0] ??
    stages.sort((a, b) => a.position - b.position)[0];

  if (!targetStage) return { ok: false as const, error: "Nenhuma etapa de funil disponível" };

  const prospectingLead = await leadRepo.findById(prospectingLeadId, companyId);
  const niche = prospectingLead ? await nicheRepo.findById(prospectingLead.nicheId, companyId) : null;

  const useCase = new ConvertProspectingLead(crmLeadRepo, leadRepo, leadActivityRepo);
  return useCase.execute({
    prospectingLeadId,
    companyId,
    nicheName: niche?.name ?? null,
    targetStageId: targetStage.id,
    userId: user.id,
  });
}
