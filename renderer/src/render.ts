
import fs from "node:fs/promises";
import path from "node:path";
import { RenderRequestSchema } from "./schema.js";
import { htmlToPdf, ensureDir } from "./pdf.js";

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c] as string));
}

export async function renderBook(body: unknown) {
  const parsed = RenderRequestSchema.parse(body);
  const { manuscript, child, options, orderId } = parsed;

  // Load HTML templates
  const bookTpl = await fs.readFile(path.join(process.cwd(), "templates", "book.html"), "utf8");
  const coverTpl = await fs.readFile(path.join(process.cwd(), "templates", "cover.html"), "utf8");

  // Generate story pages (14 interior pages)
  const storyPagesHtml = manuscript.pages.map(p => `
    <section class="page">
      <div class="art"><!-- image placeholder for ${escapeHtml(p.id)} --></div>
      <div class="text">${escapeHtml(p.text)}</div>
    </section>
  `).join("\n");

  // Generate dedication page
  const dedicationHtml = `
    <section class="page dedication-page">
      <h1>To Our Little Hero</h1>
      <p>${escapeHtml(options?.dedication || `Dear ${child.name},<br><br>You are the hero of this story and every story to come. May your adventures always be magical.<br><br>With love,<br>Your family`)}</p>
    </section>
  `;

  // Generate keepsake page
  const keepsakeHtml = `
    <section class="page keepsake-page">
      <h2>This is me at age ${child.age}!</h2>
      <div class="drawing-space">Draw a picture of your favorite part of the story!</div>
      <p>Date: _______________</p>
    </section>
  `;

  // Combine all pages: story pages + dedication + keepsake
  const allPagesHtml = storyPagesHtml + dedicationHtml + keepsakeHtml;

  const bookHtml = bookTpl
    .replace("{{TITLE}}", escapeHtml(manuscript.title))
    .replace("{{PAGES}}", allPagesHtml);

  const coverHtml = coverTpl
    .replace("{{TITLE}}", escapeHtml(manuscript.title))
    .replace("{{NAME}}", escapeHtml(child.name));

  const outDir = path.join(process.cwd(), "out", Date.now().toString());
  const bookOut = path.join(outDir, "book.pdf");
  const coverOut = path.join(outDir, "cover.pdf");
  await ensureDir(bookOut);
  await htmlToPdf(bookHtml, bookOut);
  await htmlToPdf(coverHtml, coverOut);

  // In MVP we just return local file paths. In prod, upload to S3/R2 and return signed URLs.
  return {
    orderId,
    bookPdfUrl: `file://${bookOut}`,
    coverPdfUrl: `file://${coverOut}`,
    metadata: {
      title: manuscript.title,
      childName: child.name,
      totalPages: 16, // 14 story + 1 dedication + 1 keepsake
      generatedAt: new Date().toISOString(),
      templateVersion: "1.0"
    }
  };
}
