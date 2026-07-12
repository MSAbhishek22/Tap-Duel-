# Tap Duel: Official Manual UI Test Script

Follow this click-by-click script to verify the sequential UI logic end-to-end on your local machine.

### **Preparation**
1. Ensure your local dev server is running (already verified, running at `http://127.0.0.1:5173`).
2. Open Chrome (or your preferred browser) and navigate to exactly: **`http://127.0.0.1:5173`**.

### **Step 1: Connect & Lobby**
3. On the start screen, you will see the large "TAP DUEL" title.
4. Click the **"🔥 Use Burner Wallet"** button. (This will generate a throwaway session wallet and load the Lobby).
5. You should now see the title **"Ready to Battle? (Sequential Turns)"**.

### **Step 2: Player 1's Turn**
6. Click the **"⚔️ START MATCH (P1)"** button.
7. You will briefly see the text "Delegating to Ephemeral Rollup..." and "Syncing ER State...".
8. The screen will transition to a red header that says exactly: **"PLAYER 1'S TURN"**.
9. The timer will begin counting down from 15s.
10. Click the big **"👆 TAP!"** button furiously before the timer hits 0. Notice the "Local Taps" counter going up.

### **Step 3: The Transition (Crucial Verification)**
11. When the timer hits 0, the screen will completely change.
12. You MUST see the title: **"Player 1 Finished! (Score: [number])"** and the text **"Pass the device to Player 2."**
13. This is the transition screen proving the game format is fully sequential.

### **Step 4: Player 2's Turn**
14. Click the blue button labeled: **"⚔️ START PLAYER 2"**.
15. The screen will transition back to the gameplay view, this time with the header: **"PLAYER 2'S TURN"**.
16. The timer will count down from 15s again.
17. Click the **"👆 TAP!"** button furiously. Make sure you get a different amount of taps than Player 1 so we can clearly see a winner.

### **Step 5: Winner Screen & Undelegate**
18. When the timer hits 0, the match ends.
19. You will see a large title declaring the winner (e.g., **"Player 1 Wins!"**, **"Player 2 Wins!"**, or **"It's a Tie!"**).
20. Below the winner text, verify you see both players' final delta scores displayed distinctly:
    - `Player 1 (Delta: [end] - [start])`
    - `Player 2 (Delta: [end] - [start])`
21. Finally, click the **"📤 Commit Match"** button.
22. Wait a few seconds for the status text below the buttons to say **"Committed!"**, proving the final state successfully undelegated back to the Devnet base layer.

### **Completion**
If every step above worked flawlessly without errors, the UI flow is officially verified and the Phase H gap is closed! Save your screen recording of this process as your demo day backup.
