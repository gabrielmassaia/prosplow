"use server";

import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleCrmLeadRepository } from "@/infrastructure/repositories/DrizzleCrmLeadRepository";
import { DrizzleFunnelStageRepository } from "@/infrastructure/repositories/DrizzleFunnelStageRepository";
import { SeedFunnelStages } from "@/use-cases/funil/SeedFunnelStages";

export async function getFunilBootstrapAction() {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const stageRepo = new DrizzleFunnelStageRepository(db);
  const crmLeadRepo = new DrizzleCrmLeadRepository(db);

  const seedUseCase = new SeedFunnelStages(stageRepo);
  const seedResult = await seedUseCase.execute({ companyId });
  const stages = seedResult.ok ? seedResult.data : await stageRepo.findAllByCompany(companyId);

  const leads = await crmLeadRepo.findAllByCompany(companyId);

  return { stages, leads };
}
