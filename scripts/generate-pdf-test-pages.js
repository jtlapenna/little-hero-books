#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Page data with background images, text, and pose numbers
const pageData = [
    { page: 1, bg: 'page01-twilight-walk.png', text: 'It was a nice night in Seattle. Alex went outside.', pose: 'pose01' },
    { page: 2, bg: 'page02-night-forest.png', text: 'Alex looked at the stars.<br>You like to explore, the voice said.', pose: 'pose02' },
    { page: 3, bg: 'page03-magic-doorway.png', text: 'There was a doorway! Alex walked through.', pose: 'pose03' },
    { page: 4, bg: 'page04-courage-leap.png', text: 'Stars were all around! Alex felt brave.', pose: 'pose04' },
    { page: 5, bg: 'page05-morning-meadow.png', text: 'Alex noticed footprints and followed them.', pose: 'pose05' },
    { page: 6, bg: 'page06-tall-forest.png', text: 'The path went through giant trees. Alex felt small, but not scared.', pose: 'pose06' },
    { page: 7, bg: 'page07-mountain-vista.png', text: 'Look how far you came, the voice said.', pose: 'pose07' },
    { page: 8, bg: 'page08-picnic-surprise.png', text: 'Lunch was waiting! Alex ate happily.<br>You earned this, the voice said.', pose: 'pose08' },
    { page: 9, bg: 'page09-beach-discovery.png', text: 'The path became warm sand. Look down there, the voice said.<br>Alex found a beautiful shell!', pose: 'pose09' },
    { page: 10, bg: 'page10-crystal-cave.png', text: 'Alex found a cave with sparkly crystals! They glowed with rainbow colors. You can find beauty everywhere, the voice said.', pose: 'pose10' },
    { page: 11, bg: 'page11-giant-flowers.png', text: 'The path went through giant flowers. The petals were SO big!<br>You make others happy, the voice said.', pose: 'pose11' },
    { page: 12, bg: 'page12-almost-there.png', text: 'The voice felt very close now. You are perfect just as you are, it said.<br>Alex looked around. Where was the voice?', pose: 'pose12' },
    { page: 13, bg: 'page13-animal-reveal.png', text: 'Dog appeared! It was the voice!<br>I have been with you this whole time, said Dog.', pose: null }, // No character, animal only
    { page: 14, bg: 'page14-flying-home.png', text: 'Ready to fly home? asked Dog. They flew through the stars to Seattle.<br>I am always in your heart, said Dog.', pose: 'pose14' }
];

const template = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Page {{PAGE}} - PDF Test (2550px × 2550px)</title>
    <style>
        @page {
            size: 2550px 2550px;
            margin: 0;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        @font-face {
            font-family: 'CustomFont';
            src: url('../renderer-mock/assets/fonts/custom-font.ttf') format('truetype');
        }
        
        body {
            font-family: 'CustomFont', 'Arial', sans-serif;
            width: 2550px;
            height: 2550px;
            position: relative;
            overflow: hidden;
            background-color: #000;
        }
        
        .page {
            width: 2550px;
            height: 2550px;
            position: relative;
            background-image: url('https://pub-92cec53654f84771956bc84dfea65baa.r2.dev/book-mvp-simple-adventure/backgrounds/{{BG_IMAGE}}');
            background-size: 2550px 2550px;
            background-position: center;
            background-repeat: no-repeat;
            border: 2px solid #ccc;
        }
        
        /* TEXT BOX SPECIFICATIONS - Scale for 2550px width */
        .text-box {
            position: absolute;
            left: 50%;
            bottom: 3%;
            width: 80%; /* 80% of 2550px = 2040px */
            transform: translateX(-50%);
            height: auto;
            background-image: url('https://pub-92cec53654f84771956bc84dfea65baa.r2.dev/book-mvp-simple-adventure/overlays/text-boxes/standard-box.png');
            background-size: 100% 100%;
            background-repeat: no-repeat;
            background-position: center;
            padding: 120px 240px; /* Scaled for 300 DPI */
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 400px;
        }
        
        /* TEXT SPECIFICATIONS - Scale for 300 DPI */
        .text-content {
            font-size: 60px; /* Scaled for 300 DPI */
            line-height: 1.3;
            letter-spacing: 2px;
            color: #312116;
            text-align: center;
            font-weight: 400;
            width: 100%;
            word-wrap: break-word;
            hyphens: none;
        }
        
        /* CHARACTER POSITIONING - ADJUST THESE VALUES */
        .character {
            position: absolute;
            right: 5%;
            top: 15%;
            width: 300px;
            height: auto;
            z-index: 100;
            border: 3px solid red; /* Debug border */
            background: rgba(255, 0, 0, 0.2); /* Debug background */
        }
        
        .character img {
            width: 100%;
            height: auto;
        }
        
        .position-controls {
            position: absolute;
            top: 30px;
            left: 30px;
            background: rgba(255, 255, 255, 0.95);
            padding: 45px;
            border-radius: 24px;
            font-size: 36px;
            font-family: monospace;
            max-width: 900px;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            transition: all 0.3s ease;
        }
        
        .position-controls.collapsed {
            max-width: 150px;
            max-height: 150px;
            padding: 30px;
            overflow: hidden;
            cursor: pointer;
        }
        
        .position-controls.collapsed .controls-content {
            display: none;
        }
        
        .position-controls .collapse-btn {
            position: absolute;
            top: 15px;
            right: 15px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 12px;
            width: 72px;
            height: 72px;
            cursor: pointer;
            font-size: 48px;
            line-height: 1;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .position-controls .collapse-btn:hover {
            background: #5568d3;
        }
        
        .position-controls.collapsed .collapse-btn {
            position: static;
            width: 90px;
            height: 90px;
            font-size: 60px;
        }
        
        .position-controls h4 {
            margin-bottom: 24px;
            color: #333;
        }
        
        .position-controls input {
            width: 180px;
            margin: 6px;
            font-size: 36px;
            padding: 12px;
        }
        
        .position-controls label {
            font-size: 36px;
            display: block;
            margin-bottom: 12px;
        }
        
        @media print {
            .position-controls {
                display: none;
            }
        }
    </style>
</head>
<body>
    <div class="position-controls" id="controls">
        <button class="collapse-btn" onclick="toggleControls()" title="Collapse/Expand">−</button>
        <div class="controls-content">
        <h4>🎯 Character Position (PDF Scale)</h4>
        <div>
            <label>Right: <input type="number" id="right" value="5" onchange="updatePosition()">%</label>
        </div>
        <div>
            <label>Top: <input type="number" id="top" value="15" onchange="updatePosition()">%</label>
        </div>
        <div>
            <label>Width: <input type="number" id="width" value="300" onchange="updatePosition()">px</label>
        </div>
        <div style="margin-top: 30px;">
            <label><input type="checkbox" id="flipHorizontal" onchange="updatePosition()"> Flip Horizontal</label>
        </div>
        <div style="margin-top: 30px;">
            <label>Rotation: <input type="number" id="rotation" value="0" step="1" onchange="updatePosition()">°</label>
        </div>
        <div style="margin-top: 30px;">
            <button onclick="copyPosition()" style="font-size: 36px; padding: 18px 36px;">Copy CSS</button>
        </div>
        </div>
    </div>
    
    <div class="page">
        <div class="text-box">
            <div class="text-content">
                {{TEXT}}
            </div>
        </div>
        
        {{CHARACTER_HTML}}
    </div>
    
    <script>
        // Toggle controls collapse/expand
        function toggleControls() {
            const controls = document.getElementById('controls');
            const btn = controls.querySelector('.collapse-btn');
            controls.classList.toggle('collapsed');
            btn.textContent = controls.classList.contains('collapsed') ? '+' : '−';
        }
        
        function updatePosition() {
            const character = document.getElementById('character');
            if (!character) return;
            
            const right = document.getElementById('right').value;
            const top = document.getElementById('top').value;
            const width = document.getElementById('width').value;
            const flipHorizontal = document.getElementById('flipHorizontal').checked;
            const rotation = document.getElementById('rotation').value;
            
            character.style.right = right + '%';
            character.style.top = top + '%';
            character.style.width = width + 'px';
            
            // Build transform property with flip and rotation
            const transforms = [];
            transforms.push(flipHorizontal ? 'scaleX(-1)' : 'scaleX(1)');
            if (rotation != 0) {
                transforms.push(\`rotateZ(\${rotation}deg)\`);
            }
            character.style.transform = transforms.join(' ');
        }
        
        function copyPosition() {
            const right = document.getElementById('right').value;
            const top = document.getElementById('top').value;
            const width = document.getElementById('width').value;
            const flipHorizontal = document.getElementById('flipHorizontal').checked;
            const rotation = document.getElementById('rotation').value;
            
            // Build transform CSS with flip and rotation
            const transforms = [];
            transforms.push(flipHorizontal ? 'scaleX(-1)' : 'scaleX(1)');
            if (rotation != 0) {
                transforms.push(\`rotateZ(\${rotation}deg)\`);
            }
            const transformCss = transforms.join(' ');
            
            const positioningLines = [
                \`right: \${right}%;\`,
                \`top: \${top}%;\`,
                \`width: \${width}px;\`,
                \`transform: \${transformCss};\`
            ];
            
            const fullCss = \`/* Character Positioning for PDF (2550px × 2550px) */\\n.character {\\n    position: absolute;\\n    \${positioningLines.join(' ')}\\n    height: auto;\\n    z-index: 100;\\n}\`;
            
            navigator.clipboard.writeText(fullCss).then(() => {
                alert('CSS copied to clipboard!');
            });
        }
    </script>
</body>
</html>`;

// Generate pages 5-14
for (let i = 5; i <= 14; i++) {
    const data = pageData[i - 1];
    const characterHtml = data.pose ? 
        `<div class="character character-lighting" id="character">
            <img src="https://pub-92cec53654f84771956bc84dfea65baa.r2.dev/book-mvp-simple-adventure/order-generated-assets/characters/6ec1cd52dce77992/characters_6ec1cd52dce77992_${data.pose}.png" alt="Character">
        </div>` : 
        '<!-- No character on this page -->';
    
    const content = template
        .replace(/{{PAGE}}/g, data.page.toString().padStart(2, '0'))
        .replace(/{{BG_IMAGE}}/g, data.bg)
        .replace(/{{TEXT}}/g, data.text)
        .replace(/{{CHARACTER_HTML}}/g, characterHtml);
    
    const filename = `page${data.page.toString().padStart(2, '0')}-pdf-test.html`;
    const filepath = path.join(__dirname, '..', 'test-pages', filename);
    
    fs.writeFileSync(filepath, content);
    console.log(`Generated ${filename}`);
}

console.log('All PDF test pages generated successfully!');
