import { handleGelatoWebhook } from '@/lib/books/gelato-webhook';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return handleGelatoWebhook(request, {
    secret: process.env.GELATO_WEBHOOK_SECRET,
    enabled: process.env.GELATO_STATUS_RELAY_ENABLED === 'true',
    // Never initialize the database/provider/storage runtime when the normal relay is OFF.
    refresh: async (event, abort) => (await import('@/lib/books/gelato-webhook-runtime')).refreshGelatoWebhook(event, abort),
    receipt: receipt => console.info('[Gelato webhook receipt]', JSON.stringify(receipt)),
  });
}
