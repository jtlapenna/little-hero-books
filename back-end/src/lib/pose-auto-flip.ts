import { AUTO_FLIP_SUPPORTED_POSES } from '@/lib/auto-flip-pose';
import { detectImageFormat, flipPngHorizontally } from '@/lib/image-flip';

export type PoseAutoFlipStage = 'preBria' | 'postBria' | 'postPdf';

export class PoseAutoFlipFormatError extends Error {
  readonly code = 'POSE_AUTO_FLIP_UNSUPPORTED_FORMAT';
  readonly format: string;

  constructor(format: string) {
    super(`POSE_AUTO_FLIP_UNSUPPORTED_FORMAT:${format}`);
    this.format = format;
  }
}

let sharpModulePromise: Promise<typeof import('sharp')> | null = null;

async function loadSharp() {
  if (!sharpModulePromise) {
    sharpModulePromise = import('sharp');
  }
  return sharpModulePromise;
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
    const sharpModule = await loadSharp();
    const sharp = sharpModule.default;
    const normalizedPng = await sharp(buffer).png().toBuffer();
    return {
      buffer: flipPngHorizontally(normalizedPng),
      flipped: true,
      format,
      contentType: 'image/png',
    };
  }

  throw new PoseAutoFlipFormatError(format);
}
