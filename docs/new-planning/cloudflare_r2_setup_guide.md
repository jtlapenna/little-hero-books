# Cloudflare R2 Setup Guide for Little Hero Books

## 📋 Overview

This guide walks through setting up Cloudflare R2 storage for the Little Hero Books project, including both static assets and dynamic order content.

## 🎯 R2 Bucket Structure

### **Bucket 1: `little-hero-assets` (Static Assets)**
**Purpose**: Store consistent, reusable assets that don't change per order
**Access**: Public (for n8n to read directly)
**Contents**:
- Background images (16 pages)
- Base character poses (12 poses) 
- Animal companion images (7 animals × 12 poses)
- Reference images and templates

### **Bucket 2: `little-hero-orders` (Generated Content)**
**Purpose**: Store generated, order-specific content
**Access**: Private (signed URLs for security)
**Contents**:
- Generated character images per order
- Final PDFs
- Order-specific assets
- Temporary processing files

## 📁 File Structure

```
little-hero-assets/
├── book-mvp-simple-adventure/          # MVP Book (Ultra Simple)
│   ├── backgrounds/                    # (empty - to be designed)
│   ├── characters/
│   │   ├── base-character.png         # (empty - to be designed)
│   │   └── poses/                     # (empty - to be designed)
│   └── story/
│       └── story-template.json        # (empty - to be created)
├── book-002-animal-guide/              # Animal Guide Book
│   ├── backgrounds/
│   │   ├── page01.png                 # ✅ Uploaded
│   │   ├── page02.png                 # ✅ Uploaded
│   │   └── ... (16 pages)             # ✅ All uploaded
│   ├── characters/
│   │   ├── base-character.png         # ✅ Uploaded
│   │   └── poses/
│   │       └── pose01.png             # ✅ Uploaded
│   └── story/
│       └── story-template.json        # (to be created)
└── shared/
    ├── fonts/
    ├── templates/
    └── styles/

little-hero-orders/
├── [order-id]/
│   ├── base_character.png
│   ├── pose01.png
│   ├── pose02.png
│   ├── pose03.png
│   ├── pose04.png
│   ├── pose05.png
│   ├── pose06.png
│   ├── pose07.png
│   ├── pose08.png
│   ├── pose09.png
│   ├── pose10.png
│   ├── pose11.png
│   ├── pose12.png
│   └── final_book.pdf
└── temp/
    └── processing files
```

## 🔧 Setup Steps

### **Step 1: Install Wrangler CLI**
```bash
npm install -g wrangler
```

### **Step 2: Login to Cloudflare**
```bash
wrangler login
```

### **Step 3: Create R2 Buckets**
```bash
# Create assets bucket (public)
wrangler r2 bucket create little-hero-assets

# Create orders bucket (private)
wrangler r2 bucket create little-hero-orders
```

### **Step 4: Configure Bucket Settings**

#### **Assets Bucket (Public)**
- **Public Access**: Enabled
- **CORS**: Configured for web access
- **Cache TTL**: 1 year (assets rarely change)

#### **Orders Bucket (Private)**
- **Public Access**: Disabled
- **CORS**: Limited configuration
- **Cache TTL**: 1 hour (frequently accessed)

### **Step 5: Upload Static Assets**

#### **Background Images**
```bash
# Upload all 16 background images
wrangler r2 object put little-hero-assets/backgrounds/page01.png --file=assets/images/page01.png
wrangler r2 object put little-hero-assets/backgrounds/page02.png --file=assets/images/page02.png
# ... continue for all 16 pages
```

#### **Pose References**
```bash
# Upload pose reference images
wrangler r2 object put little-hero-assets/poses/pose01.png --file=assets/poses/pose_pose01.png
# ... continue for all 12 poses
```

#### **Animal Images** (when available)
```bash
# Upload animal images for each animal type
wrangler r2 object put little-hero-assets/animals/dog/pose01.png --file=assets/animals/dog_pose01.png
# ... continue for all animals and poses
```

### **Step 6: Configure n8n R2 Credentials**

In n8n, add R2 credentials:
- **Credential Name**: `cloudflare-r2`
- **Access Key ID**: From R2 dashboard
- **Secret Access Key**: From R2 dashboard
- **Endpoint**: `https://[account-id].r2.cloudflarestorage.com`
- **Region**: `auto`

### **Step 7: Test R2 Access**

#### **Test Assets Bucket**
```bash
# List objects in assets bucket
wrangler r2 object list little-hero-assets

# Get a specific object
wrangler r2 object get little-hero-assets/backgrounds/page01.png --file=test-download.png
```

#### **Test Orders Bucket**
```bash
# List objects in orders bucket
wrangler r2 object list little-hero-orders
```

## 🔗 n8n Node Configuration

### **Load Base Character Reference (Animal Guide Book)**
- **Node Type**: HTTP Request
- **Method**: GET
- **URL**: `https://3daae940fcb6fc5b8bbd9bb8fcc62854.r2.cloudflarestorage.com/little-hero-assets/book-002-animal-guide/characters/base-character.png`
- **Authentication**: Cloudflare R2 Storage

### **Load Pose Reference (Animal Guide Book)**
- **Node Type**: HTTP Request
- **Method**: GET
- **URL**: `https://3daae940fcb6fc5b8bbd9bb8fcc62854.r2.cloudflarestorage.com/little-hero-assets/book-002-animal-guide/characters/poses/pose{{ $json.currentPoseNumber }}.png`
- **Authentication**: Cloudflare R2 Storage

### **Load Background Image (Animal Guide Book)**
- **Node Type**: HTTP Request
- **Method**: GET
- **URL**: `https://3daae940fcb6fc5b8bbd9bb8fcc62854.r2.cloudflarestorage.com/little-hero-assets/book-002-animal-guide/backgrounds/page{{ $json.pageNumber }}.png`
- **Authentication**: Cloudflare R2 Storage

### **Load Animal Image (Animal Guide Book)**
- **Node Type**: HTTP Request
- **Method**: GET
- **URL**: `https://3daae940fcb6fc5b8bbd9bb8fcc62854.r2.cloudflarestorage.com/little-hero-assets/book-002-animal-guide/animals/{{ $json.characterSpecs.animalGuide }}/pose{{ $json.currentPoseNumber }}.png`
- **Authentication**: Cloudflare R2 Storage

### **Save Generated Character**
- **Node Type**: Cloudflare R2
- **Operation**: Put Object
- **Bucket**: `little-hero-orders`
- **Key**: `{{ $json.amazonOrderId }}/pose{{ $json.currentPoseNumber }}.png`

### **Save Final PDF**
- **Node Type**: Cloudflare R2
- **Operation**: Put Object
- **Bucket**: `little-hero-orders`
- **Key**: `{{ $json.amazonOrderId }}/final_book.pdf`

## 💰 Cost Estimation

### **Storage Costs**
- **Assets Bucket**: ~100MB = $0.0015/month
- **Orders Bucket**: ~50MB per order = $0.00075 per order
- **Total Storage**: <$1/month for 1000 orders

### **Request Costs**
- **Class A Operations** (PUT, POST, DELETE): $4.50 per million
- **Class B Operations** (GET, HEAD): $0.36 per million
- **Total Requests**: <$1/month for 1000 orders

### **Bandwidth Costs**
- **Egress**: $0.09 per GB
- **Total Bandwidth**: <$1/month for 1000 orders

**Total Estimated Cost**: <$3/month for 1000 orders

## 🔒 Security Considerations

### **Assets Bucket (Public)**
- Safe to be public (no sensitive data)
- CORS configured for web access
- Long cache TTL for performance

### **Orders Bucket (Private)**
- Private access only
- Use signed URLs for temporary access
- Short-lived URLs for security
- Regular cleanup of old orders

## 📊 Monitoring & Maintenance

### **Monitoring**
- Track storage usage
- Monitor request patterns
- Set up alerts for unusual activity

### **Maintenance**
- Regular cleanup of old orders
- Monitor costs
- Update CORS settings as needed

## 🚀 Next Steps

1. Complete R2 setup
2. Upload all static assets
3. Configure n8n credentials
4. Test workflow with R2 nodes
5. Set up monitoring and alerts
