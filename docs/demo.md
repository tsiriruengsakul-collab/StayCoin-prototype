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
| MockTHB deployment | `0xa2C5bff32a914957d0117D438AE944946451607F` · block 12199603 · two decimals · runtime fingerprint matched | [Sepolia deployment](https://sepolia.etherscan.io/tx/0x1b7aa87652e86674a46e90c9c7e5cf49b626a4c6d6ad74c407f6b7693fe431d0) |
| Night Token V3 deployment | `0x5A84E37e839194D659a820bf24b3A41F183414fA` · block 12199649 · MockTHB configured · runtime fingerprint matched | [Sepolia deployment](https://sepolia.etherscan.io/tx/0x7a8751366f1312bbfba551fbc45a972dcf952b9d4a5dc39b7f01184effc8b41e) |
| Live primary purchase | Token #1, DemoResort Deluxe A, November 30, 2026. TravelerA paid 5,000 MockTHB. Hotel received 4,750 and StayCoin received 250. | [Sepolia purchase](https://sepolia.etherscan.io/tx/0x91b3e31d6a576a5bcaa69d10f9a08ff506d0c576a0802d0a9c9860bdd1d6c70a) |
| Live resale | Token #1. TravelerB paid 6,000 MockTHB and received the Night Token. TravelerA received 5,570, the hotel received 250, and StayCoin received 180. | [Sepolia resale](https://sepolia.etherscan.io/tx/0xea69865130fbc29709f3f827b5ac14453e2eceb2ed738097f909a331f78c5427) |
| Presentation scenario | Primary purchase at 2,000 and resale at 3,000. The automated tests verify the exact 1,900 / 100 and 2,660 / 250 / 90 distributions. | Live run pending |
| Check-in | Successful hotel redemption, burn, and zero ERC-1155 balance | Pending |

Both contracts are owned by PlatformWallet `0x50BCA15eA3df196fD78ef83Ec5beac2B6f9C5477`. Sourcify reports exact source matches for both deployments. The frontend checks the executable fingerprints in `src/generated/`. [MockTHB on Sourcify](https://sourcify.dev/server/v2/contract/11155111/0xa2C5bff32a914957d0117D438AE944946451607F) · [V3 on Sourcify](https://sourcify.dev/server/v2/contract/11155111/0x5A84E37e839194D659a820bf24b3A41F183414fA)

## Backup recording checklist

- Capture the first public test sequence after both deployments are verified. Save explorer evidence and note which booking date was used.
- Capture the Preview and My Bookings confirmation for both travelers. Verify Token A is still unavailable to TravelerA after the resale.
- If the November 25 booking cannot be prepared before the cutoff, show the successful sale and resale and explain the check-in schedule. Show a verified recording of a valid redemption only if one has been captured. Label any local Hardhat evidence as local.
- If confirmations take longer than the allotted live demo, open pre-staged transaction links while they settle. Record the pending hash and let the chain confirm. A wallet approval or video edit cannot stand in for a successful receipt.

## Roll back to V2

Restore the previous V2 Vercel deployment as Production. The retained V2 deployment ID is `dpl_BVgwdzf8m3SRZAKft8q6EYT67Q3m`, from Git commit `f6cce06`. In the Vercel project, select that deployment and use **Promote to Production** or the available rollback action. Before building V2 again, restore the V2 Production values, `VITE_STAYCOIN_CONTRACT_ADDRESS=0xa4F706eA6289E37f9Dd8f13EbCbE9B6bc65bbF0e` and `VITE_STAYCOIN_DEPLOYMENT_BLOCK=12194790`. Reopen the canonical URL and confirm the V2 status banner. Each contract keeps its own records on Sepolia.
