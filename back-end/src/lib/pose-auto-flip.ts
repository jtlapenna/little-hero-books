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

export function shouldAutoFlipPoseUpload(stage: PoseAutoFlipStage, poseNumber: number): boolean {
  return stage === 'preBria' && AUTO_FLIP_SUPPORTED_POSES.has(poseNumber);
}

export function transformPoseUploadBuffer(input: {
  stage: PoseAutoFlipStage;
  poseNumber: number;
  buffer: Buffer;
}): { buffer: Buffer; flipped: boolean; format: string } {
  const { stage, poseNumber, buffer } = input;
  const format = detectImageFormat(buffer);

  if (!shouldAutoFlipPoseUpload(stage, poseNumber)) {
    return { buffer, flipped: false, format };
  }

  if (format !== 'png') {
    throw new PoseAutoFlipFormatError(format);
  }

  return {
    buffer: flipPngHorizontally(buffer),
    flipped: true,
    format,
  };
}
