const puppeteer = require('puppeteer');
const { Connection, Keypair, SystemProgram, Transaction, LAMPORTS_PER_SOL, PublicKey } = require('@solana/web3.js');
const fs = require('fs');

(async () => {
  console.log('Opening browser to grab/generate demo burner key...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  await page.goto('http://127.0.0.1:5174');
  
  // Click Burner Wallet to trigger generation and localStorage save
  await page.waitForSelector('#btn-burner-wallet', { timeout: 5000 });
  await page.click('#btn-burner-wallet');
  await new Promise(r => setTimeout(r, 1000));
  
  const savedKeyStr = await page.evaluate(() => localStorage.getItem('demo_burner_key'));
  const burnerAddress = await page.$eval('#burner-address', el => el.textContent);
  
  await browser.close();
  
  if (!savedKeyStr) throw new Error('Failed to grab demo_burner_key from localStorage');
  
  console.log(`Grabbed demo_burner_key for address: ${burnerAddress}`);
  
  const fundedKeyStr = fs.readFileSync('./funded-key.json', 'utf8');
  const fundedKp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fundedKeyStr)));
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  console.log('💸 Sending 0.1 SOL to pre-fund it...');
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fundedKp.publicKey,
      toPubkey: new PublicKey(burnerAddress),
      lamports: 0.1 * LAMPORTS_PER_SOL,
    })
  );
  tx.feePayer = fundedKp.publicKey;
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.sign(fundedKp);
  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(sig, 'processed');
  
  const bal = await connection.getBalance(new PublicKey(burnerAddress));
  console.log(`✅ Funded successfully! Sig: ${sig}`);
  console.log(`✅ Final Balance: ${bal / LAMPORTS_PER_SOL} SOL`);
  console.log(`\n\nTo ensure your browser uses THIS key, open DevTools at http://127.0.0.1:5174 and run:`);
  console.log(`localStorage.setItem('demo_burner_key', '${savedKeyStr}')`);
})();
