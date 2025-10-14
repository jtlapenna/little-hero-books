#!/usr/bin/env python3
"""Create a completely corrected workflow JSON file."""

import json

# Create the corrected workflow structure
workflow = {
    "name": "3. Book Assembly - Voice of Wonder (14-Page Production)",
    "nodes": [
        {
            "id": "1",
            "name": "Get Order Ready for Assembly",
            "type": "n8n-nodes-base.function",
            "typeVersion": 1,
            "position": [240, 300],
            "parameters": {
                "functionCode": "// Get order ready for book assembly\nconst orderData = $input.first().json;\n\n// Check if order is ready for book assembly\nif (orderData.status !== 'ready_for_book_assembly') {\n  return []; // Skip if not ready\n}\n\n// Update order status to assembling\nconst assemblingOrder = {\n  ...orderData,\n  status: 'book_assembly_in_progress',\n  assemblyStartedAt: new Date().toISOString(),\n  pagesGenerated: 0,\n  totalPagesRequired: 14, // 14 pages for production\n  assemblyProgress: 0\n};\n\nconsole.log('Starting book assembly for order: ' + orderData.amazonOrderId);\nreturn [{ json: assemblingOrder }];"
            }
        },
        {
            "id": "2",
            "name": "Load Generated Characters",
            "type": "n8n-nodes-base.function",
            "typeVersion": 1,
            "position": [460, 300],
            "parameters": {
                "functionCode": "// Load all generated character images for the order\nconst orderData = $input.first().json;\n\n// Get R2 base URL from environment or use default\nconst r2BaseUrl = $env.R2_BASE_URL || 'https://little-hero-assets.r2.cloudflarestorage.com';\nconst characterHash = orderData.characterHash;\n\n// Validate required fields\nif (!characterHash) {\n  throw new Error('Character hash is required for loading character images');\n}\n\n// Validate character hash format (should be 16 characters)\nif (!/^[a-f0-9]{16}$/.test(characterHash)) {\n  throw new Error('Invalid character hash format: ' + characterHash + '. Expected 16-character hex string.');\n}\n\n// Load base character and all poses\nconst characterImages = {\n  base: r2BaseUrl + '/characters/' + characterHash + '/base-character.png',\n  poses: []\n};\n\n// Load all pose images (1-14) with validation\nfor (let i = 1; i <= 14; i++) {\n  const poseFilename = getPoseFilename(i);\n  if (poseFilename) {\n    const imagePath = r2BaseUrl + '/characters/' + characterHash + '/characters_' + characterHash + '_pose' + i.toString().padStart(2, '0') + '.png';\n    \n    characterImages.poses.push({\n      poseNumber: i,\n      poseFilename: poseFilename,\n      imagePath: imagePath,\n      pageNumber: i,\n      validated: false // Will be validated when accessed\n    });\n  }\n}\n\n// Validate that we have the expected number of poses\nconst expectedPoses = 12; // Pages 1-12 have child poses, 13-14 have special cases\nconst actualPoses = characterImages.poses.length;\nif (actualPoses !== expectedPoses) {\n  console.warn('Expected ' + expectedPoses + ' poses, found ' + actualPoses + '. This may cause issues.');\n}\n\nfunction getPoseFilename(pageNumber) {\n  const poseMap = {\n    1: 'walking',\n    2: 'walking-looking-higher',\n    3: 'looking',\n    4: 'floating',\n    5: 'walking-looking-down',\n    6: 'jogging',\n    7: 'looking',\n    8: 'sitting-eating',\n    9: 'crouching',\n    10: 'crawling-moving-happy',\n    11: 'surprised-looking-up',\n    12: 'surprised',\n    13: null, // Tiger only, no child character\n    14: 'flying'\n  };\n  return poseMap[pageNumber];\n}\n\nconst orderWithCharacters = {\n  ...orderData,\n  characterImages: characterImages,\n  r2BaseUrl: r2BaseUrl\n};\n\nconsole.log('Loaded ' + characterImages.poses.length + ' character poses for assembly from ' + r2BaseUrl);\nreturn [{ json: orderWithCharacters }];"
            }
        },
        {
            "id": "3",
            "name": "Load Background Images",
            "type": "n8n-nodes-base.function",
            "typeVersion": 1,
            "position": [680, 300],
            "parameters": {
                "functionCode": "// Load all background images for the Voice of Wonder story\nconst orderData = $input.first().json;\n\n// Get R2 base URL from environment or use default\nconst r2BaseUrl = orderData.r2BaseUrl || $env.R2_BASE_URL || 'https://little-hero-assets.r2.cloudflarestorage.com';\n\n// Validate required fields\nif (!orderData.amazonOrderId) {\n  throw new Error('Amazon Order ID is required for loading background images');\n}\n\n// Load background images for all 14 pages with validation\nconst backgroundImages = [];\nfor (let i = 1; i <= 14; i++) {\n  const sceneName = getSceneName(i);\n  const imagePath = r2BaseUrl + '/backgrounds/page' + i + '_background.png';\n  \n  backgroundImages.push({\n    pageNumber: i,\n    imagePath: imagePath,\n    sceneName: sceneName,\n    validated: false // Will be validated when accessed\n  });\n}\n\n// Validate that we have the expected number of backgrounds\nconst expectedBackgrounds = 14;\nconst actualBackgrounds = backgroundImages.length;\nif (actualBackgrounds !== expectedBackgrounds) {\n  throw new Error('Expected ' + expectedBackgrounds + ' background images, found ' + actualBackgrounds);\n}\n\nfunction getSceneName(pageNumber) {\n  const scenes = [\n    'twilight_walk', 'night_forest', 'magic_doorway', 'courage_leap', 'morning_meadow',\n    'tall_forest', 'mountain_vista', 'picnic_surprise', 'beach_discovery', 'crystal_cave',\n    'giant_flowers', 'enchanted_grove', 'animal_reveal', 'flying_home'\n  ];\n  return scenes[pageNumber - 1] || 'unknown';\n}\n\nconst orderWithBackgrounds = {\n  ...orderData,\n  backgroundImages: backgroundImages\n};\n\nconsole.log('Loaded ' + backgroundImages.length + ' background images for assembly from ' + r2BaseUrl);\nreturn [{ json: orderWithBackgrounds }];"
            }
        },
        {
            "id": "4",
            "name": "Load Story Text",
            "type": "n8n-nodes-base.function",
            "typeVersion": 1,
            "position": [900, 300],
            "parameters": {
                "functionCode": "// Load story text for all pages with character personalization\nconst orderData = $input.first().json;\nconst childName = orderData.characterSpecs?.childName;\nconst hometown = orderData.characterSpecs?.hometown || 'Seattle';\nif (!childName) throw new Error('Child name required');\nconst storyTexts = [];\nfor (let i = 1; i <= 14; i++) {\n  storyTexts.push({\n    pageNumber: i,\n    text: getStoryText(i, childName, hometown),\n    characterName: childName,\n    hometown: hometown,\n    validated: true\n  });\n}\nfunction getStoryText(p, n, h) {\n  const s = [\n    'It was a nice night in ' + h + '. ' + n + ' went outside.',\n    n + ' looked at the stars.<br>You like to explore, the voice said.',\n    'There was a doorway! ' + n + ' walked through.',\n    'Stars were all around! ' + n + ' felt brave.',\n    n + ' noticed footprints and followed them.',\n    'The path went through giant trees. ' + n + ' felt small, but not scared.',\n    'Look how far you came, the voice said.',\n    'Lunch was waiting! ' + n + ' ate happily.<br>You earned this, the voice said.',\n    'The path became warm sand. Look down there, the voice said.<br>' + n + ' found a beautiful shell!',\n    n + ' found a cave with sparkly crystals! They glowed with rainbow colors. You can find beauty everywhere, the voice said.',\n    'The path went through giant flowers. The petals were SO big!<br>You make others happy, the voice said.',\n    'The voice felt very close now. You are perfect just as you are, it said.<br>' + n + ' looked around. Where was the voice?',\n    'Tiger appeared! It was the voice!<br>I have been with you this whole time, said Tiger.',\n    'Ready to fly home? asked Tiger. They flew through the stars to ' + h + '.<br>I am always in your heart, said Tiger.'\n  ];\n  return s[p - 1] || 'Adventure awaits!';\n}\nreturn [{ json: {...orderData, storyTexts: storyTexts} }];"
            }
        },
        {
            "id": "5",
            "name": "Initialize Page Generation Loop",
            "type": "n8n-nodes-base.function",
            "typeVersion": 1,
            "position": [1120, 300],
            "parameters": {
                "functionCode": "// Initialize page generation loop for all 14 pages\nconst orderData = $input.first().json;\n\n// Create array of pages to generate (1-14)\nconst pagesToGenerate = [];\nfor (let i = 1; i <= 14; i++) {\n  const characterImage = orderData.characterImages.poses.find(p => p.pageNumber === i);\n  const backgroundImage = orderData.backgroundImages.find(b => b.pageNumber === i);\n  const storyText = orderData.storyTexts.find(s => s.pageNumber === i);\n  \n  pagesToGenerate.push({\n    ...orderData,\n    currentPageNumber: i,\n    pageStatus: 'pending',\n    pageGenerationAttempts: 0,\n    maxPageAttempts: 3,\n    characterImage: characterImage,\n    backgroundImage: backgroundImage,\n    storyText: storyText\n  });\n}\n\nconsole.log('Initialized page generation for ' + pagesToGenerate.length + ' pages');\nreturn pagesToGenerate.map(page => ({ json: page }));"
            }
        },
        {
            "id": "6",
            "name": "Generate Page HTML",
            "type": "n8n-nodes-base.function",
            "typeVersion": 1,
            "position": [1340, 300],
            "parameters": {
                "functionCode": "// Generate HTML for individual page with proper text box specifications and lighting filters\nconst pageData = $input.first().json;\n\n// Get positioning layout for this page\nconst layout = getPageLayout(pageData.currentPageNumber);\n\n// Get lighting data for this page\nconst lightingData = getLightingData(pageData.currentPageNumber);\n\n// Get pose filename for this page\nconst poseFilename = getPoseFilename(pageData.currentPageNumber);\n\n// Get R2 base URL for dynamic asset paths\nconst r2BaseUrl = pageData.r2BaseUrl || $env.R2_BASE_URL || 'https://little-hero-assets.r2.cloudflarestorage.com';\n\n// Create HTML template for the page with EXACT specifications from existing templates\nconst htmlTemplate = '<!DOCTYPE html>\\n<html>\\n<head>\\n  <meta charset=\"UTF-8\">\\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\\n  <title>Little Hero Book - Page ' + pageData.currentPageNumber + '</title>\\n  <style>\\n    @font-face {\\n      font-family: \\'CustomFont\\';\\n      src: url(\\'' + r2BaseUrl + '/fonts/custom-font.ttf\\') format(\\'truetype\\');\\n    }\\n    \\n    @page {\\n      size: 8.5in 8.5in;\\n      margin: 0;\\n    }\\n    \\n    * {\\n      margin: 0;\\n      padding: 0;\\n      box-sizing: border-box;\\n    }\\n    \\n    body {\\n      font-family: \\'CustomFont\\', \\'Arial\\', sans-serif;\\n      width: 8.5in;\\n      height: 8.5in;\\n      position: relative;\\n      overflow: hidden;\\n    }\\n    \\n    .page {\\n      width: 8.5in;\\n      height: 8.5in;\\n      position: relative;\\n      background-image: url(\\'' + pageData.backgroundImage.imagePath + '\\');\\n      background-size: cover;\\n      background-position: center;\\n      background-repeat: no-repeat;\\n    }\\n    \\n    /* LOCKED-IN TEXT BOX SPECIFICATIONS */\\n    .text-box {\\n      position: absolute;\\n      left: 50%;\\n      bottom: 3%;\\n      width: 80%;\\n      transform: translateX(-50%);\\n      height: auto;\\n      background-image: url(\\'' + r2BaseUrl + '/overlays/text-boxes/standard-box.png\\');\\n      background-size: 100% 100%;\\n      background-repeat: no-repeat;\\n      background-position: center;\\n      padding: 25px 60px;\\n      display: flex;\\n      align-items: center;\\n      justify-content: center;\\n    }\\n    \\n    /* LOCKED-IN TEXT SPECIFICATIONS */\\n    .text-content {\\n      font-size: 14px;\\n      line-height: 1.3;\\n      letter-spacing: 0.5px;\\n      color: #312116;\\n      text-align: center;\\n      font-weight: 400;\\n      width: 100%;\\n      word-wrap: break-word;\\n      hyphens: none;\\n    }\\n    \\n    .character {\\n      position: absolute;\\n      ' + layout.character.position + ';\\n      width: ' + layout.character.width + 'px;\\n      height: auto;\\n      z-index: 100;\\n    }\\n    \\n    .character::before {\\n      content: \\'\\';\\n      position: absolute;\\n      top: 0;\\n      left: 0;\\n      right: 0;\\n      bottom: 0;\\n      pointer-events: none;\\n      z-index: 1;\\n      background: ' + lightingData.gradient + ';\\n      mix-blend-mode: ' + lightingData.blendMode + ';\\n      mask-image: url(\\'' + pageData.characterImage.imagePath + '\\');\\n      -webkit-mask-image: url(\\'' + pageData.characterImage.imagePath + '\\');\\n      mask-size: contain;\\n      mask-repeat: no-repeat;\\n      mask-position: center;\\n    }\\n    \\n    .character img {\\n      width: 100%;\\n      height: auto;\\n      mix-blend-mode: multiply;\\n    }\\n    \\n    .animal-guide {\\n      position: absolute;\\n      z-index: 90;\\n    }\\n    \\n    .animal-guide img {\\n      width: 100%;\\n      height: auto;\\n    }\\n    \\n    .debug-info {\\n      position: absolute;\\n      top: 10px;\\n      left: 10px;\\n      background: rgba(255, 255, 255, 0.9);\\n      padding: 15px;\\n      border-radius: 8px;\\n      font-size: 12px;\\n      font-family: monospace;\\n      max-width: 300px;\\n      z-index: 1000;\\n    }\\n    \\n    .debug-info h4 {\\n      margin-bottom: 8px;\\n      color: #333;\\n    }\\n    \\n    .debug-info ul {\\n      margin-left: 15px;\\n    }\\n    \\n    .debug-info li {\\n      margin-bottom: 3px;\\n    }\\n    \\n    @media print {\\n      .debug-info {\\n        display: none;\\n      }\\n    }\\n  </style>\\n</head>\\n<body>\\n  <div class=\"debug-info\">\\n    <h4>🎨 Page ' + pageData.currentPageNumber + '</h4>\\n    <ul>\\n      <li>Background: ' + pageData.backgroundImage.sceneName + '</li>\\n      <li>Text Box: 80% width, bottom 3%</li>\\n      <li>Character: ' + layout.character.position + '</li>\\n      <li>Lighting: ' + lightingData.blendMode + '</li>\\n      <li>Font: 14px, 0.5px spacing</li>\\n      <li>Size: 8.5\\\" × 8.5\\\" (300 DPI)</li>\\n    </ul>\\n  </div>\\n  \\n  <div class=\"page\">\\n    <div class=\"text-box\">\\n      <div class=\"text-content\">' + pageData.storyText.text + '</div>\\n    </div>\\n    \\n    ' + (poseFilename ? '<div class=\"character\">\\n      <img src=\"' + pageData.characterImage.imagePath + '\" alt=\"Character\">\\n    </div>' : '') + '\\n    \\n    ' + (pageData.currentPageNumber === 13 ? '<div class=\"animal-guide\" style=\"position: absolute; right: -30%; top: -5%; width: 650px; height: auto; z-index: 90;\">\\n      <img src=\"' + r2BaseUrl + '/animals/tiger-appears.png\" alt=\"Animal Guide\">\\n    </div>' : '') + '\\n    \\n    ' + (pageData.currentPageNumber === 14 ? '<div class=\"animal-guide\" style=\"position: absolute; right: 3%; top: 8%; width: 550px; height: auto; z-index: 90;\">\\n      <img src=\"' + r2BaseUrl + '/animals/tiger-flying.png\" alt=\"Animal Flying\">\\n    </div>' : '') + '\\n  </div>\\n</body>\\n</html>\\n';\n\nconst pageResult = {\n  ...pageData,\n  html: htmlTemplate,\n  layout: layout,\n  lightingData: lightingData,\n  poseFilename: poseFilename,\n  generatedAt: new Date().toISOString()\n};\n\nconsole.log('Generated HTML for page ' + pageData.currentPageNumber + ' with ' + lightingData.blendMode + ' lighting');\nreturn [{ json: pageResult }];\n\n// Dynamic positioning function for characters\nfunction getPageLayout(pageNumber) {\n  const layouts = {\n    1: { // Twilight Walk\n      character: { position: 'right: -36%; top: 7%; transform: scaleX(1);', width: 350 }\n    },\n    2: { // Night Forest\n      character: { position: 'right: -35%; top: 18%; transform: scaleX(-1);', width: 300 }\n    },\n    3: { // Magic Doorway\n      character: { position: 'right: -19%; top: 15%; transform: scaleX(-1);', width: 350 }\n    },\n    4: { // Courage Leap\n      character: { position: 'right: -30%; top: -2%; transform: scaleX(1) rotateZ(-15deg);', width: 390 }\n    },\n    5: { // Morning Meadow\n      character: { position: 'right: -31%; top: 14%; transform: scaleX(-1);', width: 300 }\n    },\n    6: { // Tall Forest\n      character: { position: 'right: -32%; top: 13%; transform: scaleX(1);', width: 300 }\n    },\n    7: { // Mountain Vista\n      character: { position: 'right: -26%; top: -4%; transform: scaleX(-1);', width: 350 }\n    },\n    8: { // Picnic Surprise\n      character: { position: 'right: -30%; top: 0%; transform: scaleX(1);', width: 490 }\n    },\n    9: { // Beach Discovery\n      character: { position: 'right: -25%; top: 8%; transform: scaleX(-1);', width: 400 }\n    },\n    10: { // Crystal Cave\n      character: { position: 'right: -18%; top: 13%; transform: scaleX(-1);', width: 500 }\n    },\n    11: { // Giant Flowers\n      character: { position: 'right: -57%; top: 24.5%; transform: scaleX(1);', width: 200 }\n    },\n    12: { // Enchanted Grove\n      character: { position: 'right: -14%; top: 15%; transform: scaleX(-1);', width: 350 }\n    },\n    13: { // Animal Reveal\n      character: { position: 'right: -25%; top: 5%; transform: scaleX(1);', width: 390 }\n    },\n    14: { // Flying Home\n      character: { position: 'right: -5%; top: -5%; transform: scaleX(1);', width: 450 }\n    }\n  };\n  \n  return layouts[pageNumber] || layouts[1]; // Default to first layout if not found\n}\n\n// Get lighting data based on page number\nfunction getLightingData(pageNumber) {\n  const lightingMap = {\n    1: { gradient: 'linear-gradient(to bottom, rgba(255, 107, 53, 0.5) 0%, rgba(78, 205, 196, 0.5) 100%)', blendMode: 'none' },\n    2: { gradient: 'linear-gradient(to bottom left, rgba(255, 221, 51, 0.14) 0%, rgba(52, 30, 102, 0.34) 100%)', blendMode: 'none' },\n    3: { gradient: 'linear-gradient(to bottom right, rgba(111, 26, 122, 1) 0%, rgba(255, 222, 56, 0.5) 100%)', blendMode: 'none' },\n    4: { gradient: 'linear-gradient(to bottom right, rgba(255, 107, 53, 0) 0%, rgba(38, 7, 95, 0.12) 100%)', blendMode: 'multiply' },\n    5: { gradient: 'linear-gradient(to bottom, rgba(255, 107, 53, 0.5) 0%, rgba(78, 205, 196, 0.5) 100%)', blendMode: 'none' },\n    6: { gradient: 'linear-gradient(to bottom, rgba(255, 107, 53, 0.5) 0%, rgba(78, 205, 196, 0.5) 100%)', blendMode: 'none' },\n    7: { gradient: 'linear-gradient(to bottom, rgba(255, 107, 53, 0.5) 0%, rgba(78, 205, 196, 0.5) 100%)', blendMode: 'none' },\n    8: { gradient: 'linear-gradient(to bottom, rgba(255, 107, 53, 0.5) 0%, rgba(78, 205, 196, 0.5) 100%)', blendMode: 'none' },\n    9: { gradient: 'linear-gradient(to bottom, rgba(255, 107, 53, 0.5) 0%, rgba(78, 205, 196, 0.5) 100%)', blendMode: 'overlay' },\n    10: { gradient: 'linear-gradient(to bottom, rgba(255, 107, 53, 0.5) 0%, rgba(78, 205, 196, 0.5) 100%)', blendMode: 'none' },\n    11: { gradient: 'linear-gradient(to bottom, rgba(255, 107, 53, 0.5) 0%, rgba(78, 205, 196, 0.5) 100%)', blendMode: 'none' },\n    12: { gradient: 'linear-gradient(to bottom, rgba(255, 107, 53, 0.5) 0%, rgba(78, 205, 196, 0.5) 100%)', blendMode: 'overlay' },\n    13: { gradient: 'linear-gradient(to bottom, rgba(255, 107, 53, 0.5) 0%, rgba(78, 205, 196, 0.5) 100%)', blendMode: 'overlay' },\n    14: { gradient: 'linear-gradient(to bottom, rgba(255, 107, 53, 0.5) 0%, rgba(78, 205, 196, 0.5) 100%)', blendMode: 'overlay' }\n  };\n  \n  return lightingMap[pageNumber] || { gradient: 'none', blendMode: 'none' };\n}\n\n// Get pose filename mapping\nfunction getPoseFilename(pageNumber) {\n  const poseMap = {\n    1: 'walking',\n    2: 'walking-looking-higher',\n    3: 'looking',\n    4: 'floating',\n    5: 'walking-looking-down',\n    6: 'jogging',\n    7: 'looking',\n    8: 'sitting-eating',\n    9: 'crouching',\n    10: 'crawling-moving-happy',\n    11: 'surprised-looking-up',\n    12: 'surprised',\n    13: null, // Tiger only, no child character\n    14: 'flying'\n  };\n  return poseMap[pageNumber];\n}"
            }
        },
        {
            "id": "7",
            "name": "Generate PDF Page",
            "type": "n8n-nodes-base.function",
            "typeVersion": 1,
            "position": [1560, 300],
            "parameters": {
                "functionCode": "// Generate PDF page with error handling and retry logic\nconst pageData = $input.first().json;\n\nasync function generatePDFWithRetry() {\n  const maxRetries = 3;\n  const retryDelay = 2000; // 2 seconds\n  \n  for (let attempt = 1; attempt <= maxRetries; attempt++) {\n    try {\n      console.log('Generating PDF for page ' + pageData.currentPageNumber + ' (attempt ' + attempt + '/' + maxRetries + ')');\n      \n      // Prepare request body\n      const requestBody = {\n        htmlContent: pageData.html,\n        filename: 'page' + pageData.currentPageNumber + '_' + pageData.amazonOrderId + '.pdf'\n      };\n      \n      // Make request to RenderPDF.io\n      const response = await fetch('https://renderpdf.io/api/pdfs/render-sync', {\n        method: 'POST',\n        headers: {\n          'Content-Type': 'application/json',\n          'Authorization': 'Bearer ' + $env.RENDERPDF_API_KEY\n        },\n        body: JSON.stringify(requestBody)\n      });\n      \n      if (!response.ok) {\n        throw new Error('RenderPDF.io returned ' + response.status + ': ' + response.statusText);\n      }\n      \n      const result = await response.json();\n      \n      if (!result.fileUrl) {\n        throw new Error('No fileUrl returned from RenderPDF.io');\n      }\n      \n      console.log('PDF generated successfully for page ' + pageData.currentPageNumber);\n      \n      return {\n        ...pageData,\n        fileUrl: result.fileUrl,\n        pdfGeneratedAt: new Date().toISOString(),\n        pdfGenerationAttempts: attempt\n      };\n      \n    } catch (error) {\n      console.error('PDF generation attempt ' + attempt + ' failed for page ' + pageData.currentPageNumber + ': ' + error.message);\n      \n      if (attempt === maxRetries) {\n        // Final attempt failed\n        throw new Error('PDF generation failed after ' + maxRetries + ' attempts: ' + error.message);\n      }\n      \n      // Wait before retry\n      console.log('Waiting ' + retryDelay + 'ms before retry...');\n      await new Promise(resolve => setTimeout(resolve, retryDelay));\n    }\n  }\n}\n\n// Execute the async function\nreturn await generatePDFWithRetry().then(result => [{ json: result }]).catch(error => {\n  console.error('PDF generation failed for page ' + pageData.currentPageNumber + ':', error);\n  \n  // Return error data for downstream handling\n  return [{\n    json: {\n      ...pageData,\n      pdfGenerationError: error.message,\n      pdfGenerationFailedAt: new Date().toISOString(),\n      status: 'pdf_generation_failed'\n    }\n  }];\n});"
            }
        },
        {
            "id": "8",
            "name": "Download PDF from RenderPDF and Save to R2",
            "type": "n8n-nodes-base.function",
            "typeVersion": 1,
            "position": [1780, 300],
            "parameters": {
                "functionCode": "// Download PDF from RenderPDF.io with retry logic and upload to R2\nconst pageData = $input.first().json;\n\nasync function downloadPDFWithRetry() {\n  const maxRetries = 3;\n  const retryDelay = 2000; // 2 seconds\n  \n  // Check if PDF generation failed\n  if (pageData.status === 'pdf_generation_failed') {\n    throw new Error('Cannot download PDF: ' + pageData.pdfGenerationError);\n  }\n  \n  const pdfUrl = pageData.fileUrl;\n  if (!pdfUrl) {\n    throw new Error('No PDF URL returned from RenderPDF.io');\n  }\n  \n  for (let attempt = 1; attempt <= maxRetries; attempt++) {\n    try {\n      console.log('Downloading PDF for page ' + pageData.currentPageNumber + ' (attempt ' + attempt + '/' + maxRetries + ')');\n      \n      // Download PDF from RenderPDF.io\n      const response = await fetch(pdfUrl);\n      if (!response.ok) {\n        throw new Error('Failed to download PDF: ' + response.status + ' ' + response.statusText);\n      }\n      \n      const pdfBuffer = await response.arrayBuffer();\n      const pdfBase64 = Buffer.from(pdfBuffer).toString('base64');\n      \n      console.log('PDF downloaded successfully for page ' + pageData.currentPageNumber);\n      \n      // Prepare data for R2 upload\n      return {\n        ...pageData,\n        pdfData: pdfBase64,\n        pdfUrl: pdfUrl,\n        downloadedAt: new Date().toISOString(),\n        downloadAttempts: attempt\n      };\n      \n    } catch (error) {\n      console.error('PDF download attempt ' + attempt + ' failed for page ' + pageData.currentPageNumber + ': ' + error.message);\n      \n      if (attempt === maxRetries) {\n        throw new Error('PDF download failed after ' + maxRetries + ' attempts: ' + error.message);\n      }\n      \n      // Wait before retry\n      console.log('Waiting ' + retryDelay + 'ms before retry...');\n      await new Promise(resolve => setTimeout(resolve, retryDelay));\n    }\n  }\n}\n\n// Execute the async function\nreturn await downloadPDFWithRetry().then(result => [{ json: result }]).catch(error => {\n  console.error('PDF download failed for page ' + pageData.currentPageNumber + ':', error);\n  \n  return [{\n    json: {\n      ...pageData,\n      pdfDownloadError: error.message,\n      pdfDownloadFailedAt: new Date().toISOString(),\n      status: 'pdf_download_failed'\n    }\n  }];\n});"
            }
        },
        {
            "id": "8b",
            "name": "Upload PDF to R2",
            "type": "n8n-nodes-base.function",
            "typeVersion": 1,
            "position": [1900, 300],
            "parameters": {
                "functionCode": "// Upload PDF to R2 with retry logic\nconst pageData = $input.first().json;\n\nasync function uploadPDFToR2WithRetry() {\n  const maxRetries = 3;\n  const retryDelay = 2000; // 2 seconds\n  \n  // Check if PDF download failed\n  if (pageData.status === 'pdf_download_failed') {\n    throw new Error('Cannot upload PDF: ' + pageData.pdfDownloadError);\n  }\n  \n  const r2BaseUrl = pageData.r2BaseUrl || $env.R2_BASE_URL || 'https://little-hero-assets.r2.cloudflarestorage.com';\n  const uploadUrl = r2BaseUrl + '/generated/' + pageData.amazonOrderId + '/page' + pageData.currentPageNumber + '.pdf';\n  \n  for (let attempt = 1; attempt <= maxRetries; attempt++) {\n    try {\n      console.log('Uploading PDF for page ' + pageData.currentPageNumber + ' to R2 (attempt ' + attempt + '/' + maxRetries + ')');\n      \n      // Upload PDF to R2\n      const response = await fetch(uploadUrl, {\n        method: 'PUT',\n        headers: {\n          'Content-Type': 'application/pdf'\n        },\n        body: pageData.pdfData\n      });\n      \n      if (!response.ok) {\n        throw new Error('Failed to upload PDF to R2: ' + response.status + ' ' + response.statusText);\n      }\n      \n      console.log('PDF uploaded successfully for page ' + pageData.currentPageNumber);\n      \n      return {\n        ...pageData,\n        r2UploadUrl: uploadUrl,\n        uploadedAt: new Date().toISOString(),\n        uploadAttempts: attempt\n      };\n      \n    } catch (error) {\n      console.error('PDF upload attempt ' + attempt + ' failed for page ' + pageData.currentPageNumber + ': ' + error.message);\n      \n      if (attempt === maxRetries) {\n        throw new Error('PDF upload failed after ' + maxRetries + ' attempts: ' + error.message);\n      }\n      \n      // Wait before retry\n      console.log('Waiting ' + retryDelay + 'ms before retry...');\n      await new Promise(resolve => setTimeout(resolve, retryDelay));\n    }\n  }\n}\n\n// Execute the async function\nreturn await uploadPDFToR2WithRetry().then(result => [{ json: result }]).catch(error => {\n  console.error('PDF upload failed for page ' + pageData.currentPageNumber + ':', error);\n  \n  return [{\n    json: {\n      ...pageData,\n      pdfUploadError: error.message,\n      pdfUploadFailedAt: new Date().toISOString(),\n      status: 'pdf_upload_failed'\n    }\n  }];\n});"
            }
        },
        {
            "id": "9",
            "name": "Update Page Progress",
            "type": "n8n-nodes-base.function",
            "typeVersion": 1,
            "position": [2000, 300],
            "parameters": {
                "functionCode": "// Update page generation progress\nconst pageData = $input.first().json;\n\n// Get the original order data from the first node in the workflow\nconst orderData = $('Get Order Ready for Assembly').first().json;\n\n// Calculate progress\nconst pagesGenerated = (orderData.pagesGenerated || 0) + 1;\nconst totalPages = orderData.totalPagesRequired || 14;\nconst progress = Math.round((pagesGenerated / totalPages) * 100);\n\nconst updatedOrder = {\n  ...orderData,\n  pagesGenerated: pagesGenerated,\n  assemblyProgress: progress,\n  lastPageGenerated: pageData.currentPageNumber,\n  lastPageGeneratedAt: new Date().toISOString()\n};\n\n// Check if all pages are complete\nif (pagesGenerated >= totalPages) {\n  updatedOrder.status = 'pages_generated';\n  updatedOrder.pagesGeneratedAt = new Date().toISOString();\n  console.log('All pages generated for order: ' + orderData.amazonOrderId);\n} else {\n  console.log('Page ' + pageData.currentPageNumber + ' generated. Progress: ' + progress + '%');\n}\n\nreturn [{ json: updatedOrder }];"
            }
        },
        {
            "id": "10",
            "name": "Check All Pages Complete",
            "type": "n8n-nodes-base.function",
            "typeVersion": 1,
            "position": [2220, 300],
            "parameters": {
                "functionCode": "// Check if all pages have been generated successfully\nconst orderData = $input.first().json;\n\nif (orderData.status === 'pages_generated') {\n  // All pages generated successfully, proceed to compilation\n  const readyForCompilation = {\n    ...orderData,\n    status: 'ready_for_compilation',\n    readyForCompilationAt: new Date().toISOString()\n  };\n  \n  console.log('Order ' + orderData.amazonOrderId + ' ready for PDF compilation');\n  return [{ json: readyForCompilation }];\n} else {\n  // Still processing\n  console.log('Order ' + orderData.amazonOrderId + ' still processing: ' + orderData.assemblyProgress + '% complete');\n  return [{ json: orderData }];\n}"
            }
        },
        {
            "id": "11",
            "name": "Compile Final Book PDF",
            "type": "n8n-nodes-base.function",
            "typeVersion": 1,
            "position": [2440, 300],
            "parameters": {
                "functionCode": "// Compile all individual page PDFs into final book using PDF-lib\nconst orderData = $input.first().json;\n\n// Import PDF-lib (available in n8n environment)\nconst { PDFDocument } = require('pdf-lib');\n\nasync function compileFinalBook() {\n  try {\n    console.log('Starting PDF compilation for order: ' + orderData.amazonOrderId);\n    \n    // Create new PDF document for final book\n    const finalPdf = await PDFDocument.create();\n    \n    // Define page order: Cover > Intro > Pages 1-14 > Dedication > Back Cover\n    const pageOrder = [\n      'cover', 'intro', 'page01', 'page02', 'page03', 'page04', 'page05', 'page06',\n      'page07', 'page08', 'page09', 'page10', 'page11', 'page12', 'page13', 'page14',\n      'dedication', 'back-cover'\n    ];\n    \n    const compilationLog = [];\n    \n    // Get R2 base URL for dynamic asset paths\n    const r2BaseUrl = orderData.r2BaseUrl || $env.R2_BASE_URL || 'https://little-hero-assets.r2.cloudflarestorage.com';\n    \n    // Process each page in order\n    for (const pageType of pageOrder) {\n      try {\n        let pdfUrl;\n        \n        if (pageType.startsWith('page')) {\n          // Story pages (1-14)\n          const pageNum = pageType.replace('page', '');\n          pdfUrl = r2BaseUrl + '/generated/' + orderData.amazonOrderId + '/page' + pageNum + '.pdf';\n        } else {\n          // Placeholder pages (cover, intro, dedication, back-cover)\n          pdfUrl = r2BaseUrl + '/templates/' + pageType + '-placeholder.pdf';\n        }\n        \n        // Download PDF from R2\n        const response = await fetch(pdfUrl);\n        if (!response.ok) {\n          console.log('Placeholder page not found: ' + pageType + ' (' + pdfUrl + ')');\n          compilationLog.push('Skipped ' + pageType + ' - placeholder not found');\n          continue;\n        }\n        \n        const pdfBytes = await response.arrayBuffer();\n        const pdfDoc = await PDFDocument.load(pdfBytes);\n        \n        // Copy all pages from source PDF to final PDF\n        const pages = await finalPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());\n        pages.forEach(page => finalPdf.addPage(page));\n        \n        compilationLog.push('Added ' + pageType);\n        console.log('Added ' + pageType + ' to final book');\n        \n      } catch (error) {\n        console.log('Error processing ' + pageType + ': ' + error.message);\n        compilationLog.push('Error with ' + pageType + ': ' + error.message);\n        \n        // For placeholder pages, continue without failing\n        if (pageType.includes('placeholder') || ['cover', 'intro', 'dedication', 'back-cover'].includes(pageType)) {\n          continue;\n        }\n        \n        // For story pages, this is a critical error\n        throw new Error('Failed to process ' + pageType + ': ' + error.message);\n      }\n    }\n    \n    // Generate final PDF\n    const finalPdfBytes = await finalPdf.save();\n    const finalPdfBase64 = Buffer.from(finalPdfBytes).toString('base64');\n    \n    // Prepare compilation result\n    const compilationResult = {\n      ...orderData,\n      finalBookData: finalPdfBase64,\n      finalBookPath: r2BaseUrl + '/books/' + orderData.amazonOrderId + '_final.pdf',\n      compilationStartedAt: new Date().toISOString(),\n      compilationCompletedAt: new Date().toISOString(),\n      compilationLog: compilationLog,\n      totalPagesInFinalBook: finalPdf.getPageCount(),\n      status: 'final_book_compiled'\n    };\n    \n    console.log('PDF compilation completed for order: ' + orderData.amazonOrderId);\n    console.log('Final book contains ' + finalPdf.getPageCount() + ' pages');\n    console.log('Compilation log: ' + compilationLog.join(', '));\n    \n    return [{ json: compilationResult }];\n    \n  } catch (error) {\n    console.error('PDF compilation failed for order ' + orderData.amazonOrderId + ':', error);\n    \n    const errorResult = {\n      ...orderData,\n      compilationError: error.message,\n      compilationFailedAt: new Date().toISOString(),\n      status: 'compilation_failed'\n    };\n    \n    return [{ json: errorResult }];\n  }\n}\n\n// Execute the async function\nreturn await compileFinalBook();"
            }
        },
        {
            "id": "12",
            "name": "Upload Final Book to Storage",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.1,
            "position": [2660, 300],
            "parameters": {
                "method": "PUT",
                "url": "{{ $json.r2BaseUrl || $env.R2_BASE_URL || 'https://little-hero-assets.r2.cloudflarestorage.com' }}/books/{{ $json.amazonOrderId }}_final.pdf",
                "authentication": "predefinedCredentialType",
                "nodeCredentialType": "cloudflareR2Api",
                "options": {
                    "headers": {
                        "parameters": [
                            {
                                "name": "Content-Type",
                                "value": "application/pdf"
                            }
                        ]
                    }
                },
                "bodyParameters": {
                    "parameters": [
                        {
                            "name": "file",
                            "value": "={{ $json.finalBookData }}"
                        }
                    ]
                }
            }
        },
        {
            "id": "13",
            "name": "Update Order Status Complete",
            "type": "n8n-nodes-base.function",
            "typeVersion": 1,
            "position": [2880, 300],
            "parameters": {
                "functionCode": "// Update order status to completed\nconst orderData = $input.first().json;\nconst r2BaseUrl = orderData.r2BaseUrl || process.env.R2_BASE_URL || 'https://little-hero-assets.r2.cloudflarestorage.com';\nconst completedOrder = {\n  ...orderData,\n  status: 'book_assembly_completed',\n  bookAssemblyCompletedAt: new Date().toISOString(),\n  finalBookUrl: r2BaseUrl + '/books/' + orderData.amazonOrderId + '_final.pdf',\n  totalAssemblyTime: new Date(orderData.bookAssemblyCompletedAt) - new Date(orderData.assemblyStartedAt),\n  averageTimePerPage: Math.round((new Date(orderData.bookAssemblyCompletedAt) - new Date(orderData.assemblyStartedAt)) / orderData.totalPagesRequired / 1000)\n};\nconsole.log('Book assembly completed for order: ' + orderData.amazonOrderId);\nreturn [{ json: completedOrder }];"
            }
        },
        {
            "id": "14",
            "name": "Log Assembly Results",
            "type": "n8n-nodes-base.function",
            "typeVersion": 1,
            "position": [3100, 300],
            "parameters": {
                "functionCode": "// Log assembly results for monitoring\nconst orderData = $input.first().json;\n\nconst logEntry = {\n  timestamp: new Date().toISOString(),\n  workflow: '3-book-assembly-voice-of-wonder',\n  orderId: orderData.amazonOrderId,\n  status: orderData.status,\n  pagesGenerated: orderData.pagesGenerated,\n  totalPagesRequired: orderData.totalPagesRequired,\n  assemblyProgress: orderData.assemblyProgress,\n  currentPageNumber: orderData.currentPageNumber,\n  pageStatus: orderData.pageStatus,\n  assemblyTime: orderData.totalAssemblyTime || 'N/A',\n  averageTimePerPage: orderData.averageTimePerPage || 'N/A',\n  finalBookUrl: orderData.finalBookUrl || 'N/A'\n};\n\nconsole.log('Book Assembly Results:', JSON.stringify(logEntry, null, 2));\nreturn [{ json: logEntry }];"
            }
        }
    ],
    "connections": {
        "Get Order Ready for Assembly": {
            "main": [
                [
                    {
                        "node": "Load Generated Characters",
                        "type": "main",
                        "index": 0
                    }
                ]
            ]
        },
        "Load Generated Characters": {
            "main": [
                [
                    {
                        "node": "Load Background Images",
                        "type": "main",
                        "index": 0
                    }
                ]
            ]
        },
        "Load Background Images": {
            "main": [
                [
                    {
                        "node": "Load Story Text",
                        "type": "main",
                        "index": 0
                    }
                ]
            ]
        },
        "Load Story Text": {
            "main": [
                [
                    {
                        "node": "Initialize Page Generation Loop",
                        "type": "main",
                        "index": 0
                    }
                ]
            ]
        },
        "Initialize Page Generation Loop": {
            "main": [
                [
                    {
                        "node": "Generate Page HTML",
                        "type": "main",
                        "index": 0
                    }
                ]
            ]
        },
        "Generate Page HTML": {
            "main": [
                [
                    {
                        "node": "Generate PDF Page",
                        "type": "main",
                        "index": 0
                    }
                ]
            ]
        },
        "Generate PDF Page": {
            "main": [
                [
                    {
                        "node": "Download PDF from RenderPDF and Save to R2",
                        "type": "main",
                        "index": 0
                    }
                ]
            ]
        },
        "Download PDF from RenderPDF and Save to R2": {
            "main": [
                [
                    {
                        "node": "Upload PDF to R2",
                        "type": "main",
                        "index": 0
                    }
                ]
            ]
        },
        "Upload PDF to R2": {
            "main": [
                [
                    {
                        "node": "Update Page Progress",
                        "type": "main",
                        "index": 0
                    }
                ]
            ]
        },
        "Update Page Progress": {
            "main": [
                [
                    {
                        "node": "Check All Pages Complete",
                        "type": "main",
                        "index": 0
                    }
                ]
            ]
        },
        "Check All Pages Complete": {
            "main": [
                [
                    {
                        "node": "Compile Final Book PDF",
                        "type": "main",
                        "index": 0
                    }
                ]
            ]
        },
        "Compile Final Book PDF": {
            "main": [
                [
                    {
                        "node": "Upload Final Book to Storage",
                        "type": "main",
                        "index": 0
                    }
                ]
            ]
        },
        "Upload Final Book to Storage": {
            "main": [
                [
                    {
                        "node": "Update Order Status Complete",
                        "type": "main",
                        "index": 0
                    }
                ]
            ]
        },
        "Update Order Status Complete": {
            "main": [
                [
                    {
                        "node": "Log Assembly Results",
                        "type": "main",
                        "index": 0
                    }
                ]
            ]
        }
    },
    "pinData": {},
    "settings": {
        "executionOrder": "v1"
    },
    "staticData": None,
    "tags": [],
    "triggerCount": 0,
    "updatedAt": "2024-01-15T10:00:00.000Z",
    "versionId": "1"
}

# Write the corrected workflow
with open('docs/n8n-workflow-files/n8n-new/3-book-assembly-production-fixed.json', 'w') as f:
    json.dump(workflow, f, indent=2)

print("✅ Corrected workflow created successfully!")
print("📁 File: docs/n8n-workflow-files/n8n-new/3-book-assembly-production-fixed.json")
print("\n🔧 Fixes applied:")
print("   ✅ Node 4: Removed template literals with quotes")
print("   ✅ Node 13: Added dynamic R2 URL")
print("   ✅ All nodes: Used string concatenation instead of template literals")
print("\n📋 This file should now import successfully into n8n!")

