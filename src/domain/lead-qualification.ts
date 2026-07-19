// Regra de negócio de domínio: a partir de qual score (0–100) um lead é "qualificado".
// Fica no domínio (não no SQL do repositório nem espalhado como número mágico na UI)
// para que exista uma única fonte da verdade — repositório, dashboard e telas todos a usam.
export const QUALIFIED_SCORE_THRESHOLD = 70;

export function isQualifiedLead(score: number): boolean {
  return score >= QUALIFIED_SCORE_THRESHOLD;
}
