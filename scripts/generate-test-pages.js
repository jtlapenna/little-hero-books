#!/usr/bin/env node

// Script to generate all test page HTML files
const fs = require('fs');
const path = require('path');

// Page configuration: [pageNum, backgroundFile, poseFile, pageTitle, storyText]
const pages = [
  [1, 'page01-twilight-walk.png', 'walking.png', 'Twilight Walk', 'It was a nice evening in Seattle, and Alex went for a walk. As they stepped outside, a soft voice whispered, "You are very brave."'],
  [2, 'page02-night-forest.png', 'walking-looking-higher.png', 'Night Forest', 'Alex followed the voice into the forest. The trees stood tall like gentle giants. "You like to explore new things," the voice said. Alex smiled and walked deeper into the night.'],
  [3, 'page03-magic-doorway.png', 'looking.png', 'Magic Doorway', 'Then Alex saw something magical—a glowing doorway covered in vines and stars. "Step through," the voice said gently. "You are brave enough." Alex took a deep breath and stepped forward.'],
  [4, 'page04-courage-leap.png', 'floating.png', 'Courage Leap', 'Through the door was a sky full of stars! Alex took a leap—and floated gently down through starlight like a feather. "See?" the voice laughed. "You can do amazing things."'],
  [5, 'page05-morning-meadow.png', 'walking-looking-down.png', 'Morning Meadow', 'Alex landed softly in a sunny meadow. The sun smiled down, and birds sang happy songs. "You are very strong," the voice said warmly. Alex felt strong and brave.'],
  [6, 'page06-tall-forest.png', 'jogging.png', 'Tall Forest', 'The path led through a forest of giant trees. Alex felt small, but not scared. "You are very kind," the voice said through the leaves. Alex walked on, feeling proud.'],
  [7, 'page07-mountain-vista.png', 'looking.png', 'Mountain Vista', 'The path climbed higher and higher. At the top, Alex could see far and wide. "Look how far you\\'ve come," the voice said proudly. Alex felt very proud too.'],
  [8, 'page08-picnic-surprise.png', 'sitting-eating.png', 'Picnic Surprise', 'Down the path, a picnic waited on a soft blanket. There was a sandwich and a treat just for Alex. "You earned this," the voice said warmly. Alex sat down and felt very special.'],
  [9, 'page09-beach-discovery.png', 'crouching.png', 'Beach Discovery', 'The path became warm sand under Alex\\'s feet. The ocean sparkled in the sun. "You are so much fun," the voice laughed. Alex skipped along the shore, feeling free and happy.'],
  [10, 'page10-crystal-cave.png', 'crawling-moving-happy.png', 'Crystal Cave', 'Alex found a cave full of sparkling crystals. The crystals glowed with gentle rainbow colors. "You see beauty everywhere," the voice said softly. Alex smiled at all the pretty colors.'],
  [11, 'page11-giant-flowers.png', 'surprised-looking-up.png', 'Giant Flowers', 'The path went through a garden of giant flowers. The petals were bigger than Alex! "You make others happy," the voice said sweetly. Alex felt warm and happy inside.'],
  [14, 'page14-flying-home.png', 'hands-up-excited.png', 'Flying Home', '"Are you ready to fly home?" asked the Unicorn. Together they soared through the starry sky back to Seattle. "Remember," the Unicorn said, "I'm always in your heart." Alex smiled, knowing their friend would never leave them.'],
];

const templateHTML = (pageNum, bgImage, poseImage, title, text) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Page ${String(pageNum).padStart(2, '0')} - ${title}</title>
    <style>
        @page { size: 8.5in 8.5in; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @font-face { font-family: 'CustomFont'; src: url('../renderer-mock/assets/fonts/custom-font.ttf') format('truetype'); }
        body { font-family: 'CustomFont', 'Arial', sans-serif; width: 12in; height: 8.5in; position: relative; overflow: hidden; background-color: #f5f5f5; }
        .page { width: 8.5in; height: 8.5in; position: relative; background-image: url('../assets/images/${bgImage}'); background-size: cover; background-position: center; background-repeat: no-repeat; border: 2px solid #333; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
        .text-box { position: absolute; left: 50%; bottom: 3%; width: 65%; transform: translateX(-50%); height: auto; background-image: url('../renderer-mock/assets/overlays/text-boxes/standard-box.png'); background-size: contain; background-repeat: no-repeat; background-position: center; padding: 30px 50px; display: flex; align-items: center; justify-content: center; }
        .text-content { font-size: 14px; line-height: 1.2; letter-spacing: 0.5px; color: #312116; text-align: center; font-weight: 400; max-width: 100%; word-wrap: break-word; }
        .character { position: absolute; right: 5%; top: 15%; width: 300px; height: auto; z-index: 100; border: 2px dashed red; }
        .character img { width: 100%; height: auto; }
        .character-lighting { position: relative; display: inline-block; width: 100%; height: 100%; }
        .character-lighting img { display: block; width: 100%; height: auto; opacity: 0; position: relative; z-index: 0; }
        .character-lighting::before { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; z-index: 1; background-image: linear-gradient(to bottom, rgba(255, 107, 53, 0.5) 0%, rgba(78, 205, 196, 0.5) 100%), url('../assets/poses/new-story/${poseImage}'); background-size: 100% 100%, contain; background-position: center, center; background-repeat: no-repeat, no-repeat; background-blend-mode: overlay; -webkit-mask-image: url('../assets/poses/new-story/${poseImage}'); -webkit-mask-size: contain; -webkit-mask-repeat: no-repeat; -webkit-mask-position: center; mask-image: url('../assets/poses/new-story/${poseImage}'); mask-size: contain; mask-repeat: no-repeat; mask-position: center; }
        .debug-info { position: absolute; top: 20px; left: 9in; background: rgba(255, 255, 255, 0.95); padding: 15px; border-radius: 8px; font-size: 12px; font-family: monospace; max-width: 300px; z-index: 1000; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .debug-info h4 { margin-bottom: 8px; color: #333; }
        .debug-info ul { margin-left: 15px; }
        .debug-info li { margin-bottom: 3px; }
        .position-controls { position: absolute; top: 200px; left: 9in; background: rgba(255, 255, 255, 0.95); padding: 15px; border-radius: 8px; font-size: 12px; font-family: monospace; max-width: 350px; z-index: 1000; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .position-controls h4 { margin-bottom: 8px; color: #333; }
        .position-controls input { width: 60px; margin: 2px; }
        @media print { .debug-info, .position-controls { display: none; } }
    </style>
</head>
<body>
    <div class="debug-info">
        <h4>🎨 Page ${String(pageNum).padStart(2, '0')} - ${title}</h4>
        <ul>
            <li>Background: ${bgImage}</li>
            <li>Pose: ${poseImage}</li>
            <li>Text Box: 65% width, bottom 3%</li>
            <li>Character: right: 5%, top: 15%, width: 300px</li>
        </ul>
    </div>
    <div class="position-controls">
        <h4>🎯 Character Position</h4>
        <div><label>Right: <input type="number" id="right" value="5" onchange="updatePosition()">%</label></div>
        <div><label>Top: <input type="number" id="top" value="15" onchange="updatePosition()">%</label></div>
        <div><label>Width: <input type="number" id="width" value="300" onchange="updatePosition()">px</label></div>
        <div style="margin-top: 10px;"><label><input type="checkbox" id="flipHorizontal" onchange="updatePosition()"> Flip Horizontal</label></div>
        <div style="margin-top: 10px;">
            <h4>🌅 Custom Lighting Gradient</h4>
            <div style="margin-bottom: 10px;">
                <label>Gradient Direction:</label>
                <select id="gradientDirection" onchange="updateLighting()">
                    <option value="to bottom">Top to Bottom</option>
                    <option value="to right">Left to Right</option>
                    <option value="to bottom right">Top-Left to Bottom-Right</option>
                    <option value="to bottom left">Top-Right to Bottom-Left</option>
                    <option value="radial">Radial (Center)</option>
                </select>
            </div>
            <div style="display: flex; gap: 15px; margin-bottom: 10px;">
                <div style="flex: 1;">
                    <h5>Start Color</h5>
                    <div><label>Color: <input type="color" id="startColor" value="#ff6b35" onchange="updateLighting()"></label></div>
                    <div><label>Opacity: <input type="range" id="startOpacity" min="0" max="100" value="50" onchange="updateLighting()"> <span id="startOpacityValue">50%</span></label></div>
                </div>
                <div style="flex: 1;">
                    <h5>End Color</h5>
                    <div><label>Color: <input type="color" id="endColor" value="#4ecdc4" onchange="updateLighting()"></label></div>
                    <div><label>Opacity: <input type="range" id="endOpacity" min="0" max="100" value="50" onchange="updateLighting()"> <span id="endOpacityValue">50%</span></label></div>
                </div>
            </div>
            <div style="margin-bottom: 10px;">
                <label>Blend Mode:</label>
                <select id="blendMode" onchange="updateLighting()">
                    <option value="normal">Normal</option>
                    <option value="none">None (Disabled)</option>
                    <option value="overlay" selected>Overlay</option>
                    <option value="multiply">Multiply</option>
                    <option value="screen">Screen</option>
                    <option value="soft-light">Soft Light</option>
                    <option value="hard-light">Hard Light</option>
                    <option value="color-dodge">Color Dodge</option>
                    <option value="color-burn">Color Burn</option>
                    <option value="difference">Difference</option>
                </select>
            </div>
            <div style="background: #f0f0f0; padding: 10px; border-radius: 5px; margin-bottom: 10px;">
                <strong>Preview:</strong>
                <div id="gradientPreview" style="width: 100%; height: 30px; border: 1px solid #ccc; margin-top: 5px;"></div>
            </div>
        </div>
        <div style="margin-top: 10px;"><button onclick="copyPosition()">Copy CSS</button></div>
    </div>
    <div class="page">
        <div class="text-box">
            <div class="text-content">${text}</div>
        </div>
        <div class="character character-lighting" id="character">
            <img src="../assets/poses/new-story/${poseImage}" alt="Character">
        </div>
    </div>
    <script>
        document.addEventListener('DOMContentLoaded', function() { updateLighting(); });
        function updateLighting() {
            const character = document.getElementById('character');
            const characterImg = character.querySelector('img');
            const gradientDirection = document.getElementById('gradientDirection').value;
            const startColor = document.getElementById('startColor').value;
            const endColor = document.getElementById('endColor').value;
            const startOpacity = document.getElementById('startOpacity').value;
            const endOpacity = document.getElementById('endOpacity').value;
            const blendMode = document.getElementById('blendMode').value;
            document.getElementById('startOpacityValue').textContent = startOpacity + '%';
            document.getElementById('endOpacityValue').textContent = endOpacity + '%';
            const startColorRgba = hexToRgba(startColor, startOpacity / 100);
            const endColorRgba = hexToRgba(endColor, endOpacity / 100);
            let gradientCss;
            if (gradientDirection === 'radial') {
                gradientCss = \`radial-gradient(circle, \${startColorRgba} 0%, \${endColorRgba} 100%)\`;
            } else {
                gradientCss = \`linear-gradient(\${gradientDirection}, \${startColorRgba} 0%, \${endColorRgba} 100%)\`;
            }
            const characterImageUrl = characterImg.getAttribute('src');
            let styleEl = document.getElementById('dynamic-lighting-style');
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = 'dynamic-lighting-style';
                document.head.appendChild(styleEl);
            }
            if (blendMode === 'none') {
                styleEl.textContent = \`#character::before { background-image: url("\${characterImageUrl}") !important; background-size: contain !important; background-position: center !important; background-repeat: no-repeat !important; background-blend-mode: normal !important; -webkit-mask-image: none !important; mask-image: none !important; }\`;
            } else {
                styleEl.textContent = \`#character::before { background-image: \${gradientCss}, url("\${characterImageUrl}") !important; background-size: 100% 100%, contain !important; background-position: center, center !important; background-repeat: no-repeat, no-repeat !important; background-blend-mode: \${blendMode} !important; -webkit-mask-image: url("\${characterImageUrl}") !important; -webkit-mask-size: contain !important; -webkit-mask-repeat: no-repeat !important; -webkit-mask-position: center !important; mask-image: url("\${characterImageUrl}") !important; mask-size: contain !important; mask-repeat: no-repeat !important; mask-position: center !important; }\`;
            }
            const preview = document.getElementById('gradientPreview');
            preview.style.background = gradientCss;
        }
        function hexToRgba(hex, alpha) {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return \`rgba(\${r}, \${g}, \${b}, \${alpha})\`;
        }
        function updatePosition() {
            const character = document.getElementById('character');
            const right = document.getElementById('right').value;
            const top = document.getElementById('top').value;
            const width = document.getElementById('width').value;
            const flipHorizontal = document.getElementById('flipHorizontal').checked;
            character.style.right = right + '%';
            character.style.top = top + '%';
            character.style.width = width + 'px';
            character.style.transform = flipHorizontal ? 'scaleX(-1)' : 'scaleX(1)';
        }
        function copyPosition() {
            const right = document.getElementById('right').value;
            const top = document.getElementById('top').value;
            const width = document.getElementById('width').value;
            const flipHorizontal = document.getElementById('flipHorizontal').checked;
            const gradientDirection = document.getElementById('gradientDirection').value;
            const startColor = document.getElementById('startColor').value;
            const endColor = document.getElementById('endColor').value;
            const startOpacity = document.getElementById('startOpacity').value;
            const endOpacity = document.getElementById('endOpacity').value;
            const blendMode = document.getElementById('blendMode').value;
            const startColorRgba = hexToRgba(startColor, startOpacity / 100);
            const endColorRgba = hexToRgba(endColor, endOpacity / 100);
            let gradientCss;
            if (gradientDirection === 'radial') {
                gradientCss = \`radial-gradient(circle, \${startColorRgba} 0%, \${endColorRgba} 100%)\`;
            } else {
                gradientCss = \`linear-gradient(\${gradientDirection}, \${startColorRgba} 0%, \${endColorRgba} 100%)\`;
            }
            const flipCss = flipHorizontal ? 'transform: scaleX(-1);' : '';
            const css = \`right: \${right}%; top: \${top}%; width: \${width}px; \${flipCss}\`;
            const lightingCss = \`background: \${gradientCss}; mix-blend-mode: \${blendMode};\`;
            const fullCss = \`/* Character Positioning */\\n.character {\\n    position: absolute;\\n    \${css}\\n    height: auto;\\n    z-index: 100;\\n}\\n\\n/* Character Lighting */\\n.character-lighting::before {\\n    content: '';\\n    position: absolute;\\n    top: 0; left: 0; right: 0; bottom: 0;\\n    pointer-events: none;\\n    z-index: 1;\\n    \${lightingCss}\\n}\`;
            navigator.clipboard.writeText(fullCss).then(() => { alert('CSS copied to clipboard!'); });
        }
    </script>
</body>
</html>`;

// Generate all pages
const testPagesDir = path.join(__dirname, '..', 'test-pages');

pages.forEach(([pageNum, bgImage, poseImage, title, text]) => {
  const fileName = `page${String(pageNum).padStart(2, '0')}-test.html`;
  const filePath = path.join(testPagesDir, fileName);
  const html = templateHTML(pageNum, bgImage, poseImage, title, text);
  
  fs.writeFileSync(filePath, html, 'utf8');
  console.log(`✅ Created ${fileName}`);
});

console.log('\n🎉 All test pages generated successfully!');
console.log('\n📝 Note: Pages 12 and 13 not generated (TBD - backgrounds/poses not yet created)');

