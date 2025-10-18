export type ReviewStage = 'preBria' | 'postBria' | 'postPdf';

export interface Asset {
  key: string;
  size: number;
  lastModified: string;
  previewUrl: string;
  downloadUrl: string;
}

export interface AssetListResponse {
  prefix: string;
  stage: ReviewStage;
  files: Asset[];
}

export interface PresignPutRequest {
  key: string;
  contentType: string;
  stage: ReviewStage;
}

export interface PresignPutResponse {
  method: 'PUT';
  url: string;
  key: string;
  stage: ReviewStage;
}

export interface ApproveRequest {
  prefix: string;
  reviewer: string;
  stage: ReviewStage;
}

export interface ApproveResponse {
  ok: boolean;
  message: string;
}

