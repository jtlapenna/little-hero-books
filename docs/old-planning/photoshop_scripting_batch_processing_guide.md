# Photoshop Scripting & Batch Processing Guide

## 🎯 What Photoshop Scripts Will Do For You

### **The Problem They Solve**
- **Alignment**: Ensure all hair overlays sit perfectly on the same head position
- **Consistency**: Make sure all assets are the same size and resolution
- **Quality Control**: Automatically check for transparency, clipping, and positioning
- **Batch Processing**: Apply the same fixes to hundreds of images at once

### **Specific Tasks for Your Project**
1. **Resize & Align**: Make all hair styles fit the same head bounding box
2. **Transparency Cleanup**: Remove stray pixels and ensure clean edges
3. **Position Standardization**: Ensure all overlays align to the same coordinates
4. **Quality Checks**: Flag images that don't meet standards

## 🛠 Photoshop Scripting Workflow

### **Step 1: Record Your First Action**

1. **Open Photoshop** → Window → Actions
2. **Click "Create New Action"** → Name it "Character Hair Alignment"
3. **Click Record** (red circle)
4. **Manually do the alignment process once:**
   - Open a hair overlay image
   - Resize to match your head bounding box (e.g., 400x400px)
   - Position it exactly where it should sit
   - Save as PNG with transparency
5. **Click Stop** (square button)

### **Step 2: Create the Script**

```javascript
// File: align-character-assets.jsx
// Save this in: Applications/Adobe Photoshop 2024/Presets/Scripts/

function alignCharacterAssets() {
    // Get the current document
    var doc = app.activeDocument;
    
    // Define your standard head bounding box (adjust these values)
    var headWidth = 400;
    var headHeight = 400;
    var headX = 312;  // X position of head area
    var headY = 200;  // Y position of head area
    
    // Resize the image to match head size
    doc.resizeImage(
        headWidth, 
        headHeight, 
        Resolution.PIXELSPERINCH, 
        300
    );
    
    // Create a selection for the head area
    var headRect = new Rectangle(headX, headY, headX + headWidth, headY + headHeight);
    doc.selection.select(headRect);
    
    // Copy the selection
    doc.selection.copy();
    
    // Create a new document with standard dimensions
    var newDoc = app.documents.add(
        headWidth, 
        headHeight, 
        300, 
        "Aligned Character Asset"
    );
    
    // Paste the aligned asset
    newDoc.paste();
    
    // Save as PNG with transparency
    var pngFile = new File(doc.path + "/aligned_" + doc.name);
    var pngOptions = new PNGSaveOptions();
    pngOptions.compression = 0;
    pngOptions.interlaced = false;
    
    newDoc.saveAs(pngFile, pngOptions);
    
    // Close the new document
    newDoc.close();
    
    // Close the original
    doc.close();
}

// Run the function
alignCharacterAssets();
```

### **Step 3: Batch Processing Setup**

1. **File → Automate → Batch**
2. **Set Source Folder**: Your generated hair assets
3. **Set Destination Folder**: Your aligned assets folder
4. **Action**: Select "Character Hair Alignment"
5. **Check "Override Action 'Save As' Commands"**
6. **Click OK**

## 🔧 Advanced Scripting for Your Project

### **Multi-Layer Alignment Script**

```javascript
// File: standardize-character-assets.jsx
// This script handles multiple asset types

function standardizeCharacterAssets() {
    var doc = app.activeDocument;
    var fileName = doc.name;
    
    // Define standard dimensions
    var standardWidth = 1024;
    var standardHeight = 1024;
    var headBox = {x: 312, y: 200, width: 400, height: 400};
    var bodyBox = {x: 256, y: 400, width: 512, height: 400};
    
    // Determine asset type from filename
    if (fileName.indexOf("hair") > -1) {
        alignToHeadBox(headBox);
    } else if (fileName.indexOf("body") > -1) {
        alignToBodyBox(bodyBox);
    } else if (fileName.indexOf("eyes") > -1) {
        alignToHeadBox(headBox);
    }
    
    // Resize to standard canvas
    doc.resizeCanvas(standardWidth, standardHeight, AnchorPosition.MIDDLECENTER);
    
    // Clean up transparency
    cleanupTransparency();
    
    // Save with standardized naming
    saveStandardizedAsset(fileName);
}

function alignToHeadBox(box) {
    // Resize and position to head bounding box
    var doc = app.activeDocument;
    
    // Resize to head box dimensions
    doc.resizeImage(box.width, box.height, Resolution.PIXELSPERINCH, 300);
    
    // Position at head box coordinates
    var layer = doc.activeLayer;
    layer.translate(box.x - layer.bounds[0], box.y - layer.bounds[1]);
}

function cleanupTransparency() {
    // Remove stray pixels and clean edges
    var doc = app.activeDocument;
    
    // Select transparent areas
    doc.selection.selectAll();
    doc.selection.shrink(1);
    doc.selection.invert();
    
    // Delete stray pixels
    doc.selection.clear();
}

function saveStandardizedAsset(originalName) {
    // Save with standardized naming convention
    var doc = app.activeDocument;
    var baseName = originalName.replace(/\.[^/.]+$/, "");
    var standardizedName = baseName + "_standardized.png";
    
    var pngFile = new File(doc.path + "/" + standardizedName);
    var pngOptions = new PNGSaveOptions();
    pngOptions.compression = 0;
    pngOptions.interlaced = false;
    
    doc.saveAs(pngFile, pngOptions);
}
```

## 📋 Complete Workflow for Your Project

### **Phase 1: Setup (One-time)**
1. **Create Master Template**: One reference image with bounding boxes marked
2. **Record Alignment Action**: Manual process once, then automate
3. **Create Asset Folders**:
   ```
   /assets/characters/
   ├── raw/           # Generated assets
   ├── aligned/       # Processed assets
   └── final/         # Ready for production
   ```

### **Phase 2: Batch Processing**
1. **Generate Assets**: Use ComfyUI to create all hair/body/eye variations
2. **Run Batch Script**: Process all assets through your alignment script
3. **Quality Check**: Review a sample to ensure alignment is correct
4. **Deploy**: Move aligned assets to your renderer

### **Phase 3: Quality Control Script**

```javascript
// File: quality-check.jsx
// Automatically flag problematic assets

function qualityCheck() {
    var doc = app.activeDocument;
    var issues = [];
    
    // Check dimensions
    if (doc.width != 1024 || doc.height != 1024) {
        issues.push("Wrong dimensions");
    }
    
    // Check transparency
    if (!hasTransparency()) {
        issues.push("No transparency");
    }
    
    // Check positioning
    if (!isInCorrectPosition()) {
        issues.push("Wrong position");
    }
    
    // Log issues
    if (issues.length > 0) {
        alert("Issues found: " + issues.join(", "));
    }
}

function hasTransparency() {
    // Check if image has transparent areas
    var doc = app.activeDocument;
    var hasAlpha = false;
    
    for (var i = 0; i < doc.channels.length; i++) {
        if (doc.channels[i].kind == ChannelType.MASKEDAREA) {
            hasAlpha = true;
            break;
        }
    }
    
    return hasAlpha;
}
```

## 🚀 Getting Started

### **Week 1: Learn the Basics**
1. **Record your first action** with one hair overlay
2. **Test batch processing** on 5-10 images
3. **Refine the script** based on results

### **Week 2: Scale Up**
1. **Create scripts for each asset type** (hair, body, eyes)
2. **Set up folder structure** for organized processing
3. **Test with your full asset set**

### **Week 3: Production**
1. **Integrate with your generation workflow**
2. **Set up quality control checks**
3. **Automate the entire pipeline**

## 💡 Pro Tips

- **Start Simple**: Begin with one asset type, then expand
- **Test Small**: Always test on a few images before running on hundreds
- **Backup First**: Keep original files until you're confident in the results
- **Document Everything**: Keep notes on what each script does

## 📁 File Structure for Scripts

```
/scripts/photoshop/
├── align-character-assets.jsx
├── standardize-character-assets.jsx
├── quality-check.jsx
├── batch-process-hair.jsx
├── batch-process-body.jsx
└── batch-process-eyes.jsx
```

## 🔧 Installation Instructions

1. **Locate Photoshop Scripts Folder**:
   - **Mac**: `Applications/Adobe Photoshop 2024/Presets/Scripts/`
   - **Windows**: `C:\Program Files\Adobe\Adobe Photoshop 2024\Presets\Scripts\`

2. **Copy Script Files**: Place all `.jsx` files in the scripts folder

3. **Enable Scripts**: 
   - Edit → Preferences → Scripting & Automation
   - Check "Enable JavaScript Debugger"

4. **Run Scripts**:
   - File → Scripts → [Script Name]
   - Or use File → Automate → Batch

## 🎯 Asset-Specific Scripts

### **Hair Overlay Script**
```javascript
// File: process-hair-overlays.jsx
function processHairOverlays() {
    var doc = app.activeDocument;
    
    // Hair-specific processing
    var hairBox = {x: 312, y: 200, width: 400, height: 400};
    
    // Resize to hair box
    doc.resizeImage(hairBox.width, hairBox.height, Resolution.PIXELSPERINCH, 300);
    
    // Clean up hair edges
    cleanupHairEdges();
    
    // Save with hair naming convention
    saveHairAsset(doc.name);
}

function cleanupHairEdges() {
    // Hair-specific cleanup logic
    var doc = app.activeDocument;
    
    // Remove stray pixels around hair
    doc.selection.selectAll();
    doc.selection.shrink(2);
    doc.selection.invert();
    doc.selection.clear();
}
```

### **Body Pose Script**
```javascript
// File: process-body-poses.jsx
function processBodyPoses() {
    var doc = app.activeDocument;
    
    // Body-specific processing
    var bodyBox = {x: 256, y: 400, width: 512, height: 400};
    
    // Resize to body box
    doc.resizeImage(bodyBox.width, bodyBox.height, Resolution.PIXELSPERINCH, 300);
    
    // Clean up body edges
    cleanupBodyEdges();
    
    // Save with body naming convention
    saveBodyAsset(doc.name);
}
```

## 📊 Quality Control Metrics

### **Automated Checks**
- **Dimensions**: 1024x1024 pixels
- **Resolution**: 300 DPI
- **Transparency**: Alpha channel present
- **Positioning**: Within bounding box coordinates
- **File Size**: Within expected range

### **Manual Review Checklist**
- [ ] Hair sits naturally on head
- [ ] No clipping or artifacts
- [ ] Consistent lighting/shading
- [ ] Proper transparency edges
- [ ] Correct file naming

## 🔄 Integration with ComfyUI

### **Post-Generation Processing**
1. **ComfyUI generates** raw assets
2. **Photoshop scripts** process and align
3. **Quality check** flags issues
4. **Final assets** ready for renderer

### **Automated Workflow**
```bash
# Example workflow integration
comfyui-generate → photoshop-batch-process → quality-check → deploy-assets
```

This comprehensive guide will help you implement precise, automated asset processing for your character generation pipeline!
