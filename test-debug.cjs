const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function main() {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  
  const keyStr = fs.readFileSync(path.join(__dirname, 'funded-key.json'), 'utf8');
  await page.goto('http://127.0.0.1:5173');
  await page.evaluate((k) => localStorage.setItem('funded_key', k), keyStr);
  
  await new Promise(r => setTimeout(r, 1000));
  
  console.log('Clicking Burner Wallet...');
  await page.evaluate(() => {
     const btns = Array.from(document.querySelectorAll('button'));
     const b = btns.find(btn => btn.textContent.includes('Burner Wallet'));
     if (b) b.click();
  });
  
  await new Promise(r => setTimeout(r, 2000));
  
  console.log('Clicking START MATCH (P1)...');
  await page.evaluate(() => {
     const btns = Array.from(document.querySelectorAll('button'));
     const b = btns.find(btn => btn.textContent.includes('START MATCH (P1)'));
     if (b) b.click();
  });
  
  await new Promise(r => setTimeout(r, 45000));
  
  const html = await page.evaluate(() => document.querySelector('main').innerHTML);
  console.log('MAIN HTML:', html);

  await browser.close();
}
main().catch(console.error);
