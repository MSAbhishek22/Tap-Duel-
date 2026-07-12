const { Connection, Keypair } = require('@solana/web3.js');
const fs = require('fs');

async function testAnkr() {
  const secretKey = JSON.parse(fs.readFileSync('./funded-key.json', 'utf8'));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  
  const conn = new Connection('https://rpc.ankr.com/solana_devnet', 'confirmed');
  try {
    const bal = await conn.getBalance(wallet.publicKey);
    console.log('Balance via Ankr:', bal);
  } catch(e) {
    console.error('Ankr Error:', e);
  }
}
testAnkr();
