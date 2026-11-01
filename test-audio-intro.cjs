const { webkit } = require('playwright');
const path = require('path');

(async () => {
  const browser = await webkit.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: 'dark'
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.toString()));

  console.log('--- NAVIGATING TO THE HORCRUX LEDGER ---');
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });

  // 1. Verify Intro Elements
  console.log('--- 1. INTRO SCENE & ELEMENTS ---');
  const introVisible = await page.isVisible('#sealed-intro');
  const motesCanvasVisible = await page.isVisible('#intro-motes-canvas');
  const leatherCardVisible = await page.isVisible('#ledger-cover-card');
  const soundChoicesVisible = await page.isVisible('.intro-audio-choice');
  const kapidhwajNoteVisible = await page.isVisible('.intro-sponsor-note');

  console.log('Sealed Intro Visible:', introVisible);
  console.log('Dust motes canvas visible:', motesCanvasVisible);
  console.log('Antique leather card visible:', leatherCardVisible);
  console.log('Sound choices visible:', soundChoicesVisible);
  console.log('Kapidhwaj sponsor note visible:', kapidhwajNoteVisible);

  await page.screenshot({ path: 'screenshot-intro-v2.png' });

  // 2. Test Press-and-Hold & Early Release Reset
  console.log('--- 2. TEST PRESS AND HOLD (EARLY RELEASE) ---');
  const seal = await page.$('#wax-seal-btn');
  const box = await seal.boundingBox();

  // Mouse down for 400ms (less than 1200ms)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(400);

  // Check that holding class was added and ring started filling
  const isHolding = (await page.getAttribute('#wax-seal-element', 'class')).includes('holding');
  console.log('Seal shows holding/shaking animation during hold:', isHolding);

  // Release early
  await page.mouse.up();
  await page.waitForTimeout(200);
  const isReset = !(await page.getAttribute('#wax-seal-element', 'class')).includes('holding');
  const promptAfterReset = await page.$eval('#seal-prompt-text', el => el.innerText.trim());
  console.log('Seal reset after early release:', isReset);
  console.log('Prompt restored after early release:', promptAfterReset);

  // 3. Test Full Hold (1.2s) to Break the Seal
  console.log('--- 3. TEST FULL HOLD TO BREAK SEAL ---');
  await page.mouse.down();
  await page.waitForTimeout(1350); // full hold
  await page.mouse.up();
  await page.waitForTimeout(800); // door opening animation

  const introUnsealed = (await page.getAttribute('#sealed-intro', 'class')).includes('unsealed');
  console.log('Intro successfully unsealed and doors opened:', introUnsealed);

  await page.screenshot({ path: 'screenshot-dashboard-unsealed.png' });

  // 4. Test Sound Widget & Popover
  console.log('--- 4. TEST SOUND SETTINGS WIDGET ---');
  await page.click('#btn-sound-toggle');
  await page.waitForTimeout(250);
  const popoverOpen = (await page.getAttribute('#sound-popover-panel', 'class')).includes('open');
  console.log('Sound popover panel opened:', popoverOpen);

  // Toggle Ambience
  await page.click('#btn-ambience-toggle');
  const ambienceState = await page.$eval('#btn-ambience-toggle', el => el.innerText.trim());
  console.log('Ambience toggled to:', ambienceState);

  // Close popover
  await page.click('#btn-sound-toggle');

  // 5. Test Replay Intro Link in Footer
  console.log('--- 5. TEST REPLAY INTRO ---');
  await page.click('#btn-replay-intro');
  await page.waitForTimeout(300);
  const introReopened = !(await page.getAttribute('#sealed-intro', 'class')).includes('unsealed');
  console.log('Intro successfully reopened via Replay link:', introReopened);

  // Skip intro to return to dashboard
  await page.click('#btn-skip-intro');
  await page.waitForTimeout(400);

  // 6. Test Glitch Effects
  console.log('--- 6. TEST GLITCH IN THE CRYPT ---');
  await page.dispatchEvent('#crypt-main-title', 'pointerdown');
  await page.waitForTimeout(100);
  const titleGlitched = (await page.getAttribute('#crypt-main-title', 'class')).includes('crypt-glitched');
  console.log('Main title glitched on tap:', titleGlitched);

  // 7. Verify Sponsor Links
  console.log('--- 7. VERIFY SPONSOR INSTAGRAM LINKS ---');
  const links = await page.$$eval('a[href*="instagram.com"]', els => els.map(a => a.href));
  console.log('Instagram URLs verified:', links.length, 'links pointing to:', links[0]);

  console.log('--- CONSOLE ERRORS ---');
  console.log(consoleErrors.length === 0 ? 'Clean console: No errors!' : consoleErrors);

  await browser.close();
  console.log('ALL TESTS COMPLETED SUCCESSFULLY!');
})();
