// Minimal ambient declarations for dependencies that ship without type
// declarations. Type-only; no runtime effect.
declare module 'papaparse' {
  interface ParseError {
    type: string;
    code: string;
    message: string;
    row?: number;
  }
  interface ParseConfig {
    header?: boolean;
    skipEmptyLines?: boolean | 'greedy';
    delimiter?: string;
    transformHeader?: (header: string, index: number) => string;
    [key: string]: unknown;
  }
  interface ParseResult<T> {
    data: T[];
    errors: ParseError[];
    meta: Record<string, unknown>;
  }
  const Papa: {
    parse<T = unknown>(input: string, config?: ParseConfig): ParseResult<T>;
  };
  export default Papa;
}

declare module 'adm-zip' {
  class AdmZip {
    constructor(input?: string | Buffer, options?: Record<string, unknown>);
    addFile(entryName: string, content: Buffer, comment?: string, attr?: number): void;
    toBuffer(): Buffer;
    [key: string]: any;
  }
  export default AdmZip;
}
