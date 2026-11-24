# StayCoin live demo runbook

Use desktop Chrome or another Chromium browser with MetaMask installed. Open [StayCoin](https://staycoin-prototype.vercel.app/) and select **Ethereum Sepolia**, chain ID **11155111**. The site should show **Verified Night Token V3 · MockTHB payments**. Use only test wallets and test assets.

## Prepare before presenting

| Wallet | What it does |
| --- | --- |
| PlatformWallet | Registers DemoResort and distributes test MockTHB. |
| HotelWallet | Mints rooms and redeems signed bookings at check-in. |
| TravelerA | Buys from the hotel and lists for resale. |
| TravelerB | Buys the resale and signs the check-in authorization. |

1. Check that all four wallets have a Sepolia test ETH balance for gas. In the footer's **Hotel partner portal**, PlatformWallet can register HotelWallet as **DemoResort** with **60 verified rooms**, and fund travelers under **Distribute MockTHB**. Check balances before minting. A single purchase/resale pair needs 2,000 MockTHB on TravelerA and 3,000 on TravelerB. Set aside more for rehearsal and the check-in booking.
2. Sign in as HotelWallet and open **Hotel partner portal → Mint a night**. Enter a room category and **2000** MockTHB. Mint **Token A** for a Bangkok date after the presentation. Leave it available. Record its token ID and stay date so you can distinguish it from other inventory.
3. Prepare **Token B** separately for **November 25, 2026**. Mint it, complete the purchase and resale before **midnight at the end of November 24, Bangkok time**, and confirm TravelerB holds it in **My bookings**. The existing verified Token #1 has a November 30 stay date and is eligible for check-in on November 30. Keep Token B's reference, such as `SC-V3-2`, handy.
4. Rehearse wallet switching. After switching accounts, click **Sign in → Sign in with wallet**, approve the sign-in message, then click **Continue**. For Token A, preapprove exact amounts if needed. The website requests 2,000 or 3,000 MockTHB when allowance is insufficient. After preapproval, allow one MetaMask confirmation per purchase. The approval only allows payment and leaves the booking untouched.
5. Open tabs for the live receipt links and the [deployment evidence](DEPLOYMENT_EVIDENCE.md). Download the [local backup recording](DEMO_BACKUP.mp4) before presenting. Keep personal information, wallet credentials, and signed guest authorizations out of shared live recordings.

## Four-minute walkthrough

| Time | Clicks and expected result |
| --- | --- |
| 0:00–0:35 | Sign in as TravelerA. Point to the verified Sepolia banner and MockTHB balance. In **Explore stays**, locate Token A by its room and date. |
| 0:35–1:20 | Click **Book stay** and approve the payment if prompted. Wait for **StayCoin booking confirmed**. The receipt shows 2,000 MockTHB paid, 1,900 to the hotel, and 100 to StayCoin. Click **Go to My Bookings** to show current ownership. |
| 1:20–2:15 | In **My bookings**, enter **3000** in **Asking price in MockTHB**, click **List for resale**, and confirm. Switch to TravelerB, sign in, open **Resale**, and click **Buy resale**. Confirm the purchase. Point to the 2,660 seller payout, 250 hotel payout, and 90 StayCoin fee. Open **My bookings** and show TravelerB holds Token A. |
| 2:15–3:25 | Still as TravelerB, find the pre-staged Token B in **My bookings**. Select **Sign guest authorization**, approve the message, and click **Copy authorization**. Switch to HotelWallet and sign in. Open **Hotel partner portal**, enter the booking reference under **Your inventory**, and paste the authorization. Confirm the guest identity check off-chain, then click **Verify and redeem** and approve in MetaMask. Confirm the dashboard shows **Redeemed** and the redeem action is gone. |
| 3:25–4:00 | Point to the confirmed hashes and contract address. Open **Transaction activity** for transactions made by the signed-in wallet in this browser. Identify which steps happened live and which were prepared before the presentation. |

## Recover during the demo

- **Demo Mode banner** → Open MetaMask, select Sepolia, and check the chosen account. Re-sign into StayCoin. Confirm the [public URL](https://staycoin-prototype.vercel.app/).
- **Booking button missing** → Check dates and filters, confirm the inventory is unsold, and make sure the selected wallet is a traveler. Sales close at the start of the Bangkok stay date.
- **Purchase or resale pending** → Check MetaMask and **Transaction activity**. Open the transaction hash and wait for confirmation before retrying. The website may first request an ERC-20 approval and then a separate purchase.
- **Live checkout taking too long** → Show the already-confirmed [purchase and resale receipts](DEPLOYMENT_EVIDENCE.md). State the actual prices on those receipts. Use the local recording to illustrate the 2,000 / 3,000 example or check-in when real-time conditions get in the way.
- **Check-in unavailable** → Confirm the token is for today's Bangkok date, TravelerB still owns it, and HotelWallet issued it. Generate a fresh guest authorization if it expired. If Token B was never prepared, show the local backup and explain its simulated clock. Changing your computer’s date cannot open a Sepolia check-in early.
