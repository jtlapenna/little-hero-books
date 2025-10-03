const fs = require('fs');
const path = require('path');

// Create assets/backgrounds directory
const assetsDir = path.join(__dirname, 'assets', 'backgrounds');
if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
}

// Image specifications
const WIDTH = 3375;   // 11.25 inches at 300 DPI (11" + 0.125" bleed each side)
const HEIGHT = 2625;  // 8.75 inches at 300 DPI (8.25" + 0.25" bleed top/bottom)

// Page descriptions for The Adventure Compass story
const pages = [
    { filename: "page01_bedroom", description: "Bedroom Scene", color: [135, 206, 235] }, // Sky blue
    { filename: "page02_bedroom_night", description: "Bedroom Night", color: [25, 25, 112] }, // Midnight blue
    { filename: "page03_forest", description: "Forest Path", color: [34, 139, 34] }, // Forest green
    { filename: "page04_mountain", description: "Mountain View", color: [139, 137, 137] }, // Gray
    { filename: "page05_sky", description: "Sky Scene", color: [135, 206, 235] }, // Sky blue
    { filename: "page06_sea", description: "Ocean Scene", color: [0, 191, 255] }, // Deep sky blue
    { filename: "page07_picnic", description: "Picnic Area", color: [255, 228, 196] }, // Bisque
    { filename: "page08_cave", description: "Cave Entrance", color: [105, 105, 105] }, // Dim gray
    { filename: "page09_garden", description: "Garden Scene", color: [144, 238, 144] }, // Light green
    { filename: "page10_town", description: "Town Square", color: [255, 218, 185] }, // Peach puff
    { filename: "page11_bedroom_return", description: "Bedroom Return", color: [135, 206, 235] }, // Sky blue
    { filename: "page12_compass_glow", description: "Compass Glow", color: [255, 215, 0] }, // Gold
    { filename: "page13_keepsake_frame", description: "Keepsake Frame", color: [255, 228, 196] }, // Bisque
    { filename: "page14_dedication_frame", description: "Dedication Frame", color: [255, 228, 196] } // Bisque
];

console.log("🎨 Creating placeholder background images...");

// Create a simple HTML file that will generate the images
const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Generate Test Images</title>
</head>
<body>
    <canvas id="canvas" width="${WIDTH}" height="${HEIGHT}" style="border: 1px solid #ccc;"></canvas>
    <div id="downloads"></div>
    
    <script>
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        const downloads = document.getElementById('downloads');
        
        const pages = ${JSON.stringify(pages)};
        
        pages.forEach((page, index) => {
            // Clear canvas
            ctx.clearRect(0, 0, ${WIDTH}, ${HEIGHT});
            
            // Fill with background color
            ctx.fillStyle = \`rgb(\${page.color[0]}, \${page.color[1]}, \${page.color[2]})\`;
            ctx.fillRect(0, 0, ${WIDTH}, ${HEIGHT});
            
            // Add text
            ctx.fillStyle = 'white';
            ctx.font = 'bold 120px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const text = \`\${page.filename}\\n\${page.description}\\n11.25" × 8.75" @ 300 DPI\\n(11" × 8.25" trim)\`;
            const lines = text.split('\\n');
            const lineHeight = 140;
            const startY = ${HEIGHT/2} - (lines.length * lineHeight) / 2;
            
            lines.forEach((line, i) => {
                ctx.fillText(line, ${WIDTH/2}, startY + (i * lineHeight));
            });
            
            // Convert to blob and download
            canvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = \`\${page.filename}.png\`;
                a.textContent = \`Download \${page.filename}.png\`;
                a.style.display = 'block';
                a.style.margin = '10px';
                downloads.appendChild(a);
                
                // Auto-click after a short delay
                setTimeout(() => a.click(), index * 100);
            }, 'image/png');
        });
        
        console.log('All images generated! Check the downloads folder.');
    </script>
</body>
</html>
`;

// Write the HTML file
fs.writeFileSync(path.join(__dirname, 'generate-images.html'), htmlContent);

console.log(`🎉 Created HTML generator: generate-images.html`);
console.log(`📁 Open this file in your browser to generate the test images`);
console.log(`🔍 Dimensions: ${WIDTH}×${HEIGHT} pixels (11.25×8.75 inches @ 300 DPI)`);
console.log(`📏 Trim size: 11×8.25 inches (with 0.125" bleed each side, 0.25" top/bottom)`);
console.log(`🎨 Colors: Each page has a unique color representing the scene`);
console.log("");
console.log("Next steps:");
console.log("1. Open generate-images.html in your browser");
console.log("2. Images will auto-download to your Downloads folder");
console.log("3. Move the downloaded PNG files to assets/backgrounds/");
console.log("4. Run: node server.js");
console.log("5. Test: curl http://localhost:8787/health");
