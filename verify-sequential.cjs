const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } = require('@solana/web3.js');
const { Program, AnchorProvider, Wallet } = require('@coral-xyz/anchor');
const fs = require('fs');

const { COUNTER_IDL } = require('./src/idl.cjs');

const ER_ENDPOINT = 'https://devnet.magicblock.app';
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const ephConnection = new Connection(ER_ENDPOINT, 'confirmed');

const COUNTER_PROGRAM_ID = new PublicKey('79sGyNW41g8TrKyQwk7SZu432SH9ZfHmtRzEtR6CSt3n');
const counterPda = PublicKey.findProgramAddressSync([Buffer.from("counter")], COUNTER_PROGRAM_ID)[0];

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

async function sendTaps(wallet, tapCount, playerName) {
  const tapSigs = [];
  for (let i = 0; i < tapCount; i++) {
    const tx = new Transaction().add(createIncrementIx());
    const { blockhash } = await ephConnection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    tx.sign(wallet);
    try {
      const sig = await ephConnection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
      await ephConnection.confirmTransaction(sig, 'confirmed');
      tapSigs.push(sig);
    } catch (e) {
      console.error(`${playerName} Tap ${i+1} failed:`, e.message);
    }
  }
  return tapSigs.length;
}

async function runSequentialTest() {
  console.log('🚀 Phase G: Starting Sequential Turn Test...');
  
  const secretKey = JSON.parse(fs.readFileSync('./funded-key.json', 'utf8'));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  const provider = new AnchorProvider(connection, new Wallet(wallet), { commitment: 'confirmed' });
  const baseProgram = new Program(COUNTER_IDL, provider);

  const info = await connection.getAccountInfo(counterPda);
  if (!info || info.owner.equals(COUNTER_PROGRAM_ID)) {
    console.log('⏳ Delegating...');
    const delegateTx = await baseProgram.methods.delegate().accounts({ payer: wallet.publicKey, pda: counterPda }).transaction();
    const { blockhash } = await connection.getLatestBlockhash();
    delegateTx.recentBlockhash = blockhash;
    delegateTx.feePayer = wallet.publicKey;
    delegateTx.sign(wallet);
    const sig = await connection.sendRawTransaction(delegateTx.serialize(), { skipPreflight: true });
    await connection.confirmTransaction(sig, 'confirmed');
  }

  await new Promise(r => setTimeout(r, 2000));

  // PLAYER 1
  console.log('\n--- PLAYER 1 TURN ---');
  const p1Start = await fetchCounterState(ephConnection);
  console.log(`P1 Start Count: ${p1Start}`);
  
  const p1Expected = 5;
  console.log(`Sending ${p1Expected} taps for Player 1...`);
  const p1ActualTaps = await sendTaps(wallet, p1Expected, 'Player 1');
  
  const p1End = await fetchCounterState(ephConnection);
  console.log(`P1 End Count: ${p1End}`);
  const p1Score = p1End - p1Start;
  console.log(`🏅 Player 1 Computed Delta Score: ${p1Score} (Expected: ${p1ActualTaps})`);

  // PLAYER 2
  console.log('\n--- PLAYER 2 TURN ---');
  const p2Start = await fetchCounterState(ephConnection);
  console.log(`P2 Start Count: ${p2Start}`);
  
  const p2Expected = 7;
  console.log(`Sending ${p2Expected} taps for Player 2...`);
  const p2ActualTaps = await sendTaps(wallet, p2Expected, 'Player 2');
  
  const p2End = await fetchCounterState(ephConnection);
  console.log(`P2 End Count: ${p2End}`);
  const p2Score = p2End - p2Start;
  console.log(`🏅 Player 2 Computed Delta Score: ${p2Score} (Expected: ${p2ActualTaps})`);

  // VERIFICATION
  console.log('\n--- VERIFICATION ---');
  if (p2Start === p1End) {
      console.log('✅ CLEAN START: Player 2 Start Count strictly equals Player 1 End Count.');
  } else {
      console.error(`❌ ERROR: Gap between P1 end (${p1End}) and P2 start (${p2Start})`);
  }

  if (p1Score === p1ActualTaps && p2Score === p2ActualTaps) {
      console.log('✅ CLEAN SCORING: Both delta scores accurately reflect ONLY their own taps with zero contamination!');
  } else {
      console.error('❌ ERROR: Delta scores do not match expected tap counts.');
  }

  try {
    const undelegateTx = await baseProgram.methods.undelegate().accounts({ payer: wallet.publicKey, pda: counterPda }).transaction();
    const { blockhash: uHash } = await connection.getLatestBlockhash();
    undelegateTx.recentBlockhash = uHash;
    undelegateTx.feePayer = wallet.publicKey;
    undelegateTx.sign(wallet);
    const uSig = await connection.sendRawTransaction(undelegateTx.serialize(), { skipPreflight: true });
    await connection.confirmTransaction(uSig, 'confirmed');
  } catch (e) {}
}

runSequentialTest().catch(console.error);
