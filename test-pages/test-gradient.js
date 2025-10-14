const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: { width: 1400, height: 900 }
    });

    const page = await browser.newPage();

    // Navigate to the local file
    const filePath = path.join(__dirname, 'page01-test.html');
    await page.goto(`file://${filePath}`, { waitUntil: 'networkidle0' });

    // Wait for the page to load
    await page.waitForSelector('#character');

    // Get computed styles of the ::after pseudo-element
    const afterStyles = await page.evaluate(() => {
        const character = document.getElementById('character');
        const afterStyle = window.getComputedStyle(character, '::after');

        return {
            background: afterStyle.background,
            maskImage: afterStyle.maskImage || afterStyle.webkitMaskImage,
            mixBlendMode: afterStyle.mixBlendMode,
            display: afterStyle.display,
            content: afterStyle.content,
            width: afterStyle.width,
            height: afterStyle.height
        };
    });

    console.log('::after pseudo-element styles:', afterStyles);

    // Take a screenshot
    await page.screenshot({
        path: 'test-gradient-screenshot.png',
        fullPage: true
    });

    console.log('Screenshot saved to test-gradient-screenshot.png');

    // Keep browser open for manual inspection
    console.log('Browser will remain open for inspection...');

    // Uncomment to close automatically:
    // await browser.close();
})();
