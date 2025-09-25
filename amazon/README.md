
# Amazon SP-API Middleware (Example)

Because SP-API signing is complex, we suggest a tiny middleware that:
- Exchanges/refreshes tokens
- Signs requests with AWS SigV4
- Exposes simplified endpoints for n8n

Routes (suggested):
- `GET /orders?status=Unshipped&createdAfter=...`
- `GET /orders/:id/items`
- `POST /orders/:id/confirm-shipment`

> Implement with Express + aws4 or official client. Keep secrets out of n8n.
