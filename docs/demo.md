# StayCoin V3 presentation guide

Use the [StayCoin website](https://staycoin-prototype.vercel.app/) after V3 publication is verified. During rehearsal, use V3 Preview and check for **Verified Night Token V3 · MockTHB payments**.

## Prepare the four wallets

1. Put enough Sepolia test ETH for gas in PlatformWallet, HotelWallet, TravelerA, and TravelerB. Confirm the browser is on Sepolia. Every account switch may require signing in again.
2. In the footer's **Hotel partner portal**, PlatformWallet registers HotelWallet as **DemoResort** with **60 verified rooms**. Use **Distribute MockTHB** to fund TravelerA with at least 4,000 and TravelerB with at least 6,000 if both will buy twice. Add more if rehearsing with extra tokens.
3. As HotelWallet, mint Token A for a future Bangkok date, at **2,000 MockTHB**. Choose a room category and note its Night Token ID.
4. Mint Token B for **November 25, 2026** and stage a primary purchase and resale before midnight at the end of November 24, Bangkok time. TravelerB should hold Token B at presentation time. Ask TravelerB to generate the check-in authorization live on November 25 because it expires shortly after signing.
5. To save time, approve exact allowances of **2,000** and **3,000 MockTHB** for TravelerA and TravelerB, respectively, after rehearsal transactions and before the live purchases. Verify the spender is the deployed V3 contract. An ERC-20 approval entered as an integer in Remix uses satang, so enter **200000** or **300000**. The website requests the right amount itself if allowance is insufficient.
6. Keep the wallets' explorer tabs and transaction links ready. Record actual balance movements, holder changes, and the receipt hash for each rehearsed action. Keep recovery phrases, private keys, personal identification, and verification codes out of recordings and shared files.

## Four-minute walkthrough

| Time | Show |
| --- | --- |
| 0:00–0:35 | Open StayCoin, connect TravelerA, and show Sepolia, MockTHB, and the available Token A. Explain that the hotel receives 95% and the platform receives 5%. |
| 0:35–1:20 | Buy Token A at 2,000. Open the confirmed receipt and My Bookings. Show actual 1,900 / 100 transfers and TravelerA's ownership. |
| 1:20–2:15 | List Token A for 3,000. Switch to TravelerB and buy it. Show the 2,660 seller, 250 hotel, and 90 platform transfers, then confirm TravelerB is the holder. |
| 2:15–3:25 | Open the pre-staged Token B as TravelerB. Sign and copy the guest authorization. Switch to HotelWallet, find the booking by reference, confirm the off-chain identity check, paste the authorization, and redeem. Show the burned status and explain that reuse fails. |
| 3:25–4:00 | Open the explorer receipts. Identify transactions prepared earlier and executed live. Explain that commercial customers would pay in THB through a future payment provider. |

## Transaction evidence sheet

Fill in the hash and [Sepolia Etherscan](https://sepolia.etherscan.io/) link only after each transaction confirms. Keep one row per actual transaction if using multiple inventory or funding transactions.

| Evidence | What to verify | Hash/link |
| --- | --- | --- |
| MockTHB deployment | Contract, block, owner, two decimals, runtime fingerprint | Pending |
| Night Token V3 deployment | Contract, block, owner, payment token, runtime fingerprint | Pending |
| Preparation | Approval of HotelWallet, funding, and Token IDs for A and B | Pending |
| Primary purchase | Exact 2,000 debit, 1,900 / 100 credits, TravelerA ownership | Pending |
| Resale | Exact 3,000 debit, 2,660 / 250 / 90 credits, TravelerB ownership | Pending |
| Check-in | Successful hotel redemption, burn, and zero ERC-1155 balance | Pending |

## Backup recording checklist

- Capture the first public test sequence after both deployments are verified. Save explorer evidence and note which booking date was used.
- Capture the Preview and My Bookings confirmation for both travelers. Verify Token A is still unavailable to TravelerA after the resale.
- If the November 25 booking cannot be prepared before the cutoff, show the successful sale and resale and explain the check-in schedule. Show a verified recording of a valid redemption only if one has been captured. Label any local Hardhat evidence as local.
- If confirmations take longer than the allotted live demo, open pre-staged transaction links while they settle. Record the pending hash and let the chain confirm. A wallet approval or video edit cannot stand in for a successful receipt.

## Roll back to V2

Restore the previous V2 Vercel deployment as Production. The retained V2 deployment ID is `dpl_BVgwdzf8m3SRZAKft8q6EYT67Q3m`, from Git commit `f6cce06`. In the Vercel project, select that deployment and use **Promote to Production** or the available rollback action. Before building V2 again, restore the V2 Production values, `VITE_STAYCOIN_CONTRACT_ADDRESS=0xa4F706eA6289E37f9Dd8f13EbCbE9B6bc65bbF0e` and `VITE_STAYCOIN_DEPLOYMENT_BLOCK=12194790`. Reopen the canonical URL and confirm the V2 status banner. Each contract keeps its own records on Sepolia.
