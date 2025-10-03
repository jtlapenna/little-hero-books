const fs = require('fs');
const path = require('path');

// Create assets/backgrounds directory
const assetsDir = path.join(__dirname, 'assets', 'backgrounds');
if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
}

// Image specifications
const WIDTH = 3375;   // 11.25 inches at 300 DPI
const HEIGHT = 2625;  // 8.75 inches at 300 DPI

// Page descriptions for The Adventure Compass story
const pages = [
    { filename: "page01_bedroom", description: "Bedroom Scene", color: "#87CEEB" }, // Sky blue
    { filename: "page02_bedroom_night", description: "Bedroom Night", color: "#191970" }, // Midnight blue
    { filename: "page03_forest", description: "Forest Path", color: "#228B22" }, // Forest green
    { filename: "page04_mountain", description: "Mountain View", color: "#8B8989" }, // Gray
    { filename: "page05_sky", description: "Sky Scene", color: "#87CEEB" }, // Sky blue
    { filename: "page06_sea", description: "Ocean Scene", color: "#00BFFF" }, // Deep sky blue
    { filename: "page07_picnic", description: "Picnic Area", color: "#FFE4C4" }, // Bisque
    { filename: "page08_cave", description: "Cave Entrance", color: "#696969" }, // Dim gray
    { filename: "page09_garden", description: "Garden Scene", color: "#90EE90" }, // Light green
    { filename: "page10_town", description: "Town Square", color: "#FFDAB9" }, // Peach puff
    { filename: "page11_bedroom_return", description: "Bedroom Return", color: "#87CEEB" }, // Sky blue
    { filename: "page12_compass_glow", description: "Compass Glow", color: "#FFD700" }, // Gold
    { filename: "page13_keepsake_frame", description: "Keepsake Frame", color: "#FFE4C4" }, // Bisque
    { filename: "page14_dedication_frame", description: "Dedication Frame", color: "#FFE4C4" } // Bisque
];

console.log("🎨 Creating simple placeholder background images...");

// Create a simple SVG-based approach
pages.forEach((page, index) => {
    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${page.color}"/>
  <text x="${WIDTH/2}" y="${HEIGHT/2 - 100}" text-anchor="middle" font-family="Arial, sans-serif" font-size="120" font-weight="bold" fill="white">
    ${page.filename}
  </text>
  <text x="${WIDTH/2}" y="${HEIGHT/2}" text-anchor="middle" font-family="Arial, sans-serif" font-size="80" fill="white">
    ${page.description}
  </text>
  <text x="${WIDTH/2}" y="${HEIGHT/2 + 100}" text-anchor="middle" font-family="Arial, sans-serif" font-size="60" fill="white">
    11.25" × 8.75" @ 300 DPI
  </text>
  <text x="${WIDTH/2}" y="${HEIGHT/2 + 160}" text-anchor="middle" font-family="Arial, sans-serif" font-size="60" fill="white">
    (11" × 8.25" trim)
  </text>
</svg>`;

    // Write SVG file
    const svgPath = path.join(assetsDir, `${page.filename}.svg`);
    fs.writeFileSync(svgPath, svgContent);
    
    console.log(`  ✅ Created ${page.filename}.svg`);
});

console.log(`🎉 Created ${pages.length} placeholder background images as SVG files!`);
console.log(`📁 Images saved to: assets/backgrounds/`);
console.log(`🔍 Dimensions: ${WIDTH}×${HEIGHT} pixels (11.25×8.75 inches @ 300 DPI)`);
console.log(`📏 Trim size: 11×8.25 inches (with 0.125" bleed each side, 0.25" top/bottom)`);
console.log(`🎨 Colors: Each page has a unique color representing the scene`);
console.log("");
console.log("Note: These are SVG files. For production, you'll need PNG files.");
console.log("You can convert them using online tools or image editing software.");
console.log("");
console.log("Next steps:");
console.log("1. Convert SVG files to PNG (optional for testing)");
console.log("2. Run: node server.js");
console.log("3. Test: curl http://localhost:8787/health");
