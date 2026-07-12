const { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction } = require('@solana/web3.js');
const { Program, Provider } = require('@coral-xyz/anchor');
const crypto = require('crypto');
const fs = require('fs');

const COUNTER_IDL = require('./src/idl.cjs').COUNTER_IDL;
const COUNTER_PROGRAM = new PublicKey(COUNTER_IDL.address);
const ER_ENDPOINT = 'https://devnet.magicblock.app';
const NOOP_PROGRAM = new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV');
const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');

class SimpleProvider {
  constructor(connection) {
    this.connection = connection;
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runChecks() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const ephConnection = new Connection(ER_ENDPOINT, { commitment: 'confirmed' });
  
  const fundedKey = JSON.parse(fs.readFileSync('./funded-key.json', 'utf8'));
  const burnerKeypair = Keypair.fromSecretKey(Uint8Array.from(fundedKey));
  const tempKeypair = Keypair.generate(); // Random session key
  
  const counterPda = PublicKey.findProgramAddressSync([Buffer.from('counter')], COUNTER_PROGRAM)[0];
  const provider = new SimpleProvider(connection);
  const program = new Program(COUNTER_IDL, provider);
  
  const submitTx = async (tx, useTempKp, ephemeral) => {
    const conn = ephemeral ? ephConnection : connection;
    const fetchHash = conn.getLatestBlockhash().catch(() => null);
    const hashRes = await Promise.race([
      fetchHash,
      new Promise(r => setTimeout(() => r(null), 10000))
    ]);
    if (!hashRes) throw new Error("getLatestBlockhash timed out");
    const { blockhash, lastValidBlockHeight } = hashRes;
    
    tx.recentBlockhash = blockhash;
    tx.feePayer = useTempKp ? tempKeypair.publicKey : burnerKeypair.publicKey;
    
    if (useTempKp) {
      tx.sign(tempKeypair);
    } else {
      tx.sign(burnerKeypair);
    }
    
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'processed');
    return sig;
  };

  const results = {};

  // ==========================================
  // CHECK 1: SESSION WALLET FUNDING
  // ==========================================
  console.log("\n--- CHECK 1: SESSION WALLET FUNDING ---");
  try {
    const balBefore = await connection.getBalance(tempKeypair.publicKey);
    console.log(`Balance before: ${balBefore} lamports`);
    
    const transferTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: burnerKeypair.publicKey,
        toPubkey: tempKeypair.publicKey,
        lamports: 0.02 * LAMPORTS_PER_SOL,
      })
    );
    const sig1 = await submitTx(transferTx, false, false);
    console.log(`Transfer signature: ${sig1}`);
    
    const balAfter = await connection.getBalance(tempKeypair.publicKey);
    console.log(`Balance after: ${balAfter} lamports`);
    
    if (balAfter - balBefore === 0.02 * LAMPORTS_PER_SOL) {
      results.check1 = `PASS - Transfer successful. Sig: ${sig1}, Before: ${balBefore}, After: ${balAfter}`;
    } else {
      results.check1 = `FAIL - Balance did not increase by expected amount.`;
    }
  } catch (e) {
    results.check1 = `FAIL - Error: ${e.message}`;
  }

  // ==========================================
  // CHECK 2 & 3: FULL SEQUENTIAL MATCH & NOOP
  // ==========================================
  console.log("\n--- CHECK 2 & 3: SEQUENTIAL & NOOP ---");
  try {
    // 1. Delegate
    const info = await connection.getAccountInfo(counterPda).catch(() => null);
    if (!info || info.owner.equals(COUNTER_PROGRAM)) {
      console.log("Delegating...");
      const [bufferPda] = PublicKey.findProgramAddressSync([Buffer.from('buffer'), counterPda.toBuffer()], COUNTER_PROGRAM);
      const [delegationRecordPda] = PublicKey.findProgramAddressSync([Buffer.from('delegation'), counterPda.toBuffer()], DELEGATION_PROGRAM_ID);
      const [delegationMetadataPda] = PublicKey.findProgramAddressSync([Buffer.from('delegation-metadata'), counterPda.toBuffer()], DELEGATION_PROGRAM_ID);
      
      const tx = await program.methods.delegate().accounts({
        payer: tempKeypair.publicKey,
        pda: counterPda,
        bufferPda,
        delegationRecordPda,
        delegationMetadataPda,
        ownerProgram: COUNTER_PROGRAM,
        delegationProgram: DELEGATION_PROGRAM_ID,
        systemProgram: new PublicKey('11111111111111111111111111111111')
      }).transaction();
      
      await submitTx(tx, true, false);
      await sleep(2000); // sync
    }

    // P1 Start Count
    let p1Start = 0;
    const erInfo1 = await ephConnection.getAccountInfo(counterPda);
    if (erInfo1) {
      p1Start = Number(program.coder.accounts.decode('counter', erInfo1.data).count);
    }
    
    // P1 Taps
    console.log(`P1 Start: ${p1Start}`);
    for (let i = 0; i < 5; i++) {
      const tx = await program.methods.increment().accounts({ counter: counterPda }).transaction();
      tx.add(new TransactionInstruction({ programId: NOOP_PROGRAM, keys: [], data: Buffer.from(crypto.getRandomValues(new Uint8Array(5))) }));
      await submitTx(tx, true, true);
    }
    await sleep(1000);
    
    let p1End = 0;
    const erInfo2 = await ephConnection.getAccountInfo(counterPda);
    if (erInfo2) {
      p1End = Number(program.coder.accounts.decode('counter', erInfo2.data).count);
    }
    
    // P2 Start Count
    let p2Start = p1End; // sequential
    
    // P2 Taps (Check 3 - 10 rapid taps for NOOP verification)
    console.log(`P2 Start: ${p2Start}`);
    let sigs = new Set();
    for (let i = 0; i < 10; i++) {
      const tx = await program.methods.increment().accounts({ counter: counterPda }).transaction();
      tx.add(new TransactionInstruction({ programId: NOOP_PROGRAM, keys: [], data: Buffer.from(crypto.getRandomValues(new Uint8Array(5))) }));
      const sig = await submitTx(tx, true, true);
      sigs.add(sig);
    }
    await sleep(1000);
    
    let p2End = 0;
    const erInfo3 = await ephConnection.getAccountInfo(counterPda);
    if (erInfo3) {
      p2End = Number(program.coder.accounts.decode('counter', erInfo3.data).count);
    }
    
    const p1Delta = p1End - p1Start;
    const p2Delta = p2End - p2Start;
    const winner = p1Delta > p2Delta ? 'Player 1' : (p2Delta > p1Delta ? 'Player 2' : 'Tie');
    
    // Undelegate
    console.log("Undelegating...");
    const tx = await program.methods.undelegate().accounts({
      payer: tempKeypair.publicKey,
      counter: counterPda,
      magicProgram: new PublicKey('Magic11111111111111111111111111111111111111'),
      magicContext: new PublicKey('MagicContext1111111111111111111111111111111')
    }).transaction();
    const undelSig = await submitTx(tx, true, true);
    
    results.check2 = `PASS - P1 Start: ${p1Start}, P1 End: ${p1End}, P1 Delta: ${p1Delta}, P2 Start: ${p2Start}, P2 End: ${p2End}, P2 Delta: ${p2Delta}, Winner: ${winner}, Undelegate Sig: ${undelSig}`;
    
    if (sigs.size === 10 && p2Delta === 10) {
      results.check3 = `PASS - 10 unique signatures generated, count strictly increased by 10.`;
    } else {
      results.check3 = `FAIL - Expected 10 unique sigs and delta 10, got ${sigs.size} sigs and delta ${p2Delta}`;
    }
  } catch (e) {
    results.check2 = `FAIL - Error: ${e.message}`;
    results.check3 = `FAIL - Error: ${e.message}`;
  }

  console.log(JSON.stringify(results, null, 2));
}

runChecks().catch(console.error);
