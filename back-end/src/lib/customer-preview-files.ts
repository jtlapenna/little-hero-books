import { isPreviewImageKey, createPreviewImageGrant } from './preview-file-grants';

type JsonRecord = Record<string, unknown>;
type PreviewPage = { pageNumber: number; pageLabel: string; imageUrl: string };
const record = (value: unknown): JsonRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
const label = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/^p00_dedication$/, 'p00');
  return /^p\d{2,3}$/.test(normalized) ? normalized : null;
};

/** Minimize the trusted producer manifest; never return its internal fields or URLs. */
export async function buildCustomerPreviewFiles(raw: unknown, prefix: string, tokenExpiresAt: string) {
  const outer = record(Array.isArray(raw) ? raw[0] : raw);
  const manifest = Object.keys(record(outer.manifest)).length ? record(outer.manifest) : outer;
  const png = record(manifest.pngGeneration ?? outer.pngGeneration);
  const planValue = manifest.pagePlan ?? outer.pagePlan;
  const plan = (Array.isArray(planValue) ? planValue : []).map(record);
  const planByLabel = new Map(plan.map((page) => [label(page.label), page]));
  const expected = new Set<string>();
  let invalid = false;
  for (const page of plan) {
    const pageLabel = label(page.label);
    if (pageLabel) expected.add(pageLabel);
    else invalid = true;
  }
  // Legacy W3 exports use pageLabels with an empty pagePlan. Images never define completeness.
  const legacyLabels = manifest.pageLabels ?? outer.pageLabels;
  if (Array.isArray(legacyLabels)) {
    for (const rawLabel of legacyLabels) {
      const pageLabel = label(rawLabel);
      if (pageLabel) expected.add(pageLabel); else invalid = true;
    }
  } else if (legacyLabels != null) invalid = true;
  const imagesValue = manifest.pagePreviewImages ?? outer.pagePreviewImages ?? record(manifest.bookAssembly).pagePreviewImages;
  const images = (Array.isArray(imagesValue) ? imagesValue : []).map(record);
  const candidates: JsonRecord[] = [...images];
  for (const [pageLabel, key] of Object.entries(record(png.pages))) candidates.push({ pageLabel, r2Key: key });
  const selected = new Map<string, { pageNumber: number; key: string }>();
  for (const image of candidates) {
    const pageLabel = label(image.pageLabel ?? image.originalKey ?? image.label) ??
      (Number.isInteger(image.pageNumber) && Number(image.pageNumber) >= 0 ? `p${String(image.pageNumber).padStart(2, '0')}` : null);
    if (!pageLabel) { invalid = true; continue; }
    const meta = planByLabel.get(pageLabel);
    const number = Number(meta?.index ?? image.pageNumber ?? pageLabel.slice(1));
    const key = image.r2Key ?? image.pageImageR2Key ?? image.imageR2Key ?? image.key ?? image.path;
    if (!expected.has(pageLabel)) invalid = true;
    if (!Number.isInteger(number) || number < 0 || typeof key !== 'string' || !isPreviewImageKey(key, prefix)) { invalid = true; continue; }
    const previous = selected.get(pageLabel);
    if (previous && previous.key !== key) { invalid = true; continue; }
    selected.set(pageLabel, { pageNumber: number, key });
  }
  const coverKey = png.coverSpreadImage ?? png.coverImageR2Key ?? outer.coverImageR2Key ?? outer.coverPngR2Key ?? manifest.coverImageR2Key;
  const validCover = typeof coverKey === 'string' && isPreviewImageKey(coverKey, prefix) ? coverKey : null;
  const entries = [...selected].sort((a, b) => a[1].pageNumber - b[1].pageNumber);
  const pages: PreviewPage[] = [];
  let expiresAt: string | null = null;
  const imageUrl = async (key: string) => {
    const signed = await createPreviewImageGrant(key, tokenExpiresAt);
    expiresAt = !expiresAt || signed.expiresAt < expiresAt ? signed.expiresAt : expiresAt;
    return `/api/assets/${key}?previewGrant=${encodeURIComponent(signed.grant)}`;
  };
  for (const [pageLabel, page] of entries) pages.push({ pageNumber: page.pageNumber, pageLabel, imageUrl: await imageUrl(page.key) });
  const coverImageUrl = validCover ? await imageUrl(validCover) : null;
  const summary = record(manifest.summary ?? outer.summary);
  const ready = expected.size > 0 && !invalid && !!validCover && pages.length > 0 && [...expected].every((key) => selected.has(key)) && summary.readyForBook !== false && manifest.testOnly !== true && outer.testOnly !== true;
  return { pages, coverImageUrl, ready, expiresAt };
}
