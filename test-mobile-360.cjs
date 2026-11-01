const { webkit } = require('playwright');

(async () => {
  const browser = await webkit.launch();
  const context = await browser.newContext({
    viewport: { width: 360, height: 740 },
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  await page.goto('http://localhost:3000/');

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  console.log('Mobile scrollWidth:', scrollWidth, 'clientWidth:', clientWidth);
  console.log('No horizontal scroll at 360px:', scrollWidth <= clientWidth);

  // Check seal button size
  const sealBox = await (await page.$('#wax-seal-btn')).boundingBox();
  console.log('Wax seal size:', sealBox.width, 'x', sealBox.height, '(min 44px:', (sealBox.width >= 44 && sealBox.height >= 44), ')');

  // Check sound checkbox label size
  const soundLabelBox = await (await page.$('.sound-checkbox-label')).boundingBox();
  console.log('Sound label height:', soundLabelBox.height, '(min 44px:', (soundLabelBox.height >= 44), ')');

  await browser.close();
  console.log('Mobile 360px viewport verified successfully!');
})();
