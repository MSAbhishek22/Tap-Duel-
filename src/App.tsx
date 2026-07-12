import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { Idl, Program, Provider } from '@coral-xyz/anchor';
import { COUNTER_IDL } from './idl';

const COUNTER_PROGRAM = new PublicKey(COUNTER_IDL.address);
const ER_ENDPOINT = 'https://devnet.magicblock.app';
const MATCH_DURATION = 15;
const NOOP_PROGRAM = new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV');

class SimpleProvider implements Provider {
  constructor(public connection: Connection, public publicKey?: PublicKey) {}
}

type GamePhase = 'connect' | 'lobby' | 'delegating' | 'p1_playing' | 'p2_lobby' | 'p2_playing' | 'ended';

const App: React.FC = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [burnerKeypair, setBurnerKeypair] = useState<Keypair | null>(null);

  const publicKey = burnerKeypair ? burnerKeypair.publicKey : wallet.publicKey;
  const sendTransaction = burnerKeypair ? 
    async (tx: Transaction, conn: Connection) => {
      tx.feePayer = burnerKeypair.publicKey;
      const { blockhash } = await conn.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.sign(burnerKeypair);
      return await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    } : wallet.sendTransaction;
  
  const ephConnection = useRef<Connection | null>(null);
  const provider = useRef<Provider>(new SimpleProvider(connection));
  const program = useRef<Program | null>(null);
  const tempKeypair = useRef<Keypair | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const [phase, setPhase] = useState<GamePhase>('connect');
  const [baseCount, setBaseCount] = useState(0);
  const [erCount, setErCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(MATCH_DURATION);
  const [statusMsg, setStatusMsg] = useState('');
  const [lastTxSig, setLastTxSig] = useState('');
  const [error, setError] = useState('');
  
  // Sequential Turn State
  const [p1StartCount, setP1StartCount] = useState(0);
  const [p2StartCount, setP2StartCount] = useState(0);
  const [p1FinalCount, setP1FinalCount] = useState(0);
  const [p2FinalCount, setP2FinalCount] = useState(0);
  const [p1LocalTaps, setP1LocalTaps] = useState(0);
  const [p2LocalTaps, setP2LocalTaps] = useState(0);

  const counterPda = useMemo(() => PublicKey.findProgramAddressSync([Buffer.from('counter')], COUNTER_PROGRAM)[0], []);

  useEffect(() => {
    if (!program.current) program.current = new Program(COUNTER_IDL as Idl, provider.current);
  }, []);

  useEffect(() => {
    if (!publicKey) return setPhase('connect');
    tempKeypair.current = Keypair.fromSeed(publicKey.toBytes());
    setPhase(p => p === 'connect' ? 'lobby' : p);
    connection.getAccountInfo(counterPda).then(info => {
      if (info && program.current) {
        const decoded = program.current.coder.accounts.decode('counter', info.data);
        setBaseCount(Number(decoded.count));
      }
    }).catch(console.error);
  }, [publicKey, connection, counterPda]);

  useEffect(() => {
    if (!publicKey || ephConnection.current) return;
    ephConnection.current = new Connection(ER_ENDPOINT, { commitment: 'confirmed' });
    const sub = ephConnection.current.onAccountChange(counterPda, (info) => {
      if (program.current) {
        try { setErCount(Number(program.current.coder.accounts.decode('counter', info.data).count)); } catch {}
      }
    }, 'processed');
    return () => { if (ephConnection.current) ephConnection.current.removeAccountChangeListener(sub); };
  }, [publicKey]);

  const submitTx = useCallback(async (tx: Transaction, useTempKp: boolean, ephemeral: boolean) => {
    if (!tempKeypair.current || !publicKey || !ephConnection.current) return null;
    const conn = ephemeral ? ephConnection.current : connection;
    
    // Add timeout to getLatestBlockhash
    const fetchHash = conn.getLatestBlockhash().catch(() => null);
    const hashRes = await Promise.race([
      fetchHash,
      new Promise<null>(r => setTimeout(() => r(null), 10000))
    ]);
    if (!hashRes) throw new Error("getLatestBlockhash timed out or failed (Devnet Rate Limit 429?)");
    
    const { blockhash, lastValidBlockHeight } = hashRes;
    tx.recentBlockhash = blockhash;
    tx.feePayer = useTempKp ? tempKeypair.current.publicKey : publicKey;
    if (useTempKp) tx.sign(tempKeypair.current);
    const sig = (!ephemeral && !useTempKp) ? await sendTransaction(tx, conn) : await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'processed');
    return sig;
  }, [publicKey, sendTransaction, connection]);

  const startP1 = useCallback(async () => {
    console.log('startP1 called! program:', !!program.current, 'tempKeypair:', !!tempKeypair.current);
    if (!program.current || !tempKeypair.current) return;
    setPhase('delegating');
    setError('');
    setP1LocalTaps(0);
    try {
      setStatusMsg('Funding session wallet...');
      const bal = await connection.getBalance(tempKeypair.current.publicKey).catch(() => 0);
      if (bal < 0.01 * LAMPORTS_PER_SOL) {
        const transferTx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: tempKeypair.current.publicKey,
            lamports: 0.02 * LAMPORTS_PER_SOL,
          })
        );
        await submitTx(transferTx, false, false);
      }
      
      const info = await connection.getAccountInfo(counterPda).catch(() => null);
      if (!info || info.owner.equals(COUNTER_PROGRAM)) {
        setStatusMsg('Delegating to Ephemeral Rollup...');
        
        // Manually derive all accounts to completely bypass Anchor RPC resolution
        const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');
        const [bufferPda] = PublicKey.findProgramAddressSync([Buffer.from('buffer'), counterPda.toBuffer()], COUNTER_PROGRAM);
        const [delegationRecordPda] = PublicKey.findProgramAddressSync([Buffer.from('delegation'), counterPda.toBuffer()], DELEGATION_PROGRAM_ID);
        const [delegationMetadataPda] = PublicKey.findProgramAddressSync([Buffer.from('delegation-metadata'), counterPda.toBuffer()], DELEGATION_PROGRAM_ID);
        
        const tx = await program.current.methods.delegate().accounts({ 
          payer: tempKeypair.current.publicKey, 
          pda: counterPda,
          bufferPda,
          delegationRecordPda,
          delegationMetadataPda,
          ownerProgram: COUNTER_PROGRAM,
          delegationProgram: DELEGATION_PROGRAM_ID,
          systemProgram: new PublicKey('11111111111111111111111111111111')
        }).transaction();
        
        await submitTx(tx, true, false);
      }
      
      setStatusMsg('Syncing ER State...');
      await new Promise(r => setTimeout(r, 2000));
      if (ephConnection.current) {
        const erInfo = await ephConnection.current.getAccountInfo(counterPda);
        if (erInfo && program.current) {
          const val = Number(program.current.coder.accounts.decode('counter', erInfo.data).count);
          setErCount(val);
          setP1StartCount(val);
        }
      }

      setPhase('p1_playing');
      setTimeLeft(MATCH_DURATION);
      const endTime = Date.now() + MATCH_DURATION * 1000;
      timerRef.current = setInterval(() => {
        const rem = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
        setTimeLeft(rem);
        if (rem <= 0) {
          clearInterval(timerRef.current!);
          ephConnection.current?.getAccountInfo(counterPda).then(i => {
             if (i && program.current) setP1FinalCount(Number(program.current.coder.accounts.decode('counter', i.data).count));
          });
          setPhase('p2_lobby');
        }
      }, 100);
    } catch (e: any) { console.error('START P1 ERROR:', e); setError(e.message || String(e)); setPhase('lobby'); }
  }, [counterPda, submitTx, connection]);

  const startP2 = useCallback(async () => {
    if (!ephConnection.current || !program.current) return;
    const erInfo = await ephConnection.current.getAccountInfo(counterPda);
    if (erInfo) {
       const val = Number(program.current.coder.accounts.decode('counter', erInfo.data).count);
       setP2StartCount(val);
    }
    setP2LocalTaps(0);
    setPhase('p2_playing');
    setTimeLeft(MATCH_DURATION);
    const endTime = Date.now() + MATCH_DURATION * 1000;
    timerRef.current = setInterval(() => {
      const rem = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      setTimeLeft(rem);
      if (rem <= 0) {
        clearInterval(timerRef.current!);
        ephConnection.current?.getAccountInfo(counterPda).then(i => {
           if (i && program.current) setP2FinalCount(Number(program.current.coder.accounts.decode('counter', i.data).count));
        });
        setPhase('ended');
      }
    }, 100);
  }, [counterPda]);

  const handleTap = useCallback(async () => {
    if (!program.current || (phase !== 'p1_playing' && phase !== 'p2_playing')) return;
    try {
      const tx = await program.current.methods.increment().accounts({ counter: counterPda }).transaction();
      tx.add(new TransactionInstruction({ programId: NOOP_PROGRAM, keys: [], data: Buffer.from(crypto.getRandomValues(new Uint8Array(5))) }));
      const sig = await submitTx(tx, true, true);
      if (sig) {
        if (phase === 'p1_playing') setP1LocalTaps(p => p + 1);
        if (phase === 'p2_playing') setP2LocalTaps(p => p + 1);
        setLastTxSig(sig);
      }
    } catch (e) { console.error('Tap failed:', e); }
  }, [phase, counterPda, submitTx]);

  const endMatch = useCallback(async () => {
    if (!program.current || !tempKeypair.current) return;
    try {
      setStatusMsg('Undelegating...');
      const tx = await program.current.methods.undelegate().accounts({ 
        payer: tempKeypair.current.publicKey, 
        counter: counterPda,
        magicProgram: new PublicKey('Magic11111111111111111111111111111111111111'),
        magicContext: new PublicKey('MagicContext1111111111111111111111111111111')
      }).transaction();
      
      await submitTx(tx, true, true);
      setStatusMsg('Committed!');
    } catch { setStatusMsg('Failed (auto-committed?)'); }
  }, [counterPda, submitTx]);

  const p1Score = p1FinalCount > 0 ? (p1FinalCount - p1StartCount) : p1LocalTaps;
  const p2Score = p2FinalCount > 0 ? (p2FinalCount - p2StartCount) : p2LocalTaps;
  
  let winnerText = "It's a Tie!";
  if (p1Score > p2Score) winnerText = "Player 1 Wins!";
  if (p2Score > p1Score) winnerText = "Player 2 Wins!";

  return (
    <div className="app">
      <div className="bg-glow" /><div className="bg-grid" />
      <header className="header"><div className="logo">⚡ TAP DUEL</div><WalletMultiButton /></header>
      <main className="main">
        {phase === 'connect' && (
          <div className="phase-connect">
            <h1>TAP DUEL</h1><p>Connect your wallet to play</p>
            <button id="btn-burner-wallet" className="btn-replay" onClick={() => {
              const handleBurnerWallet = () => {
                const saved = localStorage.getItem('demo_burner_key');
                if (saved) {
                  setBurnerKeypair(Keypair.fromSecretKey(Uint8Array.from(JSON.parse(saved))));
                } else {
                  const newKp = Keypair.generate();
                  localStorage.setItem('demo_burner_key', JSON.stringify(Array.from(newKp.secretKey)));
                  setBurnerKeypair(newKp);
                }
              };
              handleBurnerWallet();
            }}>🔥 Use Burner Wallet</button>
          </div>
        )}
        {phase === 'lobby' && (
          <div className="phase-lobby">
            <>
              <h2>Ready to Battle? (Sequential Turns)</h2>
              {burnerKeypair && (
                <div style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: '1rem', wordBreak: 'break-all' }}>
                  <p><strong>Burner Address:</strong> <span id="burner-address">{burnerKeypair.publicKey.toBase58()}</span></p>
                  <p><em>Demo: Send 0.05 Devnet SOL here to play!</em></p>
                </div>
              )}
              <button className="btn-start" onClick={startP1}>⚔️ START MATCH (P1)</button>
            </>
            {error && <div className="error-msg">{error}</div>}
          </div>
        )}
        {phase === 'delegating' && <div className="phase-delegating"><h2>{statusMsg}</h2></div>}
        
        {(phase === 'p1_playing' || phase === 'p2_playing') && (
          <div className="phase-playing">
            <h2 style={{color: '#ff2a6d'}}>{phase === 'p1_playing' ? "PLAYER 1'S TURN" : "PLAYER 2'S TURN"}</h2>
            <div className={`timer ${timeLeft <= 5 ? 'timer-critical' : ''}`}>{timeLeft}s</div>
            <div className="score-board">
               <div className="score-card"><span>Local Taps</span><span>{phase === 'p1_playing' ? p1LocalTaps : p2LocalTaps}</span></div>
               <div className="score-card er-score"><span>ER Count</span><span>{erCount}</span></div>
            </div>
            <button className="tap-button" onClick={handleTap}>👆 TAP!</button>
          </div>
        )}

        {phase === 'p2_lobby' && (
          <div className="phase-lobby">
            <h2>Player 1 Finished! (Score: {p1Score})</h2>
            <p>Pass the device to Player 2.</p>
            <button className="btn-start" onClick={startP2} style={{background: '#05d9e8'}}>⚔️ START PLAYER 2</button>
          </div>
        )}

        {phase === 'ended' && (
          <div className="phase-ended">
            <h1>{winnerText}</h1>
            <div className="final-score" style={{flexDirection: 'column', gap: '20px'}}>
              <div className="final-score-card"><span>Player 1 (Delta: {p1FinalCount} - {p1StartCount})</span><span className="final-value">{p1Score}</span></div>
              <div className="final-score-card"><span>Player 2 (Delta: {p2FinalCount} - {p2StartCount})</span><span className="final-value">{p2Score}</span></div>
            </div>
            <div className="end-actions">
              <button className="btn-undelegate" onClick={endMatch}>📤 Commit Match</button>
              <button className="btn-replay" onClick={() => setPhase('lobby')}>🔄 Play Again</button>
            </div>
            {statusMsg && <p>{statusMsg}</p>}
          </div>
        )}
      </main>
    </div>
  );
};
export default App;
