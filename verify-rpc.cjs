const { Connection } = require('@solana/web3.js');

const ER_ENDPOINT = 'https://devnet.magicblock.app';
const baseConnection = new Connection('https://api.devnet.solana.com', 'confirmed');
const ephConnection = new Connection(ER_ENDPOINT, 'confirmed');

const signatures = {
  delegate: '5HUwhequKJtMgKrFSknFu1pSnrFyDw2HBK61ezYavW7ggRLPmVggiGLfg85kAPVwdCAiwyWN3ZM1Dg3NKLg6LVtY',
  undelegate: '3GSeCLpUubvtZ7QxqNEN5qBq3U9R9pYxmWgTpUdoEJZMUztzz2Pf2UtTHYsVEfa5wd4H37dZZCUavyPwbtAwhpnz',
  tap1: '45JrTLHbTWThYEVnxym3jmSmXW4e3cnBuJ8sMmyeby4zYGpgZbveQRCgiupNf4mPyoGef99pJJTPZUGaWBEwvtvP',
  tap2: 'JPMwgxbggUkyEc5urJJdvCHvdqRVfJZVhjTsUtaPEUVLd3GLfAxDKyPC97r68hpFZ8Av6XhrLuutV8CeXEaoN8W'
};

async function verifyTx(name, sig, isER = false) {
  const conn = isER ? ephConnection : baseConnection;
  console.log(`\n🔍 Verifying ${name} (${sig})...`);
  try {
    const tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0 });
    if (!tx) {
      console.log('❌ Transaction not found on ' + (isER ? 'ER Node' : 'Devnet'));
      return;
    }
    console.log(`Slot: ${tx.slot} | BlockTime: ${tx.blockTime}`);
    console.log(`Error Status (meta.err): ${tx.meta.err === null ? 'null (SUCCESS)' : JSON.stringify(tx.meta.err)}`);
    
    const programIds = tx.transaction.message.accountKeys
      .map(k => k.toBase58())
      .filter((k, i) => {
         // Filter for accounts that are called as programs in the instructions
         return tx.transaction.message.instructions.some(ix => ix.programIdIndex === i) || 
                tx.meta.innerInstructions?.some(inner => inner.instructions.some(ix => ix.programIdIndex === i));
      });
      
    // deduplicate
    const uniquePrograms = [...new Set(programIds)];
    console.log(`Programs Invoked:`);
    uniquePrograms.forEach(p => console.log(` - ${p}`));

    // Append to report directly
    const fs = require('fs');
    fs.appendFileSync('rpc-proof.txt', `\n[${name}] ${sig}\nSlot: ${tx.slot}\nError: ${tx.meta.err === null ? 'null (Success)' : 'Failed'}\nPrograms: ${uniquePrograms.join(', ')}\n`);

  } catch (e) {
    console.error('Error fetching:', e.message);
  }
}

async function run() {
  const fs = require('fs');
  fs.writeFileSync('rpc-proof.txt', '--- RAW RPC PROOF ---\n');
  
  await verifyTx('DELEGATE (Base Layer)', signatures.delegate, false);
  await verifyTx('UNDELEGATE (Base Layer)', signatures.undelegate, false);
  await verifyTx('TAP 1 (Ephemeral Rollup)', signatures.tap1, true);
  await verifyTx('TAP 2 (Ephemeral Rollup)', signatures.tap2, true);
  
  console.log('\n✅ Phase F completed. Output saved to rpc-proof.txt');
}

run();
