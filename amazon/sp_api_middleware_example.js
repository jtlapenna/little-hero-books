
// Pseudo-code for a signing middleware. Replace with real SP-API client.
import express from 'express';
const app = express();
app.use(express.json());

app.get('/orders', async (req, res) => {
  // TODO: call SP-API ListOrders with SigV4
  res.json({ orders: [] });
});

app.get('/orders/:id/items', async (req, res) => {
  // TODO: call SP-API GetOrderItems
  res.json({ items: [] });
});

app.post('/orders/:id/confirm-shipment', async (req, res) => {
  // TODO: call SP-API ConfirmShipment
  res.json({ ok: true });
});

app.listen(4000, () => console.log('SP-API middleware on :4000'));
