import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/infrastructure/db";
import { DrizzleCompanyRepository } from "@/infrastructure/repositories/DrizzleCompanyRepository";
import { DrizzleCampaignRepository } from "@/infrastructure/repositories/DrizzleCampaignRepository";
import { DrizzleNicheRepository } from "@/infrastructure/repositories/DrizzleNicheRepository";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const companyRepo = new DrizzleCompanyRepository(db);
  const company = await companyRepo.findByUserId(session.user.id);
  if (!company) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const campaignRepo = new DrizzleCampaignRepository(db);
  const campaign = await campaignRepo.findById(id, company.id);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const nicheRepo = new DrizzleNicheRepository(db);
  const niche = await nicheRepo.findById(campaign.nicheId, company.id);

  return NextResponse.json({ campaign, niche });
}
