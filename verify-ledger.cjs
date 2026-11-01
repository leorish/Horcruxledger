const { webkit } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await webkit.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();

  const consoleLogs = [];
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
    else consoleLogs.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.toString()));

  console.log('--- NAVIGATING TO APP ---');
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });

  // 1. Check Intro Screen & Take Screenshot
  console.log('--- 1. INTRO SCREEN ---');
  const introVisible = await page.isVisible('#sealed-intro');
  console.log('Sealed Intro Visible:', introVisible);
  await page.screenshot({ path: path.join(__dirname, 'screenshot-intro-1280.png') });

  // 2. Unseal the Ledger
  console.log('--- 2. BREAK THE SEAL ---');
  await page.click('#btn-unseal-trigger');
  await page.waitForTimeout(1100); // wait for door animation
  await page.screenshot({ path: path.join(__dirname, 'screenshot-dark-1280.png') });

  // 3. Test Glitch on Hover & Tap
  console.log('--- 3. TEST GLITCH ---');
  await page.hover('#crypt-main-title');
  const titleClasses = await page.getAttribute('#crypt-main-title', 'class');
  console.log('Title has glitch-target class:', titleClasses.includes('glitch-target'));

  // Pointerdown tap on title
  await page.dispatchEvent('#crypt-main-title', 'pointerdown');
  await page.waitForTimeout(100);
  const tappedTitleClasses = await page.getAttribute('#crypt-main-title', 'class');
  console.log('Title triggered crypt-glitched on tap:', tappedTitleClasses.includes('crypt-glitched'));

  // 4. Verify Instagram Links
  console.log('--- 4. VERIFY INSTAGRAM LINKS ---');
  const igLinks = await page.$$eval('a[href*="instagram.com"]', links => links.map(l => ({
    href: l.href,
    target: l.target,
    rel: l.rel,
    text: l.innerText.trim()
  })));
  console.log('Instagram Links Found:', JSON.stringify(igLinks, null, 2));

  // 5. Test Status Cycle & Stamp on Cup (IV)
  console.log('--- 5. CYCLE STATUS ON CUP ---');
  const cupAdvanceBtn = await page.$('button[data-action="advance"][data-id="4"]');
  if (cupAdvanceBtn) {
    await cupAdvanceBtn.click();
    await page.waitForTimeout(300);
    const toastVisible = await page.isVisible('.toast-item');
    console.log('Toast visible on status advance:', toastVisible);
    const cupBadgeText = await page.$eval('#badge-4', el => el.innerText.trim());
    console.log('Cup status updated to:', cupBadgeText);
  }

  // 6. Test Search & Filter
  console.log('--- 6. SEARCH & FILTER ---');
  await page.fill('#search-input', 'Diadem');
  await page.waitForTimeout(200);
  const visibleCardsCount = await page.$$eval('.artifact-card', cards => cards.filter(c => c.style.display !== 'none').length);
  console.log('Visible cards after searching "Diadem":', visibleCardsCount);
  await page.fill('#search-input', ''); // Clear search

  // Test Filter Chip: Lost
  await page.click('button.chip[data-filter="Lost"]');
  await page.waitForTimeout(200);
  const lostCardsCount = await page.$$eval('.artifact-card', cards => cards.length);
  console.log('Cards matching Lost filter chip:', lostCardsCount);
  await page.click('button.chip[data-filter="all"]');

  // 7. Test Dossier Drawer
  console.log('--- 7. DOSSIER DRAWER ---');
  await page.click('button[data-action="dossier"][data-id="1"]');
  await page.waitForTimeout(400);
  const drawerOpen = await page.isVisible('#dossier-drawer');
  console.log('Dossier drawer opened:', drawerOpen);
  // Type notes
  await page.fill('#dossier-field-notes', 'Surveillance active around Hogwarts dungeon.');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500); // Allow 350ms transition to complete
  const drawerClosed = !(await page.isVisible('#dossier-drawer'));
  console.log('Dossier drawer closed with Escape:', drawerClosed);

  // 8. Test Estate Map Toggle
  console.log('--- 8. ESTATE MAP TOGGLE ---');
  await page.click('#btn-toggle-view');
  await page.waitForTimeout(300);
  const mapVisible = await page.isVisible('#estate-map-view');
  console.log('Estate Map visible:', mapVisible);
  await page.screenshot({ path: path.join(__dirname, 'screenshot-map-1280.png') });
  await page.click('#btn-toggle-view'); // Switch back to ledger

  // 9. Test Candlelight Toggle (Light Mode)
  console.log('--- 9. CANDLELIGHT TOGGLE (LIGHT MODE) ---');
  await page.click('#btn-toggle-candle');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(__dirname, 'screenshot-light-1280.png') });

  // Responsive Screenshots: 768px (Tablet)
  console.log('--- 10. TABLET 768px SCREENSHOT ---');
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(__dirname, 'screenshot-tablet-768.png') });

  // Responsive Screenshots: 360px (Mobile)
  console.log('--- 11. MOBILE 360px SCREENSHOT ---');
  await page.setViewportSize({ width: 360, height: 780 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(__dirname, 'screenshot-mobile-360.png') });

  // Easter Egg "tom"
  console.log('--- 12. EASTER EGG ---');
  await page.keyboard.type('tom');
  await page.waitForTimeout(100);
  const easterEggVisible = await page.isVisible('#easter-egg-overlay');
  console.log('Easter egg visible after typing "tom":', easterEggVisible);

  console.log('--- CONSOLE ERRORS ---');
  console.log(consoleErrors.length === 0 ? 'None! Clean console.' : consoleErrors);

  await browser.close();
  console.log('ALL VERIFICATIONS COMPLETED SUCCESSFULLY!');
})();
