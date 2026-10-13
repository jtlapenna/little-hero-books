import { assertCompletePrintRoutingMembership, resolvePrintRoutingGroup, type FrozenPrintRouting, type PrintRoutingOrder } from './print-routing';

export async function loadPrintRoutingGroupMembers(
  rootOrderId: string,
  lookups: {
    byRootOrderId: (root: string) => Promise<Array<{ id: number; orderId: string }>>;
    byAmazonOrderId: (root: string) => Promise<Array<{ id: number; orderId: string }>>;
    selfRoot: (root: string) => Promise<Array<{ id: number; orderId: string }>>;
  },
): Promise<Array<{ id: number; orderId: string }>> {
  const [group, legacyGroup, rootOrder] = await Promise.all([
    lookups.byRootOrderId(rootOrderId),
    lookups.byAmazonOrderId(rootOrderId),
    lookups.selfRoot(rootOrderId),
  ]);
  const unique = new Map<number, { id: number; orderId: string }>();
  for (const member of [...group, ...legacyGroup, ...rootOrder]) {
    const previous = unique.get(member.id);
    if (previous && previous.orderId !== member.orderId) throw new Error('Conflicting print group identity');
    unique.set(member.id, member);
  }
  return [...unique.values()];
}

export async function resolvePrintRoutingRequest(
  ids: number[],
  loadOrders: (ids: number[]) => Promise<PrintRoutingOrder[]>,
  loadGroupMembers: (rootOrderId: string) => Promise<Array<{ id: number; orderId: string }>>,
  loadManifest: (key: string) => Promise<unknown>,
): Promise<FrozenPrintRouting[]> {
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate order IDs');
  const orders = await loadOrders(ids);
  if (!orders || orders.length !== ids.length) throw new Error('Print order membership mismatch');
  const routes = await resolvePrintRoutingGroup(orders, loadManifest);
  const members = await loadGroupMembers(routes[0].rootOrderId);
  assertCompletePrintRoutingMembership(ids, members);
  return routes;
}
