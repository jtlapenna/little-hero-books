
import path from "node:path";
import fs from "node:fs/promises";
import { chromium } from "playwright";

export async function htmlToPdf(html: string, outPath: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.pdf({
    path: outPath,
    format: "Letter",
    printBackground: true,
    margin: { top: "0.5in", right: "0.5in", bottom: "0.5in", left: "0.5in" }
  });
  await browser.close();
}

export async function ensureDir(p: string) {
  await fs.mkdir(path.dirname(p), { recursive: true });
}
