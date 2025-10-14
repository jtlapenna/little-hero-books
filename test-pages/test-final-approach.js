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

    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    console.log('Testing final masked gradient approach...\n');

    // Test 1: Default (50% opacity)
    console.log('Test 1: Default (50% opacity, overlay)');
    await wait(1000);
    await page.screenshot({ path: 'final-test1-default.png' });
    console.log('Screenshot: final-test1-default.png');

    // Test 2: High opacity (100%)
    console.log('\nTest 2: 100% opacity, overlay');
    await page.evaluate(() => {
        document.getElementById('startOpacity').value = 100;
        document.getElementById('endOpacity').value = 100;
        updateLighting();
    });
    await wait(1000);
    await page.screenshot({ path: 'final-test2-high-opacity.png' });
    console.log('Screenshot: final-test2-high-opacity.png');

    // Test 3: Multiply blend
    console.log('\nTest 3: 100% opacity, multiply');
    await page.evaluate(() => {
        document.getElementById('blendMode').value = 'multiply';
        updateLighting();
    });
    await wait(1000);
    await page.screenshot({ path: 'final-test3-multiply.png' });
    console.log('Screenshot: final-test3-multiply.png');

    // Test 4: Check ::before styles
    const beforeStyles = await page.evaluate(() => {
        const character = document.getElementById('character');
        const beforeStyle = window.getComputedStyle(character, '::before');

        return {
            background: beforeStyle.background,
            maskImage: beforeStyle.maskImage || beforeStyle.webkitMaskImage,
            mixBlendMode: beforeStyle.mixBlendMode,
            width: beforeStyle.width,
            height: beforeStyle.height
        };
    });

    console.log('\n::before element properties:');
    console.log(JSON.stringify(beforeStyles, null, 2));

    console.log('\n✅ Tests complete! Check screenshots to verify masking.');
    console.log('Browser remains open for manual testing...');

    // Keep browser open
    // await browser.close();
})();
