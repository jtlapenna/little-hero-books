#!/usr/bin/env node
/**
 * build-mailmeteor-batch.mjs
 *
 * Reads `outreach-data/lhl/drafts/*.md`, picks drafts at status `approved`,
 * writes a Mailmeteor-ready CSV to `outreach-data/lhl/mailmeteor-batch.csv`.
 *
 * Each row has columns: email, subject, body, handle, variant_id, angle_tag.
 * The body is the personalized text from the draft (everything after the
 * "Subject: ..." line). Plain text — recipients see the asterisks around
 * *Finding Our Inner Voice* literally in most clients, which reads fine.
 *
 * Usage:
 *   node scripts/lhl/build-mailmeteor-batch.mjs
 *
 * Then in Google Sheets: File → Import → Upload → select the CSV.
 * Then in that sheet: open Mailmeteor add-on, scan the batch, click Send.
 *
 * Safety:
 * - Read-only on draft files
 * - Writes only to `outreach-data/lhl/mailmeteor-batch.csv` (gitignored;
 *   contains personalized email content, kept out of git so we don't
 *   commit the same recipient block on every regen)
 * - Prints a summary of approved + skipped drafts so you can verify the
 *   batch before importing
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const DRAFTS_DIR = join(REPO_ROOT, "outreach-data", "lhl", "drafts");
const OUTPUT_CSV = join(REPO_ROOT, "outreach-data", "lhl", "mailmeteor-batch.csv");

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  const [, fm, body] = match;
  const fields = {};
  for (const line of fm.split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    value = value.replace(/^'(.*)'$/, "$1").replace(/^"(.*)"$/, "$1");
    fields[m[1]] = value;
  }
  return { fm: fields, body: body.trim() };
}

function extractSubject(body) {
  const m = body.match(/^Subject:\s*(.*?)\s*$/m);
  return m ? m[1].trim() : null;
}

function extractBodyText(body) {
  const noSubject = body.replace(/^Subject:.*\r?\n\r?\n?/m, "");
  return noSubject.trim();
}

function escapeCSV(value) {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function main() {
  const files = readdirSync(DRAFTS_DIR)
    .filter((f) => f.endsWith(".md") && !f.startsWith("."))
    .sort();

  const approved = [];
  const skipped = [];

  for (const file of files) {
    const path = join(DRAFTS_DIR, file);
    const text = readFileSync(path, "utf8");
    const parsed = parseFrontmatter(text);
    if (!parsed) {
      skipped.push({ file, reason: "no frontmatter" });
      continue;
    }

    const status = parsed.fm.status || "(missing)";
    if (status !== "approved") {
      skipped.push({ file, reason: `status=${status}` });
      continue;
    }

    const email = parsed.fm.contact;
    if (!email || !email.includes("@")) {
      skipped.push({ file, reason: `contact missing or not an email: ${email}` });
      continue;
    }

    const subject = extractSubject(parsed.body);
    const bodyText = extractBodyText(parsed.body);
    if (!subject) {
      skipped.push({ file, reason: "missing Subject: line in body" });
      continue;
    }
    if (!bodyText) {
      skipped.push({ file, reason: "empty body after subject" });
      continue;
    }

    approved.push({
      email,
      subject,
      body: bodyText,
      handle: parsed.fm.handle || "",
      variant_id: parsed.fm.variant_id || "",
      angle_tag: parsed.fm.angle_tag || "",
      file,
    });
  }

  const headers = ["email", "subject", "body", "handle", "variant_id", "angle_tag"];
  const rows = [headers.join(",")];
  for (const r of approved) {
    rows.push(headers.map((h) => escapeCSV(r[h])).join(","));
  }
  const csv = rows.join("\n") + "\n";

  mkdirSync(dirname(OUTPUT_CSV), { recursive: true });
  writeFileSync(OUTPUT_CSV, csv);

  console.log("");
  console.log(`Wrote ${approved.length} approved draft(s) to:`);
  console.log(`  ${OUTPUT_CSV}`);
  console.log("");

  if (approved.length > 0) {
    console.log("Approved (will be in CSV):");
    for (const r of approved) {
      console.log(`  ${r.handle.padEnd(35)} → ${r.email}  [${r.angle_tag}]`);
    }
    console.log("");
  }

  if (skipped.length > 0) {
    console.log(`Skipped: ${skipped.length}`);
    for (const s of skipped) {
      console.log(`  ${s.file}: ${s.reason}`);
    }
    console.log("");
  }

  if (approved.length === 0) {
    console.log("No drafts at status `approved`. To approve a draft:");
    console.log("  1. Open the .md file in outreach-data/lhl/drafts/");
    console.log("  2. Edit the frontmatter: status: copy-reviewed → status: approved");
    console.log("  3. Save and re-run this script");
    return;
  }

  console.log("Next steps:");
  console.log("  1. Open a Google Sheet (new or existing)");
  console.log("  2. File → Import → Upload → select mailmeteor-batch.csv");
  console.log("  3. Open the Mailmeteor add-on (Extensions → Mailmeteor)");
  console.log("  4. Scan the batch, then click Send");
  console.log("  5. After sending: edit each draft's frontmatter to status: sent");
  console.log("");
}

main();
