// Exceção pragmática ao DIP: este use case depende do Better Auth (`auth`) concreto
// em vez de uma interface de domínio. Criar um usuário é, na prática, uma fronteira de
// framework — o Better Auth É a regra de "como um usuário nasce" (hash de senha, sessão,
// verificação). Abstraí-lo por trás de um IAuthService só recriaria a API do Better Auth
// sem ganho real de troca de provider. Todo o resto da persistência (empresa, membro,
// funil) continua atrás de interfaces injetadas.
import { auth } from "@/lib/auth";
import type { ICompanyRepository } from "@/domain/repositories/ICompanyRepository";
import type { IFunnelStageRepository } from "@/domain/repositories/IFunnelStageRepository";
import { SeedFunnelStages } from "@/use-cases/funil/SeedFunnelStages";

interface Input {
  name: string;
  email: string;
  password: string;
  companyName: string;
}

type Result = { ok: true } | { ok: false; error: string };

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export class CreateUserWithCompany {
  constructor(
    private companyRepo: ICompanyRepository,
    private stageRepo: IFunnelStageRepository
  ) {}

  async execute({ name, email, password, companyName }: Input): Promise<Result> {
    try {
      // 1. Criar usuário via Better Auth (server-side)
      const response = await auth.api.signUpEmail({
        body: { name, email, password },
        asResponse: true,
      });

      if (!response.ok) {
        const err = (await response.json()) as { message?: string };
        return { ok: false, error: err.message ?? "Erro ao criar usuário" };
      }

      const data = (await response.json()) as { user: { id: string } };
      const userId = data.user.id;

      // 2. Gerar slug da empresa
      const slug = slugify(companyName);

      // 3. Criar empresa + membro em transação
      const company = await this.companyRepo.create({ name: companyName, slug, ownerId: userId });

      // 4. Seed das etapas padrão do funil (falha aqui não deve impedir o cadastro —
      // o Data Loader do funil também seeda de forma lazy como segunda camada de proteção)
      await new SeedFunnelStages(this.stageRepo).execute({ companyId: company.id });

      return { ok: true };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erro inesperado";
      return { ok: false, error: message };
    }
  }
}
