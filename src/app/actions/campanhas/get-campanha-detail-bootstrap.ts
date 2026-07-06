"use server";

import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleCampaignRepository } from "@/infrastructure/repositories/DrizzleCampaignRepository";
import { DrizzleLeadRepository } from "@/infrastructure/repositories/DrizzleLeadRepository";
import { DrizzleNicheRepository } from "@/infrastructure/repositories/DrizzleNicheRepository";

export async function getCampanhaDetailBootstrapAction(campaignId: string) {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const campaignRepo = new DrizzleCampaignRepository(db);
  const campaign = await campaignRepo.findById(campaignId, companyId);
  if (!campaign) return { ok: false as const, error: "Campanha não encontrada" };

  const nicheRepo = new DrizzleNicheRepository(db);
  const leadRepo = new DrizzleLeadRepository(db);

  const [niche, leads] = await Promise.all([
    nicheRepo.findById(campaign.nicheId, companyId),
    leadRepo.findByCampaign(campaignId, companyId),
  ]);

  return { ok: true as const, campaign, niche, leads };
}
