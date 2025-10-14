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

    console.log('Testing new background-blend-mode approach...\n');

    // Test 1: Default settings
    console.log('Test 1: Default settings (50% opacity, overlay)');
    await wait(1000);
    await page.screenshot({ path: 'new-test1-default.png' });
    console.log('Screenshot saved: new-test1-default.png');

    // Test 2: High opacity
    console.log('\nTest 2: High opacity (100%)');
    await page.evaluate(() => {
        document.getElementById('startOpacity').value = 100;
        document.getElementById('endOpacity').value = 100;
        updateLighting();
    });
    await wait(1000);
    await page.screenshot({ path: 'new-test2-high-opacity.png' });
    console.log('Screenshot saved: new-test2-high-opacity.png');

    // Test 3: Multiply blend
    console.log('\nTest 3: Multiply blend mode');
    await page.evaluate(() => {
        document.getElementById('blendMode').value = 'multiply';
        updateLighting();
    });
    await wait(1000);
    await page.screenshot({ path: 'new-test3-multiply.png' });
    console.log('Screenshot saved: new-test3-multiply.png');

    // Test 4: Check if ::before element has the right styles
    const beforeStyles = await page.evaluate(() => {
        const character = document.getElementById('character');
        const beforeStyle = window.getComputedStyle(character, '::before');

        return {
            backgroundImage: beforeStyle.backgroundImage,
            backgroundBlendMode: beforeStyle.backgroundBlendMode,
            display: beforeStyle.display,
            width: beforeStyle.width,
            height: beforeStyle.height
        };
    });

    console.log('\n::before styles:', JSON.stringify(beforeStyles, null, 2));

    console.log('\nAll tests complete. Check the screenshots!');
    console.log('Browser will remain open for inspection...');

    // Keep browser open
    // await browser.close();
})();
