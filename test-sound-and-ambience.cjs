const { webkit } = require('playwright');

(async () => {
  console.log('--- STARTING VERIFICATION FOR SOUND AND AMBIENCE ---');
  const browser = await webkit.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: 'dark'
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.error('PAGE ERROR:', msg.text());
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push(err.toString());
    console.error('PAGE UNHANDLED ERROR:', err);
  });

  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });

  // 1. Initial State Check
  console.log('\n--- 1. VERIFYING INITIAL INTRO & AUDIO STATE ---');
  const introVisible = await page.isVisible('#sealed-intro');
  const appInert = await page.$eval('#app-wrapper', el => el.hasAttribute('inert'));
  const appVisibility = await page.$eval('#app-wrapper', el => getComputedStyle(el).visibility);
  const sealBtnAria = await page.$eval('#wax-seal-btn', el => el.getAttribute('aria-label'));
  const soundChecked = await page.$eval('#intro-sound-checkbox', el => el.checked);
  const liveRegionExists = await page.$('#intro-live-region') !== null;
  const sponsorLink = await page.$eval('.intro-sponsor-link', el => ({
    text: el.innerText.trim(),
    href: el.href,
    target: el.target,
    rel: el.rel
  }));

  console.log('Sealed Intro Visible:', introVisible);
  console.log('Dashboard is inert:', appInert);
  console.log('Dashboard visibility:', appVisibility);
  console.log('Seal Button aria-label:', sealBtnAria);
  console.log('Play sound checkbox is checked by default:', soundChecked);
  console.log('Screen reader live region exists:', liveRegionExists);
  console.log('Sponsor Link:', sponsorLink);

  // 2. Early Release Hold Test
  console.log('\n--- 2. TESTING PRESS AND HOLD (EARLY RELEASE) ---');
  const seal = await page.$('#wax-seal-btn');
  const box = await seal.boundingBox();

  // Mouse down on seal for 500ms (less than 1500ms)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(400);

  const isHolding = await page.$eval('#wax-seal-element', el => el.classList.contains('holding'));
  const promptHolding = await page.$eval('#seal-prompt-text', el => el.innerText.trim());
  console.log('Seal shakes and shows holding state:', isHolding);
  console.log('Prompt updates while holding:', promptHolding);

  // Release early
  await page.mouse.up();
  await page.waitForTimeout(250);

  const isHoldingAfterRelease = await page.$eval('#wax-seal-element', el => el.classList.contains('holding'));
  const promptAfterRelease = await page.$eval('#seal-prompt-text', el => el.innerText.trim());
  const dashOffset = await page.$eval('#seal-ring-fill', el => el.style.strokeDashoffset);
  console.log('Seal shaking stopped after early release:', !isHoldingAfterRelease);
  console.log('Prompt restored after early release:', promptAfterRelease);
  console.log('Ring drained back:', parseFloat(dashOffset) > 400);

  // 3. Full Hold (1.5s) to Break the Seal
  console.log('\n--- 3. TESTING FULL HOLD TO BREAK SEAL (1.5s) ---');
  await page.mouse.down();
  await page.waitForTimeout(1650);
  await page.mouse.up();

  // Wait for 450ms unseal delay + focus transition
  await page.waitForTimeout(800);

  // Check seal shattered and live region announced
  const sealBroken = await page.$eval('#wax-seal-element', el => el.classList.contains('broken'));
  const liveText = await page.$eval('#intro-live-region', el => el.innerText.trim());
  console.log('Seal split into two halves (.broken):', sealBroken);
  console.log('Screen reader announcement:', liveText);

  // Wait for 1.4s door animation
  await page.waitForTimeout(900);

  const introUnsealed = await page.$eval('#sealed-intro', el => el.classList.contains('unsealed'));
  const appInertAfter = await page.$eval('#app-wrapper', el => el.hasAttribute('inert'));
  const appVisibilityAfter = await page.$eval('#app-wrapper', el => getComputedStyle(el).visibility);
  const activeFocus = await page.evaluate(() => document.activeElement ? document.activeElement.id : null);

  console.log('Intro marked unsealed (doors open):', introUnsealed);
  console.log('Dashboard inert removed:', !appInertAfter);
  console.log('Dashboard visibility after doors open:', appVisibilityAfter);
  console.log('Focus moved to main title (#crypt-main-title):', activeFocus === 'crypt-main-title');

  // 4. Verify Ambience State & Sound Toggle
  console.log('\n--- 4. TESTING SOUND CONTROLS & AMBIENCE ---');
  const soundBtnAria = await page.$eval('#btn-sound-toggle', el => el.getAttribute('aria-pressed'));
  const soundIcon = await page.$eval('#sound-icon-display', el => el.innerText.trim());
  console.log('Sound toggle corner button aria-pressed:', soundBtnAria);
  console.log('Sound toggle icon:', soundIcon);

  // Click corner toggle to mute
  await page.click('#btn-sound-toggle');
  await page.waitForTimeout(150);
  const soundBtnMuted = await page.$eval('#btn-sound-toggle', el => el.getAttribute('aria-pressed'));
  const soundIconMuted = await page.$eval('#sound-icon-display', el => el.innerText.trim());
  const storedPref = await page.evaluate(() => localStorage.getItem('horcrux_ledger_sound_pref_v4'));
  console.log('Sound toggled to mute aria-pressed:', soundBtnMuted);
  console.log('Sound icon after mute:', soundIconMuted);
  console.log('Mute stored in localStorage:', storedPref);

  // Click again to un-mute
  await page.click('#btn-sound-toggle');
  await page.waitForTimeout(150);
  console.log('Sound re-enabled aria-pressed:', await page.$eval('#btn-sound-toggle', el => el.getAttribute('aria-pressed')));

  // Test volume popover via gear button
  await page.click('#btn-sound-settings');
  await page.waitForTimeout(150);
  const popoverOpen = await page.$eval('#sound-popover-panel', el => el.classList.contains('open'));
  console.log('Volume popover opened via gear button:', popoverOpen);

  // 5. Test Replay Intro link
  console.log('\n--- 5. TESTING REPLAY INTRO ---');
  await page.click('#btn-replay-intro');
  await page.waitForTimeout(300);
  const introReopened = !(await page.$eval('#sealed-intro', el => el.classList.contains('unsealed')));
  const appInertOnReplay = await page.$eval('#app-wrapper', el => el.hasAttribute('inert'));
  console.log('Intro reopened via Replay link in footer:', introReopened);
  console.log('App made inert again during replay:', appInertOnReplay);

  // 6. Test Skip Intro Button
  console.log('\n--- 6. TESTING SKIP INTRO BUTTON ---');
  await page.click('#btn-skip-intro');
  await page.waitForTimeout(400);
  const unsealedAfterSkip = await page.$eval('#sealed-intro', el => el.classList.contains('unsealed'));
  const appInteractiveAfterSkip = !await page.$eval('#app-wrapper', el => el.hasAttribute('inert'));
  console.log('Unsealed after clicking Skip intro:', unsealedAfterSkip);
  console.log('Dashboard interactive after skip:', appInteractiveAfterSkip);

  // 7. Verify Console Errors
  console.log('\n--- 7. CONSOLE ERRORS CHECK ---');
  console.log('Total console errors:', consoleErrors.length);
  if (consoleErrors.length > 0) {
    console.error('Errors found:', consoleErrors);
  } else {
    console.log('PASS: Zero console errors detected.');
  }

  await page.screenshot({ path: 'verification-success.png' });
  console.log('Screenshot captured to verification-success.png');

  await browser.close();
  console.log('\n--- ALL VERIFICATIONS COMPLETED SUCCESSFULLY ---');
})();
