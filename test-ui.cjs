const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runTest(viewport, suffix) {
  console.log(`\n📸 Starting UI Test: ${suffix}`);
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport(viewport);

  const keyStr = fs.readFileSync(path.join(__dirname, 'funded-key.json'), 'utf8');

  console.log('Navigating to app...');
  await page.goto('http://127.0.0.1:5173');
  
  // Inject the funded key
  await page.evaluate((k) => localStorage.setItem('funded_key', k), keyStr);
  
  await delay(1000);
  await page.screenshot({ path: `screenshot-1-connect-${suffix}.png` });

  console.log('Clicking Burner Wallet...');
  await page.evaluate(() => {
     const btns = Array.from(document.querySelectorAll('button'));
     const b = btns.find(btn => btn.textContent.includes('Burner Wallet'));
     if (b) b.click();
  });

  await delay(2000);
  await page.screenshot({ path: `screenshot-2-lobby-${suffix}.png` });

  console.log('Clicking START MATCH (P1)...');
  await page.evaluate(() => {
     const btns = Array.from(document.querySelectorAll('button'));
     const b = btns.find(btn => btn.textContent.includes('START MATCH (P1)'));
     if (b) b.click();
  });

  // Wait for P1 playing phase
  console.log('Waiting for P1 Playing phase...');
  await page.waitForFunction(() => {
      const el = document.querySelector('h2');
      return el && el.textContent.includes("PLAYER 1'S TURN");
  }, { timeout: 30000 });
  
  await page.screenshot({ path: `screenshot-3-p1-playing-${suffix}.png` });

  console.log('Tapping for P1 (5 times)...');
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
       const btn = document.querySelector('.tap-button');
       if (btn) btn.click();
    });
    await delay(300);
  }

  // Wait for P2 Lobby
  console.log('Waiting for P2 Lobby...');
  await page.waitForFunction(() => {
      const el = document.querySelector('h2');
      return el && el.textContent.includes("Player 1 Finished!");
  }, { timeout: 30000 });
  
  await page.screenshot({ path: `screenshot-4-p2-lobby-${suffix}.png` });

  console.log('Clicking START PLAYER 2...');
  await page.evaluate(() => {
     const btns = Array.from(document.querySelectorAll('button'));
     const b = btns.find(btn => btn.textContent.includes('START PLAYER 2'));
     if (b) b.click();
  });

  // Wait for P2 Playing phase
  console.log('Waiting for P2 Playing phase...');
  await page.waitForFunction(() => {
      const el = document.querySelector('h2');
      return el && el.textContent.includes("PLAYER 2'S TURN");
  }, { timeout: 30000 });
  
  await page.screenshot({ path: `screenshot-5-p2-playing-${suffix}.png` });

  console.log('Tapping for P2 (7 times)...');
  for (let i = 0; i < 7; i++) {
    await page.evaluate(() => {
       const btn = document.querySelector('.tap-button');
       if (btn) btn.click();
    });
    await delay(300);
  }

  // Wait for Match Complete (Winner Screen)
  console.log('Waiting for End Screen...');
  await page.waitForFunction(() => {
      const el = document.querySelector('h1');
      return el && (el.textContent.includes("Wins!") || el.textContent.includes("Tie!"));
  }, { timeout: 30000 });
  
  await delay(1000);
  await page.screenshot({ path: `screenshot-6-winner-${suffix}.png` });
  
  console.log('Clicking Commit & Undelegate...');
  await page.evaluate(() => {
     const btns = Array.from(document.querySelectorAll('button'));
     const b = btns.find(btn => btn.textContent.includes('Commit Match'));
     if (b) b.click();
  });
  
  await delay(5000); // Give it time to undelegate
  await page.screenshot({ path: `screenshot-7-final-${suffix}.png` });

  await browser.close();
  console.log(`✅ UI Test ${suffix} finished successfully!`);
}

async function main() {
  await runTest({ width: 1280, height: 800 }, 'desktop');
  await runTest({ width: 390, height: 844 }, 'mobile');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
