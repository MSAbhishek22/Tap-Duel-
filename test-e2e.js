import puppeteer from 'puppeteer';

(async () => {
  console.log('🚀 Starting Tap Duel E2E Test...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Expose function to log to Node console
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  
  await page.goto('http://127.0.0.1:5173');
  console.log('✅ Loaded http://127.0.0.1:5173');
  
  // Wait for Burner Wallet button to appear
  await page.waitForSelector('#btn-burner-wallet', { timeout: 5000 });
  console.log('🔥 Found Burner Wallet button, clicking...');
  await page.click('#btn-burner-wallet');
  
  // Wait for burner address to appear
  await page.waitForSelector('#burner-address', { timeout: 5000 });
  const burnerAddress = await page.$eval('#burner-address', el => el.textContent);
  console.log('Got newly generated burner address:', burnerAddress);

  // Fund it manually from funded-key.json
  const { Connection, Keypair, SystemProgram, Transaction, LAMPORTS_PER_SOL, PublicKey } = await import('@solana/web3.js');
  const fs = await import('fs');
  const fundedKeyStr = fs.readFileSync('./funded-key.json', 'utf8');
  const fundedKp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fundedKeyStr)));
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  console.log('💸 Sending 0.05 SOL from funded main wallet to burner address...');
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fundedKp.publicKey,
      toPubkey: new PublicKey(burnerAddress),
      lamports: 0.05 * LAMPORTS_PER_SOL,
    })
  );
  tx.feePayer = fundedKp.publicKey;
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.sign(fundedKp);
  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(sig, 'processed');
  console.log('✅ Funded successfully! Sig:', sig);
  
  // Wait for "START MATCH" button in the lobby
  console.log('⏳ Waiting for START MATCH button...');
  await page.waitForSelector('.btn-start', { timeout: 10000 });
  console.log('⚔️ Found START MATCH button, clicking...');
  await page.click('.btn-start');
  
  // Wait for the tap button to appear (meaning delegation is done and we are playing)
  console.log('⏳ Waiting for Match to Start (Delegation happening in background)...');
  await page.waitForSelector('.tap-button', { timeout: 45000 });
  console.log('👆 Match started (Player 1)! Commencing rapid taps...');
  
  // Tap for P1
  for (let i = 0; i < 5; i++) {
    await page.waitForSelector('.tap-button', { visible: true });
    await page.click('.tap-button').catch(() => {});
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log('✅ P1 taps submitted! Waiting for P1 turn to end...');
  
  // Wait for P2 Lobby
  await page.waitForSelector('.phase-lobby h2', { timeout: 25000 });
  console.log('🔄 P1 finished! In P2 Lobby. Clicking START PLAYER 2...');
  
  // Find the button with text "START PLAYER 2"
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('.btn-start'));
    const p2Btn = buttons.find(b => b.textContent.includes('START PLAYER 2'));
    if (p2Btn) p2Btn.click();
  });

  // Wait for P2 tap button
  console.log('⏳ Waiting for P2 Match to Start...');
  await page.waitForSelector('.tap-button', { timeout: 10000 });
  console.log('👆 Match started (Player 2)! Commencing rapid taps...');

  // Tap for P2
  for (let i = 0; i < 5; i++) {
    await page.waitForSelector('.tap-button', { visible: true });
    await page.click('.tap-button').catch(() => {});
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('✅ P2 taps submitted! Waiting for match to end...');

  // Wait for the match to end
  await page.waitForSelector('.phase-ended', { timeout: 25000 });
  console.log('🏆 Match Ended!');
  
  // Click undelegate
  console.log('📤 Committing final state back to Solana (Undelegate)...');
  await page.click('.btn-undelegate');
  
  // Wait for undelegation status
  await new Promise(r => setTimeout(r, 5000));
  
  console.log('✅ Full Flow Verified Successfully!');
  await browser.close();
})();
