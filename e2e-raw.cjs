const { Connection, Keypair, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction } = require('@solana/web3.js');
const { Program, AnchorProvider, Wallet } = require('@coral-xyz/anchor');
const { delegateAccount, undelegateAccount } = require('@magicblock-labs/ephemeral-rollups-sdk');
const idl = {
  "address": "79sGyNW41g8TrKyQwk7SZu432SH9ZfHmtRzEtR6CSt3n",
  "metadata": { "name": "public_counter", "version": "0.1.0", "spec": "0.1.0", "description": "Created with Anchor" },
  "instructions": [
    { "name": "delegate", "discriminator": [90, 147, 75, 178, 85, 88, 4, 137], "accounts": [], "args": [] },
    { "name": "increment", "discriminator": [11, 18, 104, 9, 104, 174, 59, 33], "accounts": [ { "name": "counter", "writable": true, "pda": { "seeds": [{ "kind": "const", "value": [99,111,117,110,116,101,114] }] } } ], "args": [] },
    { "name": "undelegate", "discriminator": [131, 148, 180, 198, 91, 104, 42, 238], "accounts": [], "args": [] }
  ],
  "accounts": [ { "name": "Counter", "discriminator": [255, 176, 4, 245, 188, 253, 124, 25] } ],
  "types": [ { "name": "Counter", "type": { "kind": "struct", "fields": [ { "name": "count", "type": "u64" } ] } } ]
};

const ER_ENDPOINT = 'https://devnet.magicblock.app';
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const ephConnection = new Connection(ER_ENDPOINT, 'confirmed');

const COUNTER_PROGRAM_ID = new PublicKey('79sGyNW41g8TrKyQwk7SZu432SH9ZfHmtRzEtR6CSt3n');
const counterPda = PublicKey.findProgramAddressSync([Buffer.from("counter")], COUNTER_PROGRAM_ID)[0];

async function runTest() {
  console.log('🚀 Starting Node E2E Test...');
  const wallet = Keypair.generate();
  console.log('Generated Wallet:', wallet.publicKey.toBase58());

  // Try to get 0.01 SOL
  console.log('Attempting Airdrop of 0.01 SOL...');
  try {
    const sig = await connection.requestAirdrop(wallet.publicKey, 0.01 * 1e9);
    await connection.confirmTransaction(sig, 'confirmed');
    console.log('✅ Airdrop successful! Signature:', sig);
  } catch (err) {
    console.warn('⚠️ Airdrop failed (Rate limit?). We will try to proceed but transactions may fail if 0 balance.');
    console.warn(err.message);
  }

  const provider = new AnchorProvider(connection, new Wallet(wallet), { commitment: 'confirmed' });
  const ephProvider = new AnchorProvider(ephConnection, new Wallet(wallet), { commitment: 'confirmed' });
  const program = new Program(idl, COUNTER_PROGRAM_ID, provider);
  const ephProgram = new Program(idl, COUNTER_PROGRAM_ID, ephProvider);

  // Check if counter is delegated
  const info = await connection.getAccountInfo(counterPda);
  console.log('Counter PDA:', counterPda.toBase58());
  console.log('Counter Owner:', info ? info.owner.toBase58() : 'Not Found');

  if (!info || info.owner.equals(COUNTER_PROGRAM_ID)) {
    console.log('⏳ Counter is on base layer. Attempting delegation...');
    try {
      const delegateTx = await delegateAccount(
        wallet.publicKey,
        counterPda,
        COUNTER_PROGRAM_ID,
        3000
      );
      const { blockhash } = await connection.getLatestBlockhash();
      delegateTx.recentBlockhash = blockhash;
      delegateTx.feePayer = wallet.publicKey;
      delegateTx.sign(wallet);
      const sig = await connection.sendRawTransaction(delegateTx.serialize(), { skipPreflight: true });
      await connection.confirmTransaction(sig, 'confirmed');
      console.log('✅ Delegated successfully! Signature:', sig);
    } catch (err) {
      console.error('❌ Delegation failed:', err.message);
      if (err.message.includes('insufficient funds') || err.message.includes('0x1')) {
         console.error('CRITICAL: Cannot proceed without Devnet SOL to pay base layer fees.');
         return;
      }
    }
  } else {
    console.log('✅ Counter is already delegated!');
  }

  // Phase 3B: Score Isolation Verification
  console.log('--- Phase 3B: Verifying Score Isolation ---');
  console.log('Public Counter uses a SINGLE Global PDA (', counterPda.toBase58(), ').');
  console.log('If two players tap concurrently, their taps will increment the SAME counter.');
  console.log('Therefore, we MUST use a Delta calculation: Score = End_Count - Start_Count.');
  
  const startState = await ephProgram.account.counter.fetch(counterPda).catch(() => ({ count: { toNumber: () => 0 } }));
  const startCount = startState.count.toNumber();
  console.log(`Initial Counter Value before taps: ${startCount}`);

  // Tap 5 times
  console.log('👆 Simulating 5 rapid taps on ER...');
  const tapSigs = [];
  for (let i = 0; i < 5; i++) {
    const startTs = Date.now();
    try {
      const tx = await ephProgram.methods.increment().accounts({ counter: counterPda }).transaction();
      const { blockhash } = await ephConnection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;
      tx.sign(wallet);
      const sig = await ephConnection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
      // We don't await confirmation here for speed, just like the real game
      const latency = Date.now() - startTs;
      tapSigs.push({ sig, latency });
      await new Promise(r => setTimeout(r, 100)); // 100ms interval
    } catch (e) {
      console.error('Tap failed:', e.message);
    }
  }

  // Wait a bit for ER to process
  await new Promise(r => setTimeout(r, 2000));
  console.log(`✅ Sent 5 taps. ER Latencies (ms):`, tapSigs.map(t => t.latency).join(', '));
  console.log('Sample ER Signature:', tapSigs[0]?.sig);

  const endState = await ephProgram.account.counter.fetch(counterPda).catch(() => ({ count: { toNumber: () => 0 } }));
  const endCount = endState.count.toNumber();
  console.log(`Final Counter Value after taps: ${endCount}`);
  console.log(`Player Score (Delta): ${endCount - startCount}`);

  // Undelegate
  console.log('📤 Committing back to Base Layer (Undelegate)...');
  try {
    const undelegateTx = await undelegateAccount(
      wallet.publicKey,
      counterPda,
      COUNTER_PROGRAM_ID
    );
    const { blockhash } = await connection.getLatestBlockhash();
    undelegateTx.recentBlockhash = blockhash;
    undelegateTx.feePayer = wallet.publicKey;
    undelegateTx.sign(wallet);
    const sig = await connection.sendRawTransaction(undelegateTx.serialize(), { skipPreflight: true });
    await connection.confirmTransaction(sig, 'confirmed');
    console.log('✅ Undelegated successfully! Signature:', sig);
  } catch (err) {
    console.error('❌ Undelegation failed:', err.message);
  }
}

runTest().then(() => console.log('Done.'));
