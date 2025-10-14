const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: { width: 1400, height: 900 }
    });

    const page = await browser.newPage();
    const filePath = path.join(__dirname, 'page01-test.html');
    await page.goto(`file://${filePath}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#character');

    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    console.log('🎨 Testing COMBINED approach: background-blend-mode + masking\n');

    // Test 1: Default (50%)
    console.log('Test 1: 50% opacity, overlay blend');
    await wait(1000);
    await page.screenshot({ path: 'combined-test1-50pct.png', fullPage: true });

    // Test 2: 100% opacity
    console.log('Test 2: 100% opacity, overlay blend');
    await page.evaluate(() => {
        document.getElementById('startOpacity').value = 100;
        document.getElementById('endOpacity').value = 100;
        updateLighting();
    });
    await wait(1000);
    await page.screenshot({ path: 'combined-test2-100pct.png', fullPage: true });

    // Test 3: Multiply
    console.log('Test 3: 100% opacity, multiply blend');
    await page.evaluate(() => {
        document.getElementById('blendMode').value = 'multiply';
        updateLighting();
    });
    await wait(1000);
    await page.screenshot({ path: 'combined-test3-multiply.png', fullPage: true });

    // Check computed styles
    const styles = await page.evaluate(() => {
        const character = document.getElementById('character');
        const before = window.getComputedStyle(character, '::before');
        return {
            backgroundImage: before.backgroundImage.substring(0, 200) + '...',
            backgroundBlendMode: before.backgroundBlendMode,
            maskImage: (before.maskImage || before.webkitMaskImage || '').substring(0, 100) + '...'
        };
    });

    console.log('\n📊 Computed ::before styles:');
    console.log(JSON.stringify(styles, null, 2));
    console.log('\n✅ All tests complete! Screenshots saved.');
    console.log('Browser remains open - check if gradient is visible AND masked!');

    // Keep open
})();
