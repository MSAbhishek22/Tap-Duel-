<div align="center">
  <h1>⚡ Tap Duel</h1>
  <p><strong>A high-speed, competitive on-chain clicker game built on Solana Ephemeral Rollups</strong></p>
</div>

---

## 🎮 What is Tap Duel?
**Tap Duel** is a fully decentralized, real-time multiplayer clicker game. Players face off in rapid 15-second intervals to score as many taps as possible. 

By leveraging **MagicBlock's Ephemeral Rollups**, Tap Duel processes hundreds of transactions per second seamlessly, allowing for high-frequency on-chain actions with **zero base-layer congestion** and **zero transaction fees** during gameplay.

## 🚀 Key Features
- **Ephemeral Rollup Integration**: The global game state is temporarily delegated to a high-throughput ER, allowing instant, fee-less transactions.
- **Sequential Turn Architecture**: Ensures mathematical integrity by isolating player turns on the shared global counter PDA.
- **Frictionless Onboarding**: A built-in "Burner Wallet" instantly provisions a session keypair, avoiding the need for users to manually sign 100+ transactions via Phantom.
- **Anti-Duplicate Mechanism**: Intelligent NOOP transaction padding ensures rapid successive taps are never dropped as duplicates by the RPC.

## 🛠️ Technology Stack
- **Frontend**: React 18, TypeScript, Vite, Vanilla CSS
- **Smart Contracts**: Solana, Anchor Framework (`@coral-xyz/anchor`)
- **Scaling**: MagicBlock Ephemeral Rollups SDK (`ephemeral-rollups-sdk`)
- **Web3**: `@solana/web3.js`, `@solana/wallet-adapter-react`

## 🕹️ How to Run Locally

### Prerequisites
- Node.js (v18+)
- Phantom Wallet (Optional, Burner Wallet is built-in)

### Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/MSAbhishek22/Tap-Duel-.git
   cd tap-duel
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to the provided local URL (e.g., `http://localhost:5173`).
5. Click **"🔥 Use Burner Wallet"**, pre-fund the generated demo address with a small amount of Devnet SOL, and start tapping!

> **Note**: This project operates exclusively on the Solana Devnet via MagicBlock's Ephemeral Rollups RPC (`https://devnet.magicblock.app`).

---

<div align="center">
  <i>Built with ⚡ for the Solana Hackathon</i>
</div>
