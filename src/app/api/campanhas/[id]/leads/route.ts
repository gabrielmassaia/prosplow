import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/infrastructure/db";
import { DrizzleCompanyRepository } from "@/infrastructure/repositories/DrizzleCompanyRepository";
import { DrizzleLeadRepository } from "@/infrastructure/repositories/DrizzleLeadRepository";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const companyRepo = new DrizzleCompanyRepository(db);
  const company = await companyRepo.findByUserId(session.user.id);
  if (!company) return NextResponse.json([], { status: 403 });

  const leadRepo = new DrizzleLeadRepository(db);
  const leads = await leadRepo.findByCampaign(id, company.id);
  return NextResponse.json(leads);
}
