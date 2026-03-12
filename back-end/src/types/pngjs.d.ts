declare module 'pngjs' {
  export class PNG {
    width: number;
    height: number;
    data: Buffer;
    colorType?: number;
    inputHasAlpha?: boolean;

    constructor(options?: {
      width?: number;
      height?: number;
      colorType?: number;
      inputHasAlpha?: boolean;
    });

    static sync: {
      read(buffer: Buffer): PNG;
      write(png: PNG): Buffer;
    };
  }
}
