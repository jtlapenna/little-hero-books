export type W3PageSelection = number | number[];
export function parseW3PageSelection(
  value: unknown,
  fallback = 0,
): W3PageSelection {
  if (value == null) return fallback;
  if (Array.isArray(value)) {
    if (value.some(page => (typeof page !== "number" && typeof page !== "string") || (typeof page === "string" && !page.trim()))) throw new Error("Invalid W3 page selector value");
    const pages = value.map(Number);
    if (pages.some((page) => !Number.isInteger(page) || page < 0))
      throw new Error(
        "W3 test page selection must contain nonnegative integer page indices",
      );
    return [...new Set(pages)];
  }
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !value.trim())) throw new Error("Invalid W3 page selector value");
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 0)
    throw new Error("W3 test page limit must be a nonnegative integer");
  return limit;
}
export function selectW3Pages<T extends { index: number }>(
  pages: T[],
  selection: W3PageSelection,
): T[] {
  if (Array.isArray(selection) && selection.length) {
    const available = new Set(pages.map((page) => page.index));
    if (selection.some((index) => !available.has(index)))
      throw new Error("W3 test selection includes an unknown page index");
    return pages.filter((page) => selection.includes(page.index));
  }
  return typeof selection === "number" && selection > 0
    ? pages.slice(0, selection)
    : pages;
}
