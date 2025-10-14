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

    console.log('Testing different gradient settings...\n');

    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Test 1: Increase opacity to 100% to make it very visible
    console.log('Test 1: Setting opacity to 100% on both colors');
    await page.evaluate(() => {
        document.getElementById('startOpacity').value = 100;
        document.getElementById('endOpacity').value = 100;
        updateLighting();
    });
    await wait(1000);
    await page.screenshot({ path: 'test1-high-opacity.png' });
    console.log('Screenshot saved: test1-high-opacity.png');

    // Test 2: Try multiply blend mode (darker)
    console.log('\nTest 2: Trying multiply blend mode');
    await page.evaluate(() => {
        document.getElementById('blendMode').value = 'multiply';
        updateLighting();
    });
    await wait(1000);
    await page.screenshot({ path: 'test2-multiply.png' });
    console.log('Screenshot saved: test2-multiply.png');

    // Test 3: Try screen blend mode (lighter)
    console.log('\nTest 3: Trying screen blend mode');
    await page.evaluate(() => {
        document.getElementById('blendMode').value = 'screen';
        updateLighting();
    });
    await wait(1000);
    await page.screenshot({ path: 'test3-screen.png' });
    console.log('Screenshot saved: test3-screen.png');

    // Test 4: Try color-dodge (very bright)
    console.log('\nTest 4: Trying color-dodge blend mode');
    await page.evaluate(() => {
        document.getElementById('blendMode').value = 'color-dodge';
        updateLighting();
    });
    await wait(1000);
    await page.screenshot({ path: 'test4-color-dodge.png' });
    console.log('Screenshot saved: test4-color-dodge.png');

    // Test 5: Verify the ::after element exists and has content
    console.log('\nTest 5: Checking ::after element properties');
    const afterInfo = await page.evaluate(() => {
        const character = document.getElementById('character');
        const afterStyle = window.getComputedStyle(character, '::after');

        return {
            content: afterStyle.content,
            display: afterStyle.display,
            width: afterStyle.width,
            height: afterStyle.height,
            background: afterStyle.background,
            maskImage: afterStyle.maskImage || afterStyle.webkitMaskImage,
            mixBlendMode: afterStyle.mixBlendMode,
            zIndex: afterStyle.zIndex
        };
    });
    console.log('::after properties:', JSON.stringify(afterInfo, null, 2));

    console.log('\nAll tests complete. Browser will remain open for manual inspection...');

    // Keep browser open
    // await browser.close();
})();
