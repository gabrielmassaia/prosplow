import type { CrmLead, ICrmLeadRepository } from "@/domain/repositories/ICrmLeadRepository";
import type { ILeadActivityRepository } from "@/domain/repositories/ILeadActivityRepository";
import type { ILeadRepository } from "@/domain/repositories/ILeadRepository";

type Input = {
  prospectingLeadId: string;
  companyId: string;
  nicheName: string | null;
  targetStageId: string;
  userId: string;
};
type Result = { ok: true; data: CrmLead } | { ok: false; error: string };

export class ConvertProspectingLead {
  constructor(
    private crmLeadRepo: ICrmLeadRepository,
    private leadRepo: ILeadRepository,
    private leadActivityRepo: ILeadActivityRepository
  ) {}

  async execute(input: Input): Promise<Result> {
    try {
      const already = await this.crmLeadRepo.findByProspectingLeadId(
        input.prospectingLeadId,
        input.companyId
      );
      if (already) return { ok: false, error: "Lead já convertido" };

      const prospectingLead = await this.leadRepo.findById(input.prospectingLeadId, input.companyId);
      if (!prospectingLead) return { ok: false, error: "Lead de prospecção não encontrado" };

      const crmLead = await this.crmLeadRepo.create({
        companyId: input.companyId,
        prospectingLeadId: prospectingLead.id,
        stageId: input.targetStageId,
        name: prospectingLead.name,
        phone: prospectingLead.phone,
        email: prospectingLead.email,
        niche: input.nicheName,
        subniche: null,
        origin: "prospecting",
        value: null,
        notes: null,
      });

      await this.leadActivityRepo.create({
        companyId: input.companyId,
        leadId: crmLead.id,
        fromStageId: null,
        toStageId: input.targetStageId,
        description: "Lead convertido da prospecção",
        createdBy: input.userId,
      });

      return { ok: true, data: crmLead };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erro ao converter lead" };
    }
  }
}
