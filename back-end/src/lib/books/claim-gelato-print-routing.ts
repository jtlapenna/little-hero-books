import type { FrozenPrintRouting } from './print-routing';

export interface GelatoPrintClaim {
  dispatch: boolean;
  reason?: string;
  submissionId?: string;
  claimToken?: string;
  orderReferenceId?: string;
}

export async function claimGelatoPrintRouting(
  routes: FrozenPrintRouting[],
  idempotencyKey: string,
  claim: (routes: FrozenPrintRouting[], idempotencyKey: string) => Promise<GelatoPrintClaim>,
): Promise<{ provider: 'lulu' | 'gelato'; routes: FrozenPrintRouting[]; claim: GelatoPrintClaim | null }> {
  if (!routes.length || !idempotencyKey.trim() || idempotencyKey.length > 255) {
    throw new Error('Invalid print routing claim');
  }
  const provider = routes[0].provider;
  if (routes.some((route) => route.provider !== provider)) throw new Error('Mixed print providers in one claim');
  if (provider === 'lulu') return { provider, routes, claim: null };
  const result = await claim(routes, idempotencyKey);
  if (!result || typeof result.dispatch !== 'boolean') throw new Error('Invalid Gelato claim response');
  return { provider, routes, claim: result };
}
