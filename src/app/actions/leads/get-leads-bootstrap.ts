"use server";

import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleCampaignRepository } from "@/infrastructure/repositories/DrizzleCampaignRepository";
import { DrizzleCrmLeadRepository } from "@/infrastructure/repositories/DrizzleCrmLeadRepository";
import { DrizzleLeadRepository } from "@/infrastructure/repositories/DrizzleLeadRepository";

export async function getLeadsBootstrapAction() {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const leadRepo = new DrizzleLeadRepository(db);
  const campaignRepo = new DrizzleCampaignRepository(db);
  const crmLeadRepo = new DrizzleCrmLeadRepository(db);

  const [leads, campaigns, convertedProspectingLeadIds] = await Promise.all([
    leadRepo.findAllByCompany(companyId),
    campaignRepo.findAllByCompany(companyId),
    crmLeadRepo.findConvertedProspectingLeadIds(companyId),
  ]);

  return { leads, campaigns, convertedProspectingLeadIds };
}
