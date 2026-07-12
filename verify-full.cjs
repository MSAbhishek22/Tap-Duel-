const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } = require('@solana/web3.js');
const { Program, AnchorProvider, Wallet } = require('@coral-xyz/anchor');
const fs = require('fs');

const { COUNTER_IDL } = require('./src/idl.cjs');

const ER_ENDPOINT = 'https://devnet.magicblock.app';
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const ephConnection = new Connection(ER_ENDPOINT, 'confirmed');

const COUNTER_PROGRAM_ID = new PublicKey('79sGyNW41g8TrKyQwk7SZu432SH9ZfHmtRzEtR6CSt3n');
const counterPda = PublicKey.findProgramAddressSync([Buffer.from("counter")], COUNTER_PROGRAM_ID)[0];

async function printBalance(pubkey, stepName) {
  const bal = await connection.getBalance(pubkey);
  console.log(`💰 Balance after ${stepName}: ${(bal / 1e9).toFixed(5)} SOL`);
  return bal;
}

function explorerLink(sig, cluster = 'devnet', customUrl = '') {
  if (customUrl) {
     return `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent(customUrl)}`;
  }
  return `https://explorer.solana.com/tx/${sig}?cluster=${cluster}`;
}

async function fetchCounterState(conn) {
  const info = await conn.getAccountInfo(counterPda);
  if (!info || info.data.length < 16) return 0;
  return Number(info.data.readBigUInt64LE(8));
}

function createIncrementIx() {
  return new TransactionInstruction({
    programId: COUNTER_PROGRAM_ID,
    keys: [ { pubkey: counterPda, isSigner: false, isWritable: true } ],
    data: Buffer.from([11, 18, 104, 9, 104, 174, 59, 33])
  });
}

async function runVerification() {
  console.log('🚀 Phase B & C: Starting Real On-Chain Verification...');
  
  const secretKey = JSON.parse(fs.readFileSync('./funded-key.json', 'utf8'));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  console.log('✅ Loaded Wallet:', wallet.publicKey.toBase58());

  let bal = await printBalance(wallet.publicKey, 'Initial Load');
  if (bal === 0) throw new Error("Wallet has 0 SOL.");

  const provider = new AnchorProvider(connection, new Wallet(wallet), { commitment: 'confirmed' });
  const baseProgram = new Program(COUNTER_IDL, provider);

  console.log(`\n🔍 Checking Base Layer PDA status: ${counterPda.toBase58()}`);
  let info = await connection.getAccountInfo(counterPda);
  console.log('PDA Owner on Devnet:', info ? info.owner.toBase58() : 'Not Found');

  // PHASE B: DELEGATE
  if (!info || info.owner.equals(COUNTER_PROGRAM_ID)) {
    console.log('\n⏳ Initiating delegation to Ephemeral Rollup...');
    const delegateTx = await baseProgram.methods
        .delegate()
        .accounts({ payer: wallet.publicKey, pda: counterPda })
        .transaction();

    const { blockhash } = await connection.getLatestBlockhash();
    delegateTx.recentBlockhash = blockhash;
    delegateTx.feePayer = wallet.publicKey;
    delegateTx.sign(wallet);
    
    const sig = await connection.sendRawTransaction(delegateTx.serialize(), { skipPreflight: true });
    await connection.confirmTransaction(sig, 'confirmed');
    console.log(`✅ Delegate Signature: ${sig}`);
    console.log(`🔗 Explorer Link: ${explorerLink(sig)}`);
    
    info = await connection.getAccountInfo(counterPda);
    console.log(`🔍 Post-Delegate PDA Owner: ${info.owner.toBase58()}`);
    if (info.owner.equals(COUNTER_PROGRAM_ID)) throw new Error("Failed to delegate.");
  } else {
    console.log('✅ PDA is already delegated.');
  }
  await printBalance(wallet.publicKey, 'Delegation');

  await new Promise(r => setTimeout(r, 2000));

  const startCount = await fetchCounterState(ephConnection);
  console.log(`\n📊 Start Count on ER: ${startCount}`);

  // PHASE B/C: CONCURRENT TAPS
  console.log('\n👆 Simulating Player 1 and Player 2 (Concurrent)...');
  const p1Start = startCount;
  let p2Start = null; 

  const tapSigs = [];
  let p1TapsCount = 0;
  let p2TapsCount = 0;

  for (let i = 0; i < 15; i++) {
    const isP1 = i % 3 !== 0; 
    
    if (!isP1 && p2Start === null) {
      p2Start = await fetchCounterState(ephConnection);
      console.log(`\n🎮 Player 2 JOINS! Recorded P2 Start Count: ${p2Start}`);
    }

    const startTs = Date.now();
    try {
      const tx = new Transaction().add(createIncrementIx());
      const { blockhash } = await ephConnection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;
      tx.sign(wallet);
      const sig = await ephConnection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
      
      let confirmedTs;
      try {
        await ephConnection.confirmTransaction(sig, 'confirmed');
        confirmedTs = Date.now();
      } catch (e) {
        confirmedTs = Date.now(); 
      }
      
      const latency = confirmedTs - startTs;
      if (isP1) {
         tapSigs.push({ sig, latency, startTs, confirmedTs });
         console.log(`[P1 TAP] Sig: ${sig} | Latency: ${latency}ms | Pre: ${startTs} Post: ${confirmedTs}`);
         console.log(`         Link: ${explorerLink(sig, 'custom', ER_ENDPOINT)}`);
         p1TapsCount++;
      } else {
         console.log(`[P2 TAP] Sig: ${sig} | Latency: ${latency}ms`);
         p2TapsCount++;
      }
    } catch (e) {
      console.error(`❌ Tap failed:`, e.message);
    }
  }

  const avgLatency = tapSigs.reduce((a, b) => a + b.latency, 0) / tapSigs.length;
  const maxLatency = Math.max(...tapSigs.map(t => t.latency));
  console.log(`\n✅ Taps submitted. Avg Latency: ${avgLatency.toFixed(2)}ms, Max Latency: ${maxLatency}ms`);
  await printBalance(wallet.publicKey, 'Taps');

  const endCount = await fetchCounterState(ephConnection);
  console.log(`\n📊 End Count on ER: ${endCount}`);
  
  const p1ExpectedDelta = p1TapsCount;
  const p1ActualDelta = endCount - p1Start;
  console.log(`\n--- CONCURRENCY DELTA REPORT ---`);
  console.log(`Global Count: ${startCount} -> ${endCount} (+${endCount - startCount})`);
  console.log(`P1 Raw Delta Calculation: (End ${endCount} - Start ${p1Start}) = ${p1ActualDelta}`);
  console.log(`P1 Actual Sent Taps: ${p1TapsCount}`);
  
  if (p1ActualDelta !== p1ExpectedDelta) {
      console.log(`⚠️ CONTAMINATION DETECTED! Player 1 delta score (${p1ActualDelta}) includes Player 2's taps because the global counter moved while P1 was playing.`);
      console.log(`⚠️ CONCLUSION: Concurrent overlapping sessions sharing a single global PDA are NOT viable for accurate isolated scoring.`);
      console.log(`⚠️ FIX: We MUST switch the game format to SEQUENTIAL TURNS.`);
  }

  // PHASE B3: Undelegate
  console.log('\n📤 Committing final state back to Devnet (Undelegate)...');
  const undelegateTx = await baseProgram.methods
    .undelegate()
    .accounts({ payer: wallet.publicKey, pda: counterPda })
    .transaction();
  const { blockhash: uHash } = await connection.getLatestBlockhash();
  undelegateTx.recentBlockhash = uHash;
  undelegateTx.feePayer = wallet.publicKey;
  undelegateTx.sign(wallet);
  
  const uSig = await connection.sendRawTransaction(undelegateTx.serialize(), { skipPreflight: true });
  await connection.confirmTransaction(uSig, 'confirmed');
  console.log(`✅ Undelegate Signature: ${uSig}`);
  console.log(`🔗 Explorer Link: ${explorerLink(uSig)}`);
  await printBalance(wallet.publicKey, 'Undelegate');
  
  console.log('\n🔍 Final Check: Fetching state directly from Devnet base layer...');
  const finalStateCount = await fetchCounterState(connection);
  console.log(`✅ Base Layer Count is now: ${finalStateCount}`);
  
  console.log('\n🎉 E2E VERIFICATION COMPLETE!');
}

runVerification().catch(console.error);
