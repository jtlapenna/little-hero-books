
import express from "express";
import { renderBook } from "./render.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_, res) => res.json({ ok: true }));

app.post("/render", async (req, res) => {
  try {
    const out = await renderBook(req.body);
    res.json(out);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || "Render failed" });
  }
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`Renderer listening on :${port}`));
