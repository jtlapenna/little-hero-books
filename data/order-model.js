/**
 * Little Hero Books - Order Data Model
 * 
 * Data model matching the n8n specification for order tracking
 * This will be used by n8n workflows for order management
 */

// Order data model as specified in the original requirements
const OrderModel = {
  // Amazon order information
  orderId: {
    type: 'string',
    required: true,
    description: 'Amazon order ID'
  },
  
  orderDate: {
    type: 'string',
    required: true,
    description: 'ISO timestamp of order placement'
  },
  
  marketplaceId: {
    type: 'string',
    required: true,
    description: 'Amazon marketplace identifier'
  },
  
  buyerMaskedEmail: {
    type: 'string',
    required: false,
    description: 'Masked buyer email from Amazon'
  },
  
  // Customer personalization inputs
  customerInputs: {
    name: {
      type: 'string',
      required: true,
      maxLength: 20,
      description: 'Child\'s name'
    },
    age: {
      type: 'number',
      required: true,
      min: 0,
      max: 10,
      description: 'Child\'s age'
    },
    hair: {
      type: 'string',
      required: true,
      enum: ['blonde', 'brown', 'black', 'red', 'gray'],
      description: 'Child\'s hair color'
    },
    skin: {
      type: 'string',
      required: true,
      enum: ['light', 'medium', 'dark'],
      description: 'Child\'s skin tone'
    },
    favColor: {
      type: 'string',
      required: false,
      default: 'blue',
      description: 'Child\'s favorite color'
    },
    favAnimal: {
      type: 'string',
      required: false,
      default: 'fox',
      description: 'Child\'s favorite animal'
    },
    hometown: {
      type: 'string',
      required: false,
      default: 'Adventure City',
      description: 'Child\'s hometown'
    },
    dedication: {
      type: 'string',
      required: false,
      maxLength: 200,
      description: 'Custom dedication message'
    },
    occasion: {
      type: 'string',
      required: false,
      enum: ['general', 'birthday', 'holiday', 'graduation', 'milestone'],
      default: 'general',
      description: 'Special occasion'
    }
  },
  
  // Generated files
  files: {
    bookPdfUrl: {
      type: 'string',
      required: true,
      description: 'URL to generated book PDF'
    },
    coverPdfUrl: {
      type: 'string',
      required: true,
      description: 'URL to generated cover PDF'
    },
    thumbUrl: {
      type: 'string',
      required: false,
      description: 'URL to book thumbnail image'
    }
  },
  
  // POD (Print on Demand) information
  pod: {
    podOrderId: {
      type: 'string',
      required: false,
      description: 'POD provider order ID'
    },
    status: {
      type: 'string',
      required: true,
      enum: ['pending', 'submitted', 'in_production', 'shipped', 'delivered', 'failed'],
      default: 'pending',
      description: 'POD order status'
    },
    shipMethod: {
      type: 'string',
      required: false,
      default: 'economy',
      description: 'Shipping method'
    }
  },
  
  // Shipping information
  shipping: {
    name: {
      type: 'string',
      required: true,
      description: 'Shipping recipient name'
    },
    address1: {
      type: 'string',
      required: true,
      description: 'Primary address line'
    },
    address2: {
      type: 'string',
      required: false,
      description: 'Secondary address line'
    },
    city: {
      type: 'string',
      required: true,
      description: 'City'
    },
    state: {
      type: 'string',
      required: true,
      description: 'State/Province'
    },
    zip: {
      type: 'string',
      required: true,
      description: 'ZIP/Postal code'
    },
    country: {
      type: 'string',
      required: true,
      default: 'US',
      description: 'Country code'
    },
    phone: {
      type: 'string',
      required: false,
      description: 'Phone number'
    }
  },
  
  // Tracking information
  tracking: {
    carrier: {
      type: 'string',
      required: false,
      description: 'Shipping carrier'
    },
    trackingNumber: {
      type: 'string',
      required: false,
      description: 'Tracking number'
    },
    shipDate: {
      type: 'string',
      required: false,
      description: 'Ship date ISO timestamp'
    },
    deliveredDate: {
      type: 'string',
      required: false,
      description: 'Delivery date ISO timestamp'
    }
  },
  
  // Operations metadata
  ops: {
    createdAt: {
      type: 'string',
      required: true,
      description: 'Order creation timestamp'
    },
    updatedAt: {
      type: 'string',
      required: true,
      description: 'Last update timestamp'
    },
    errorState: {
      type: 'string',
      required: false,
      description: 'Error state if any'
    },
    notes: {
      type: 'string',
      required: false,
      description: 'Operational notes'
    }
  }
};

// Example order structure for n8n workflows
const ExampleOrder = {
  orderId: '123-4567890-1234567',
  orderDate: '2025-01-24T10:30:00Z',
  marketplaceId: 'ATVPDKIKX0DER',
  buyerMaskedEmail: 'a***@example.com',
  
  customerInputs: {
    name: 'Emma',
    age: 5,
    hair: 'blonde',
    skin: 'light',
    favColor: 'purple',
    favAnimal: 'dragon',
    hometown: 'Portland',
    dedication: 'For our little adventurer on her 5th birthday!',
    occasion: 'birthday'
  },
  
  files: {
    bookPdfUrl: 'https://storage.example.com/orders/123-4567890-1234567/book.pdf',
    coverPdfUrl: 'https://storage.example.com/orders/123-4567890-1234567/cover.pdf',
    thumbUrl: 'https://storage.example.com/orders/123-4567890-1234567/thumb.jpg'
  },
  
  pod: {
    podOrderId: 'POD-789012',
    status: 'submitted',
    shipMethod: 'economy'
  },
  
  shipping: {
    name: 'Jane Smith',
    address1: '123 Main Street',
    address2: 'Apt 4B',
    city: 'Portland',
    state: 'OR',
    zip: '97201',
    country: 'US',
    phone: '+1-555-123-4567'
  },
  
  tracking: {
    carrier: 'UPS',
    trackingNumber: '1Z999AA1234567890',
    shipDate: '2025-01-25T14:30:00Z'
  },
  
  ops: {
    createdAt: '2025-01-24T10:30:00Z',
    updatedAt: '2025-01-25T14:30:00Z',
    errorState: null,
    notes: 'Order processed successfully'
  }
};

// Validation function for order data
function validateOrder(order) {
  const errors = [];
  
  // Check required fields
  if (!order.orderId) errors.push('orderId is required');
  if (!order.orderDate) errors.push('orderDate is required');
  if (!order.customerInputs?.name) errors.push('customerInputs.name is required');
  if (!order.customerInputs?.age) errors.push('customerInputs.age is required');
  if (!order.shipping?.name) errors.push('shipping.name is required');
  
  // Check customer inputs
  if (order.customerInputs?.age < 0 || order.customerInputs?.age > 10) {
    errors.push('customerInputs.age must be between 0 and 10');
  }
  
  if (order.customerInputs?.name && order.customerInputs.name.length > 20) {
    errors.push('customerInputs.name must be 20 characters or less');
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
}

// Export for use in n8n workflows
export {
  OrderModel,
  ExampleOrder,
  validateOrder
};

// For CommonJS compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    OrderModel,
    ExampleOrder,
    validateOrder
  };
}
