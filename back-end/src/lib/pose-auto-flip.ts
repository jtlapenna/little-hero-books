import { AUTO_FLIP_SUPPORTED_POSES } from '@/lib/auto-flip-pose';
import { detectImageFormat, flipPngHorizontally } from '@/lib/image-flip';
import { encode } from 'fast-png';
import jpeg from 'jpeg-js';

export type PoseAutoFlipStage = 'preBria' | 'postBria' | 'postPdf';

export class PoseAutoFlipFormatError extends Error {
  readonly code = 'POSE_AUTO_FLIP_UNSUPPORTED_FORMAT';
  readonly format: string;

  constructor(format: string) {
    super(`POSE_AUTO_FLIP_UNSUPPORTED_FORMAT:${format}`);
    this.format = format;
  }
}

export function shouldAutoFlipPoseUpload(stage: PoseAutoFlipStage, poseNumber: number): boolean {
  return stage === 'preBria' && AUTO_FLIP_SUPPORTED_POSES.has(poseNumber);
}

export async function transformPoseUploadBuffer(input: {
  stage: PoseAutoFlipStage;
  poseNumber: number;
  buffer: Buffer;
}): Promise<{ buffer: Buffer; flipped: boolean; format: string; contentType: string }> {
  const { stage, poseNumber, buffer } = input;
  const format = detectImageFormat(buffer);

  if (!shouldAutoFlipPoseUpload(stage, poseNumber)) {
    return {
      buffer,
      flipped: false,
      format,
      contentType: format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png',
    };
  }

  if (format === 'png') {
    return {
      buffer: flipPngHorizontally(buffer),
      flipped: true,
      format,
      contentType: 'image/png',
    };
  }

  if (format === 'jpeg' || format === 'webp') {
    if (format === 'webp') {
      throw new PoseAutoFlipFormatError(format);
    }
    const decoded = jpeg.decode(buffer, { useTArray: true });
    const normalizedPng = Buffer.from(
      encode({
        width: decoded.width,
        height: decoded.height,
        data: decoded.data,
        channels: 4,
        depth: 8,
      }),
    );
    return {
      buffer: flipPngHorizontally(normalizedPng),
      flipped: true,
      format,
      contentType: 'image/png',
    };
  }

  throw new PoseAutoFlipFormatError(format);
}
