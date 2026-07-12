const { Connection, Keypair } = require('@solana/web3.js');
const fs = require('fs');
async function test() {
  const secretKey = JSON.parse(fs.readFileSync('./funded-key.json', 'utf8'));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
  const bal = await conn.getBalance(wallet.publicKey);
  console.log('Balance:', bal / 1e9, 'SOL');
}
test();
