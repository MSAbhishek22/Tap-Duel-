const { Connection, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');

async function tryAirdrops() {
  const wallet = Keypair.generate();
  console.log('Testing airdrops for new wallet:', wallet.publicKey.toBase58());

  const endpoints = [
    { name: 'Solana Devnet (Standard)', url: 'https://api.devnet.solana.com' },
    { name: 'Solana Devnet (Helius Public)', url: 'https://devnet.helius-rpc.com/?api-key=14bc6996-fdf9-424a-9b19-c09a3dc8fef6' },
    { name: 'Solana Devnet (Ankr)', url: 'https://rpc.ankr.com/solana_devnet' }
  ];

  for (const ep of endpoints) {
    console.log(`\nTrying ${ep.name}...`);
    try {
      const conn = new Connection(ep.url, 'confirmed');
      const sig = await conn.requestAirdrop(wallet.publicKey, 0.05 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig);
      console.log(`✅ SUCCESS! Funded via ${ep.name}. Signature: ${sig}`);
      require('fs').writeFileSync('funded-key.json', JSON.stringify(Array.from(wallet.secretKey)));
      console.log('Saved to funded-key.json');
      return; // Exit if one succeeds
    } catch (e) {
      console.error(`❌ FAILED on ${ep.name}:`, e.message);
    }
  }
  
  console.log('\nAll airdrop attempts failed.');
}

tryAirdrops();
