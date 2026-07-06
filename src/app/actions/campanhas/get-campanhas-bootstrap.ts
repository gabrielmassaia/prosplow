"use server";

import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleCampaignRepository } from "@/infrastructure/repositories/DrizzleCampaignRepository";
import { DrizzleNicheRepository } from "@/infrastructure/repositories/DrizzleNicheRepository";

export async function getCampanhasBootstrapAction() {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const campaignRepo = new DrizzleCampaignRepository(db);
  const nicheRepo = new DrizzleNicheRepository(db);

  const [campaigns, niches] = await Promise.all([
    campaignRepo.findAllByCompany(companyId),
    nicheRepo.findAllByCompany(companyId),
  ]);

  return { campaigns, niches };
}
