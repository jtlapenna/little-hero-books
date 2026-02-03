# Lulu webhook + W4 shipping (concise)

## Lulu webhook — what actually happens

- **You can configure it.** Lulu has no dashboard field; we register our URL with Lulu’s API **once** (per environment).
- **One-time setup, not per order:** After we register, Lulu **pushes** status updates to our URL for **every** print job. We do **not** call an API for each order to get status.
- **How to register:**  
  `POST https://admin.littleherolabs.com/api/admin/lulu-webhook-subscribe`  
  (no body; uses backend env `LULU_CLIENT_ID` / `LULU_CLIENT_SECRET`).  
  That route tells Lulu: “when any print job status changes, POST to `https://admin.littleherolabs.com/api/webhooks/lulu/status`.”
- **After that:** Lulu calls our webhook when status changes (e.g. SHIPPED). Our webhook updates the DB and can send “your book has shipped” to the customer. No per-order API route needed for webhook setup.

---

## W4 and the two shipping options (Standard + upgraded)

- **W4 is already set up** to use Amazon shipping tier:
  - Router sends orders (including `amazon_shipment_service_level`) to n8n.
  - W1.1 “Prep Workflow 4 Orders” passes it to W4 as `ShipmentServiceLevelCategory` / `ShipServiceLevel`.
  - W4 “Build Lulu Print Job Payload” maps: **Expedited** → Lulu `EXPEDITED`, **Standard** → Lulu `GROUND`/`MAIL`. So two options = Standard + Expedited is supported.
- **Why one order has `amazon_shipment_service_level` null:**  
  That value is set when we **first** store the order from the Amazon orders cron (from the list response). If the list didn’t return it, or the order was created before we stored it, the column stays null.
- **For the order with upgraded shipping but null in DB:**  
  Set `amazon_shipment_service_level` in Supabase for that order to the Amazon value (e.g. **`Expedited`**). Then the next time the router sends it to W4, W4 will send Lulu the faster shipping.
- **Optional:** Run the migration `database/migration-print-fulfillment-timestamps.sql` if you haven’t, so the `amazon_shipment_service_level` column exists and the router can select it.
