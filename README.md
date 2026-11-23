# StayCoin hotel marketplace · Version 2

Staypass is a Sepolia testnet hotel-booking demo. The site name lives in `src/brand.ts`. STAY is the website’s Night Token branding.

## Run locally

From the repository root, use Node.js 22.13 or newer.

```sh
npm ci
npm run dev
npm test
npm run build
```

The website shows labeled examples while it lacks a verified Sepolia contract. Use **Sign in → Continue in demo mode** for a sample booking and StayPoints balance. The **Hotel partner portal** link is in the footer. Local Hardhat tests use simulated wallets. For a persistent local node, run `npm run chain` in one terminal and `npm run deploy:local` in another. The website accepts live transactions only on Sepolia.

## Which contract to deploy

Deploy `contracts/StayCoinNightTokenV2.sol:StayCoinNightTokenV2`. This is the patched contract reviewed in [PR #1](https://github.com/tsiriruengsakul-collab/StayCoin-prototype/pull/1). The exact original upload is preserved at `contracts/remix/StayCoinNightTokenV2.sol` with SHA-256 `a13d7bf139dc6a4313c44a0ac1fe8aaeae9d6e11515aa4e56627d68dc8ddf80c`. Both are compiled and tested independently. The separate `StayCoinNightToken.sol` marketplace prototype has a different ABI.

The patched candidate uses Bangkok midnight for the 20% daily mint cap. Primary sales, resale purchases, and resale quotes close at that midnight. Check-in is open through that Bangkok calendar day. Anyone can finalize expiry once the day ends. The owner role remains in place for fees and expired-bond settlement. The booking payments and percentages are unchanged from the Remix upload.

## Prepare and deploy through Remix and MetaMask

1. On the reviewed integration branch, run `npm ci`, `npm test`, and `npm run prepare:sepolia`. The preparation command generates `deployment/StayCoinNightTokenV2.sol` and checks its compiled ABI, optimized runtime, and size against the Hardhat artifact. It uses the lockfile’s **Solidity 0.8.28**, **OpenZeppelin 5.4.0**, **optimizer enabled with 200 runs**, and **Cancun** EVM target. Both builds have a 13,665-byte runtime. The frontend verifies its executable fingerprint, ignoring Solidity’s build metadata trailer.
2. In **MetaMask**, select **Sepolia** (chain ID `11155111`), then choose the account that should own the marketplace. Use faucet test ETH. Keep the recovery phrase and private keys inside MetaMask.
3. In [Remix](https://remix.ethereum.org), create `StayCoinNightTokenV2.sol` and paste the generated file from the **deployment** folder. In **Solidity Compiler**, select **0.8.28**, enable **200 optimizer runs**, and choose **Cancun**. Compile, select **StayCoinNightTokenV2**, and open **Deploy & Run**.
4. Select **Injected Provider / MetaMask**. Confirm the owner wallet and Sepolia in the wallet popup. Deploy with zero ETH value and no constructor arguments. Approve the transaction yourself in MetaMask.
5. Wait for a successful receipt. Save the **contract address**, **deployment transaction hash**, and **deployment block number**. Open the hash on [Sepolia Etherscan](https://sepolia.etherscan.io) and check the success status and created address.

## Configure a Vercel preview and verify the live flow

1. In the existing **Vercel** project, open **Settings → Environment Variables**. For **Preview**, preferably scoped to the integration branch, set `VITE_STAYCOIN_CONTRACT_ADDRESS` to the public address from Remix. Set `VITE_STAYCOIN_DEPLOYMENT_BLOCK` to its public deployment block number to enable completed resale analytics, redeemed booking history, and expired-bond settlement history. The address is enough for the core lifecycle. Keep wallet credentials out of all environment variables.
2. In **Deployments**, redeploy the integration branch’s **Preview**. Vite reads these variables at build time. For a local browser preview, copy `.env.example` to `.env.local`, set the same values, and restart Vite. Switch MetaMask to Sepolia. The banner shows **Verified Night Token V2** when the chain, bytecode, and ERC-1155 interface checks pass.
3. **Register a hotel.** Sign in with the owner wallet. In the **Hotel partner portal**, approve a separate hotel wallet with **60 rooms**.
4. **Mint.** Switch MetaMask accounts and sign in with the hotel wallet. Choose a Bangkok date after today and enter **0.001** test ETH. A 60-room hotel can mint 12 nights per date.
5. **Book.** Sign in with Traveler A, open **Explore stays**, and buy the listing. Check the exact **0.001 test ETH** value in MetaMask before approving. Confirm the token appears in **My Bookings**.
6. **Resell.** As Traveler A, list the booking for **0.0015 test ETH**. Sign in with Traveler B, open **Resale**, review the contract’s quote, and buy. Confirm the wallet shows **0.0015 test ETH** and the booking transfers to Traveler B. The quoted shares are **0.00133** to the seller, **0.000125** to the hotel, and **0.000045** to the platform.
7. **Check in.** Use a separate token minted and purchased before its stay date. On that eligible Bangkok date, sign in as the issuing hotel. Confirm the guest wallet shown in **Your inventory** and select **Redeem at check-in**. Confirm the burn and the release of the 10% holdback to the hotel. Sepolia time advances in real time. Prepare a stay for the demo date in advance.
8. **Withdraw.** In **My Bookings** or the **Hotel partner portal**, check available proceeds and select **Withdraw to wallet** on the account entitled to payment. For an unused stay, finalize expiry after its Bangkok day ends. The platform owner can then credit the held bond to the hotel or the last traveler after reviewing the outcome.
9. **Verify receipts.** Open **Transaction activity** from the footer and follow the Sepolia Etherscan links for the actual transactions recorded by the current wallet in this browser. Check the success status, destination contract, payments, and ERC-1155 results. Keep a list of hashes as evidence of each successful public test.
10. **Review publication.** Review the integration PR in GitHub. After you approve the changes and the live preview tests pass, set the same two public values for **Production** and merge the PR yourself. Vercel normally builds the production branch on merge. If it does not, redeploy that branch from **Deployments**. Keep the production settings and site untouched while testing the preview.

## Feature and test status

| Feature | This integration |
| --- | --- |
| Night Tokens | Patched V2 ABI and full lifecycle tested locally. Live use requires a Sepolia deployment and wallet confirmation. V2 stores hotel wallet addresses and verified room counts. Hotel names, cities, and room descriptions on the sample cards are illustrative. |
| Hotel Bond | The tested Night Token V2 holds 10% of the primary payment. Check-in credits it to the hotel. After expiry the platform owner can credit it to the last holder or hotel. This is partial, centralized protection. The separate locally tested prefunded-bond prototype remains outside this deployment. |
| Resale analytics | Real V2 `Resold` events when the deployment block and RPC history are available. The sample dashboard uses illustrative baht data. |
| StayPoints and Happy Pass | Implemented and tested locally in the separate marketplace prototype. Their website pages show labeled previews. The patched Night Token V2 contract has no points or pass methods. |

Run `npm test -- test/StayCoinNightTokenV2.ts test/SepoliaNightTokenIntegration.ts` for the uploaded contract, patched candidate, and frontend adapter. The full suite also covers the separate marketplace prototype. A successful local result or Vercel build is not a public-chain transaction. The testnet contract is an unaudited classroom demo. It relies on the issuing hotel for physical check-in and the platform owner for manual expired-bond settlement. Use Sepolia test ETH only.

## Figures to reconcile before presenting

| Item | Presentation | Financial plan |
| --- | --- | --- |
| Revenue per hotel per year | ฿171,000 from three streams | ฿192,000 including ฿21,000 in Happy Pass commission |
| Break-even | 88 hotels using revenue against ฿15M costs | About 108 hotels using contribution after variable costs, excluding hotel signup costs |
| Year 3 profit | ฿81M labeled net profit | ฿61M before tax, ฿48.8M after tax |
| StayPoints | ฿1 per point | ฿0.25 per point modeled |
| Hotel Bond design | Hotel posts funds before minting in the demo | 10% held back per sale, released after checkout |
| Pilot cities | Phuket and Chiang Mai | Phuket and Bangkok |
| Independent hotel bookings via third-party sites | 80%+ | 63.4% in the stated 2025 dataset |

## Photography

Illustrative resort and room photography from Unsplash. The sample hotel names are fictional.

- [Hero](https://images.unsplash.com/photo-1540541338287-41700207dee6)
- [Phuket sample](https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9)
- [Chiang Mai sample](https://images.unsplash.com/photo-1611892440504-42a792e24d32)
- [Bangkok sample](https://images.unsplash.com/photo-1542314831-068cd1dbfeeb)
- [Krabi sample](https://images.unsplash.com/photo-1566073771259-6a8506099945)
- [Koh Samui sample](https://images.unsplash.com/photo-1571896349842-33c89424de2d)
- [Ari sample](https://images.unsplash.com/photo-1566665797739-1674de7a421a)

The header and favicon use a vector trace of the coin logo shared in chat.
