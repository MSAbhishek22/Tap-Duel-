# 🎬 Tap Duel: Official Demo Recording Script 🎬

Welcome to the **Tap Duel** live demo sequence! Follow this step-by-step guide to capture a flawless, continuous recording of the MagicBlock Ephemeral Rollups integration.

---

### 🌟 **Pre-Flight Checklist**
- [x] Ensure your local dev server is running on `http://127.0.0.1:5174/`.
- [x] Pre-fund the burner wallet (if you haven't already, just copy the address from the UI and send it 0.05 SOL).
- [x] Take a deep breath. You got this! 🚀

---

### 🕹️ **Phase 1: Connect & Lobby**
1. **Action:** Navigate to **`http://127.0.0.1:5174`** in your browser.
2. **Visual:** You'll be greeted by the neon "TAP DUEL" title screen.
3. **Action:** Click the **"🔥 Use Burner Wallet"** button. 
4. **Result:** A throwaway session wallet is loaded instantly, bypassing Phantom popups. You'll enter the **Lobby** phase.

---

### ⚔️ **Phase 2: Player 1's Turn**
1. **Action:** In the Lobby, click **"⚔️ START MATCH (P1)"**.
2. **Visual:** Watch the status text: *"Delegating to Ephemeral Rollup..."* -> *"Syncing ER State..."* 
3. **Result:** The UI snaps into a red-themed **PLAYER 1'S TURN** screen.
4. **Action:** The 15-second timer starts! Mash the **"👆 TAP!"** button as furiously as you can! 
   *(Notice the "Local Taps" counter skyrocketing!)*

---

### 🔄 **Phase 3: The Handoff**
1. **Visual:** When the clock hits 0, the screen automatically transitions.
2. **Verify:** Look for the title **"Player 1 Finished!"** alongside Player 1's final score delta.
3. **Action:** (Pretend to pass the device to your opponent!)
4. **Action:** Click the **"⚔️ START PLAYER 2"** button to resume.

---

### 🛡️ **Phase 4: Player 2's Turn**
1. **Result:** The UI snaps into a blue-themed **PLAYER 2'S TURN** screen.
2. **Action:** The 15-second timer drops again. Spam that **"👆 TAP!"** button! 
   *(Try to score higher or lower than Player 1 to force a clear winner!)*

---

### 🏆 **Phase 5: Victory & On-Chain Commit**
1. **Visual:** The timer hits 0. The battle concludes!
2. **Verify:** The massive Victory screen appears: **"Player X Wins!"** (or Tie).
3. **Check the Math:** 
   - `Player 1 (Delta: [end] - [start])`
   - `Player 2 (Delta: [end] - [start])`
4. **The Grand Finale:** Click the **"📤 Commit Match"** button.
5. **Result:** Wait ~3 seconds. The status changes to **"Committed!"**, proving the Ephemeral Rollup state has successfully merged back into the Solana Devnet base layer!

---

🎉 **END OF RECORDING** 🎉
*You nailed it! Stop the capture and prepare your submission!*
