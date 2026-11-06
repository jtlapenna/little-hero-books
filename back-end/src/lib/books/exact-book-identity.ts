/**
 * Disconnected reader for public.lhl_strict_book_identity(p_book_id). The SQL
 * function owns collision classification. This parser does not prove the
 * reader contacted that function or establish intake or publication authority.
 */
export interface ExactBookIdentityReader {
  readIdentity(identity: string): Promise<unknown>;
}

export interface ExactBookIdentitySupabaseClient {
  rpc(
    name: 'lhl_strict_book_identity',
    args: { p_book_id: string },
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

/** This adapter is unused by live routes. Database access and privileges require separate validation. */
export function createExactBookIdentitySupabaseReader(client: ExactBookIdentitySupabaseClient): ExactBookIdentityReader {
  return {
    async readIdentity(identity) {
      const response = await client.rpc('lhl_strict_book_identity', { p_book_id: identity });
      if (!isRecord(response) || !Object.hasOwn(response, 'data') || !Object.hasOwn(response, 'error') || response.error !== null) {
        throw new Error('Identity RPC unavailable');
      }
      return response.data;
    },
  };
}

export type ExactBookIdentityResult =
  | { status: 'found'; row: Record<string, unknown> }
  | { status: 'absent' }
  | { status: 'ambiguous' }
  | { status: 'unavailable' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIdentity(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

export async function lookupExactBookIdentity(
  identity: unknown,
  reader: ExactBookIdentityReader,
): Promise<ExactBookIdentityResult> {
  if (!isIdentity(identity)) return { status: 'unavailable' };

  try {
    const result = await reader.readIdentity(identity);
    if (!isRecord(result)) return { status: 'unavailable' };
    if (result.status === 'found') {
      const row = result.row;
      if (!isRecord(row)) return { status: 'unavailable' };
      if (!isIdentity(row.id)) {
        return { status: 'unavailable' };
      }
      const a = row.orderId;
      const b = row.order_id;
      if ((a != null && !isIdentity(a)) || (b != null && !isIdentity(b))) return { status: 'unavailable' };
      if (a !== identity && b !== identity) return { status: 'unavailable' };
      if (a != null && b != null && a !== b) return { status: 'unavailable' };
      return { status: 'found', row };
    }
    if (Object.hasOwn(result, 'row')) return { status: 'unavailable' };
    if (result.status === 'absent') return { status: 'absent' };
    if (result.status === 'ambiguous') return { status: 'ambiguous' };
    return { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}
