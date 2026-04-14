/**
 * Active D2C storefront book selection.
 *
 * Phase 0 storefront currently sells a single book/format, so the frontend
 * must pass that identity explicitly to preview generation and checkout.
 */

type FrontendBookEnv = {
  PUBLIC_D2C_BOOK_ID?: string;
  PUBLIC_D2C_FORMAT_ID?: string;
};

function trimToString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

const frontendEnv = (import.meta as ImportMeta & { env?: FrontendBookEnv }).env;

export const D2C_BOOK_ID =
  trimToString(frontendEnv?.PUBLIC_D2C_BOOK_ID) || 'book-mvp-simple-adventure';

export const D2C_FORMAT_ID =
  trimToString(frontendEnv?.PUBLIC_D2C_FORMAT_ID) || 'standard';

export function getActiveD2CBookConfig(): { bookId: string; formatId: string } {
  return {
    bookId: D2C_BOOK_ID,
    formatId: D2C_FORMAT_ID,
  };
}
