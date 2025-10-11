# 🧪 Testing Guide for 3-Book-Assembly Workflow

## 📋 Current Assets Available

### ✅ What You Have
- **4 Background Images**: `page01.png`, `page02.png`, `page03.png`, `page02-2.png`
- **4 Character Poses**: `pose01.png`, `pose02.png`, `pose03.png`, `pose04.png`
- **1 Base Character**: `base-character.png`
- **2 Animal Types**: Need to create placeholder images for `dog` and `cat`

### ❌ What You Need to Create
- **Animal Images**: 2 types × 4 pages = 8 images
- **Footprint Images**: 2 types = 2 images  
- **Text Box Overlay**: 1 image

## 🚀 Step-by-Step Testing Setup

### Step 1: Set Up R2 Credentials
```bash
# Set your R2 credentials (get these from Cloudflare dashboard)
export R2_ACCESS_KEY_ID="your_access_key_here"
export R2_SECRET_ACCESS_KEY="your_secret_key_here"
```

### Step 2: Create Placeholder Assets
```bash
# Create placeholder images for missing assets
node scripts/create-placeholder-assets.js
```

### Step 3: Upload Test Assets to R2
```bash
# Upload your existing assets to R2
node scripts/upload-test-assets.js
```

### Step 4: Generate Mock Order Data
```bash
# Create test order data
node scripts/generate-test-order.js
```

### Step 5: Test the Workflow

#### Option A: Test in n8n Cloud UI
1. Go to your n8n workflow: https://thepeakbeyond.app.n8n.cloud/workflow/BsL7VPylfeo8EQ4M
2. Add a "Manual Trigger" node
3. Connect it to "Get Order Ready for Assembly"
4. In the Manual Trigger, paste the mock order data from `test-data/mock-order.json`
5. Execute the workflow

#### Option B: Test Individual Nodes
1. Test "Load Generated Characters" - should load 4 poses
2. Test "Load Background Images" - should load 4 backgrounds
3. Test "Load Animal Companions" - should load 8 animal images
4. Test "Load Footprint Assets" - should load 2 footprint images
5. Test "Generate Page HTML" - should create HTML for 4 pages

## 🔧 Workflow Modifications for Testing

### Update Page Count
Since you only have 4 pages, update the workflow:

```javascript
// In "Get Order Ready for Assembly" node
totalPagesRequired: 4, // Changed from 14 to 4

// In "Load Generated Characters" node  
for (let i = 1; i <= 4; i++) { // Changed from 14 to 4

// In "Load Background Images" node
for (let i = 1; i <= 4; i++) { // Changed from 14 to 4

// In "Load Animal Companions" node
for (let i = 1; i <= 4; i++) { // Changed from 14 to 4

// In "Load Footprint Assets" node
for (let i = 1; i <= 4; i++) { // Changed from 14 to 4

// In "Load Story Text" node
for (let i = 1; i <= 4; i++) { // Changed from 14 to 4
```

### Update Story Text
Update the story text to only include 4 pages:

```javascript
const storyLines = [
  `Tonight the world felt soft and shimmery. On the path outside, ${childName} noticed tiny footprints glowing faintly, as if they were whispering, "Follow me."`,
  `The footprints curved around the garden gate and into the evening air that hummed with quiet magic. ${childName} took a brave step forward.`,
  `Trees rose like friendly giants. Between fallen leaves, the footprints continued—steady and sure—leading deeper, as if someone kind was waiting.`,
  `In a clearing, the footprints paused. ${childName} stood still and listened—the forest sounded like a secret song just for them.`
];
```

## 🐛 Common Issues & Solutions

### Issue 1: Images Not Loading
**Problem**: URLs return 404 or broken images
**Solution**: 
- Check R2 credentials are set correctly
- Verify files were uploaded to correct paths
- Test URLs manually in browser

### Issue 2: PDF Generation Fails
**Problem**: "Generate PDF Page" node fails
**Solution**: 
- Skip PDF generation for now
- Test HTML generation first
- Set up renderer service later

### Issue 3: Character Hash Undefined
**Problem**: `characterHash` is undefined in asset URLs
**Solution**: 
- Ensure mock order includes `characterHash` field
- Check data flow between nodes

## 📊 Expected Results

### Successful Test Should Show:
1. **4 Background Images** loaded from R2
2. **4 Character Poses** loaded from R2  
3. **8 Animal Images** loaded from R2 (2 types × 4 pages)
4. **2 Footprint Images** loaded from R2
5. **4 HTML Pages** generated with proper positioning
6. **No 404 errors** in asset loading

### Test URLs to Verify:
- Background: https://little-hero-assets.r2.cloudflarestorage.com/backgrounds/page01_background.png
- Character: https://little-hero-assets.r2.cloudflarestorage.com/characters/test-character/pose01.png
- Animal: https://little-hero-assets.r2.cloudflarestorage.com/animals/dog_1.png
- Footprints: https://little-hero-assets.r2.cloudflarestorage.com/footprints/dog_footprints.png

## 🎯 Next Steps After Testing

1. **Fix any broken URLs** or missing assets
2. **Generate remaining assets** (10 more backgrounds, 10 more poses)
3. **Set up PDF renderer service** for actual book generation
4. **Test end-to-end workflow** with real order data
5. **Optimize performance** and error handling

## 📞 Need Help?

If you encounter issues:
1. Check the n8n execution logs for specific error messages
2. Verify all asset URLs are accessible
3. Test individual nodes before running the full workflow
4. Use the mock data to isolate problems
