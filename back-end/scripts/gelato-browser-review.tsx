/** Local browser-only QA fixture. Build with esbuild; serve on loopback with generated cases.json. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GelatoStage } from '../src/components/stages/gelato-stage';
import type { Order } from '../src/types/order';
import type { GelatoPrintInspection } from '../src/lib/books/gelato-admin-inspection';
declare const GELATO_QA_CASES: Record<string, { status: number; body: GelatoPrintInspection | { error: string } }>;
const cases = GELATO_QA_CASES;
// esbuild supplies actual inspection-route output at build time.
let scenario = 'overdue-siblings';
const requests: Array<{ method: string; path: string }> = [];
Object.assign(window, { gelatoQaRequests: requests });
window.fetch = async (input, init) => {
  const request = new Request(new URL(String(input), location.href), init);
  const url = new URL(request.url);
  if (url.origin !== location.origin || url.pathname !== '/api/admin/gelato-print') throw Error('Local QA blocks all other requests');
  requests.push({ method: request.method, path: url.pathname });
  if (request.method === 'POST') {
    const action = await request.json();
    if (action.action !== 'refresh') throw Error('Local QA permits only synthetic status-refresh failure');
    return Response.json({ error: 'Synthetic update not confirmed' }, { status: 409 });
  }
  if (request.method !== 'GET') throw Error('Unexpected request method');
  const result = cases[scenario as keyof typeof cases];
  return Response.json(result.body, { status: result.status });
};
function App() {
  const [selected, setSelected] = useState(scenario);
  const order = { orderId: 'ORDINARY-ADMIN-amazon-98-item-1', gelatoStatus: 'draft', gelatoOrderType: 'draft', gelatoTracking: [] } as unknown as Order;
  return <main className="mx-auto max-w-3xl space-y-6 bg-white p-5 text-gray-900">
    <p className="font-semibold">Local synthetic Gelato QA. No live orders or provider access.</p>
    <label className="block">Scenario <select className="rounded border p-2" value={selected} onChange={event => { scenario = event.target.value; setSelected(scenario); }}>
      {Object.keys(cases).map(name => <option key={name}>{name}</option>)}
    </select></label>
    <GelatoStage key={selected} order={order} onRefresh={async () => undefined} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
