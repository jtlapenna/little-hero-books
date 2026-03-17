declare module 'pngjs' {
  export const PNG: {
    sync: {
      read(
        buffer: Buffer,
        options?: { skipRescale?: boolean },
      ): {
        width: number;
        height: number;
        data: Uint8Array;
      };
    };
  };
}
