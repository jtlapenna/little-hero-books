export interface Customer {
  firstName: string;
  lastName: string;
  email: string;
}

export interface ReviewStage {
  status: 'pending' | 'in-review' | 'approved' | 'rejected';
  reviewedAt?: string;
  reviewer?: string;
  comments?: string;
}

export interface Order {
  orderId: string;
  platform: string;
  amazonOrderId?: string;
  project: string;
  customer: Customer;
  customerEmail?: string;
  orderDate: string;
  status: string;
  aiGenerationStartedAt?: string;
  characterHash?: string;
  characterPath?: string;
  templatePath?: string;
  characterSpecs: Record<string, any>;
  bookSpecs: Record<string, any>;
  orderDetails: Record<string, any>;
  assetPrefix: string;
  reviewStages: {
    preBria: ReviewStage;
    postBria: ReviewStage;
    postPdf: ReviewStage;
  };
  webhooks: {
    onApprove: string;
  };
  r2Assets?: {
    characterHash: string;
    baseCharacter: any;
    poses: any[];
    baseCharacterBgRemoved: any;
    posesBgRemoved: any[];
  };
}

export interface OrderListItem {
  orderId: string;
  platform: string;
  firstName: string;
  lastName: string;
  status: string;
  orderDate: string;
  characterHash?: string;
}

export interface OrdersResponse {
  items: OrderListItem[];
  page: number;
  pageSize: number;
  total: number;
}

