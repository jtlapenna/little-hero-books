# R2 Bucket Reorganization - CLI Options

## 🎯 **Goal**
Reorganize the `little-hero-assets` R2 bucket to have a cleaner structure under `book-mvp-simple-adventure/`.

## 📁 **Current Structure**
```
little-hero-assets/
├── fonts/
├── overlays/
├── characters/
└── book-mvp-simple-adventure/
    └── backgrounds/
```

## 🎯 **Target Structure**
```
little-hero-assets/
└── book-mvp-simple-adventure/
    ├── fonts/
    ├── overlays/
    ├── backgrounds/
    └── order-generated-assets/
        └── characters/
```

## 🔧 **CLI Options**

### **Option 1: Using s3cmd (Recommended)**

#### **Installation:**
```bash
pip install s3cmd
```

#### **Configuration:**
The script will automatically configure s3cmd with your R2 credentials.

#### **Usage:**
```bash
# Edit the script to add your credentials
nano scripts/reorganize-r2-s3cmd.sh

# Update these variables:
ACCESS_KEY_ID="your-access-key-id"
SECRET_ACCESS_KEY="your-secret-access-key"

# Run the script
./scripts/reorganize-r2-s3cmd.sh
```

### **Option 2: Using AWS CLI**

#### **Installation:**
```bash
# macOS
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

#### **Configuration:**
The script will automatically configure AWS CLI with your R2 credentials.

#### **Usage:**
```bash
# Edit the script to add your credentials
nano scripts/reorganize-r2-awscli.sh

# Update these variables:
ACCESS_KEY_ID="your-access-key-id"
SECRET_ACCESS_KEY="your-secret-access-key"

# Run the script
./scripts/reorganize-r2-awscli.sh
```

## 🔑 **Getting Your R2 Credentials**

1. Go to Cloudflare Dashboard → R2 Object Storage
2. Click "Manage R2 API tokens"
3. Create a new API token with R2 permissions
4. Copy the Access Key ID and Secret Access Key

## 📋 **What the Scripts Do**

1. **Install and configure** the CLI tool for R2
2. **List all files** in each source directory
3. **Copy files** to the new directory structure
4. **Verify** the copy was successful
5. **Provide commands** to delete original directories

## 🔗 **New Asset URLs (After Reorganization)**

After the reorganization, the workflow will use these URLs:

- **Font**: `https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/fonts/custom-font.ttf`
- **Text Box**: `https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/overlays/text-boxes/standard-box.png`
- **Backgrounds**: `https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/backgrounds/page1_background.png`
- **Characters**: `https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/order-generated-assets/characters/6ec1cd52dce77992/characters_6ec1cd52dce77992_pose01.png`

## ⚠️ **Important Notes**

1. **Test First**: The scripts will copy files first, then you can delete originals after verification
2. **Backup**: Consider keeping the original directories until you're sure everything works
3. **Credentials**: Make sure to update the credential variables in the scripts
4. **Verification**: Check the R2 dashboard to verify all files were copied correctly

## 🚀 **Quick Start**

1. **Choose your preferred CLI tool** (s3cmd or AWS CLI)
2. **Edit the script** to add your R2 credentials
3. **Run the script**: `./scripts/reorganize-r2-s3cmd.sh` or `./scripts/reorganize-r2-awscli.sh`
4. **Verify** in the R2 dashboard that files were copied correctly
5. **Delete originals** using the provided commands
6. **Update workflow** URLs to match the new structure

## 🔍 **Manual Commands (If Needed)**

### **s3cmd Commands:**
```bash
# List files
s3cmd ls s3://little-hero-assets/fonts/

# Copy file
s3cmd cp s3://little-hero-assets/fonts/custom-font.ttf s3://little-hero-assets/book-mvp-simple-adventure/fonts/custom-font.ttf

# Delete file
s3cmd del s3://little-hero-assets/fonts/custom-font.ttf
```

### **AWS CLI Commands:**
```bash
# List files
aws --profile r2 --endpoint-url https://3daae940fcb6fc5b8bbd9bb8fcc62854.r2.cloudflarestorage.com s3 ls s3://little-hero-assets/fonts/

# Copy file
aws --profile r2 --endpoint-url https://3daae940fcb6fc5b8bbd9bb8fcc62854.r2.cloudflarestorage.com s3 cp s3://little-hero-assets/fonts/custom-font.ttf s3://little-hero-assets/book-mvp-simple-adventure/fonts/custom-font.ttf

# Delete file
aws --profile r2 --endpoint-url https://3daae940fcb6fc5b8bbd9bb8fcc62854.r2.cloudflarestorage.com s3 rm s3://little-hero-assets/fonts/custom-font.ttf
```
