# StayCoin hotel marketplace

The website uses the name in `src/brand.ts`. Edit `brand.websiteName` there to rename the header, footer, browser title, accessibility labels, and site metadata. STAY is the ERC-1155 Night Token symbol. Happy Pass is the seasonal accommodation product and is reserved for a later phase.

## Run the website locally

1. Open this repository in VS Code. Open **Terminal → New Terminal** from the repository folder.
2. Install Node.js 22.13 or later. Run these commands from the VS Code terminal.

   ```sh
   npm ci
   npm run dev
   ```

3. Open the URL that Vite prints. Explore, Resale, My Bookings, Hotel Dashboard, and Activity are available. Without a usable Sepolia contract and MetaMask on Sepolia, the site shows clearly labeled examples and disables on-chain actions.
4. Run local verification in a second terminal.

   ```sh
   npm test
   npm run build
   ```

Hardhat uses the pinned Solidity compiler and an in-memory network for tests. For a persistent local development node, run `npm run chain` in one terminal and `npm run deploy:local` in another. That address is local only. The web app signs writes only on Sepolia.

## Deploy the tested contract to Sepolia

1. Install MetaMask from its official site, show test networks, and select **Sepolia** (chain ID `11155111`). Use dedicated test accounts and obtain faucet ETH for gas and test purchases. No Mainnet funds are required.
2. Produce a standalone source file for Remix from the same pinned Solidity and OpenZeppelin sources used in the tests.

   ```sh
   npx hardhat flatten contracts/StayCoinNightToken.sol > StayCoinNightToken.flat.sol
   ```

3. Open [Remix](https://remix.ethereum.org). Create a file called `StayCoinNightToken.flat.sol` there and paste the generated source into it. In **Solidity Compiler**, choose `0.8.28`, enable optimization with 200 runs, and select **Cancun** as the EVM version. Compile the file.
4. Open **Deploy & Run Transactions**. Select **Injected Provider / MetaMask**, confirm that the wallet shows **Sepolia** and the intended platform account, then select **StayCoinNightToken** in the contract menu. Deploy with no constructor arguments and zero ETH value. Approve the transaction in MetaMask. Keep the wallet recovery phrase and private keys inside your wallet.
5. After the receipt confirms, copy the new contract address. Verify the address and deployment hash on [Sepolia Etherscan](https://sepolia.etherscan.io). The deployment account becomes platform owner. An earlier Remix VM address will have no usable deployment on Sepolia.
6. To try it from the local UI, copy `.env.example` to `.env.local`, then set `VITE_STAYCOIN_CONTRACT_ADDRESS` to the address on Sepolia. Restart Vite and switch MetaMask to Sepolia. The address itself is public. Environment files holding secrets belong outside Git history.

## Deploy the website to Vercel

1. In Vercel, choose **Add New → Project** and import this existing GitHub repository.
2. Use the Vite preset, repository root, and Node.js 22.x. The included `vercel.json` sets the install and build commands, output directory, and browser route rewrites.
3. In Vercel’s environment settings, add `VITE_STAYCOIN_CONTRACT_ADDRESS` for Production and Preview as needed. Leave it empty to deploy the sample experience first.
4. Deploy or redeploy after changing the address. Open the Vercel URL, try a direct link to `/dashboard`, and connect on Sepolia. Confirm that the banner shows **Sepolia** and that a freshly minted night appears in the marketplace.

## Live presentation demo

Prepare funded Sepolia accounts for the platform owner, hotel, Traveler A, and Traveler B. The owner and hotel can share a test account if you have limited faucet funds, but use separate accounts if you want to show each balance independently.

**Before presentation day**, register a hotel in **Hotel Dashboard** as the owner. Switch to the hotel account, mint a night dated on presentation day, then purchase it with the account you will check in. Keep this booking ready. Sales and resales close at Bangkok midnight at the start of each stay date. Check-in is available during that Bangkok calendar day.

**During the presentation**

1. Connect the hotel wallet and mint a second night dated after presentation day. Use a demonstration primary price such as `0.002` test ETH.
2. Switch to Traveler A and book it from **Explore stays**. The website reads the exact price from the contract and attaches it to the transaction.
3. Under **My bookings**, list the night at `0.003` test ETH. Switch to Traveler B, open **Resale**, and buy it. The example allocates `0.00266` to the seller, `0.00025` to the hotel, and `0.00009` to the platform. Open Traveler B’s **My bookings** to show the transfer.
4. Switch back to the hotel account and redeem the preparation-night booking at check-in. Show the ERC-1155 burn and the **Redeemed** status. Each booking ID can be redeemed only once.
5. Open **Activity** and follow the Etherscan links for the actual resale and check-in. If a transaction is pending or confirmation is unavailable, the UI displays that state. The contract suite demonstrates sale and redemption rejections locally.

## Contract changes from the supplied Remix prototype

- The platform owner registers a hotel once with a fixed room count. Each hotel may create up to `floor(rooms / 5)` unique booking units per Bangkok date, across room types. Each ID is a single room-night.
- The contract checks the exact payment in wei. Primary revenue credits 5% to the platform. On resale, the platform gets 3% of the sale price and the hotel gets 25% of positive gain over the last price paid. Integer divisions round down to the nearest wei. The seller keeps the remainder.
- Payouts are recorded as proceeds to withdraw, so transfer failures to recipients are isolated from sales. The marketplace blocks direct ERC-1155 transfers and checks sender, current holder, amount, and date in its business functions.
- The issuing hotel verifies the guest at physical check-in. The contract confirms the current holder and burns the token once. Expired tokens are blocked from sale or redemption. They may remain visible as expired records.
- The frontend ABI matches this revised contract. Deploy the updated source. The original Remix VM source used a different interface.
- This pilot reads inventory directly through MetaMask and tracks transaction activity in the browser. It uses test ETH only. Thai-baht prices are illustrative. Happy Pass, StayPoints, and the Hotel Bond are future phases. The prototype relies on the hotel for physical fulfillment and has no real payment gateway, lodging inventory integration, or automatic refund.

## Figures to reconcile before presenting

| Item | Presentation | Financial plan |
| --- | --- | --- |
| Revenue per hotel per year | ฿171,000 from three streams | ฿192,000 including ฿21,000 in Happy Pass commission |
| Break-even | 88 hotels using revenue against ฿15M costs | About 108 hotels using contribution after variable costs, excluding hotel signup costs from the calculation |
| Year 3 profit | ฿81M labeled net profit | ฿61M before tax, ฿48.8M after tax |
| StayPoints | ฿1 per point | ฿0.25 per point modeled |
| Hotel Bond | Hotel posts funds before minting in the demo | 10% withheld per sale with no upfront payment |
| Pilot cities | Phuket and Chiang Mai | Phuket and Bangkok |
| Independent hotel bookings via third-party sites | 80%+ | 63.4% in the stated 2025 dataset |

The app uses the agreed booking and resale fee percentages. It does not adopt either forecast or the two conflicting bond designs.

## Photography

Illustrative resort and room photography from Unsplash. The sample hotel names are fictional.

- [Hero](https://images.unsplash.com/photo-1540541338287-41700207dee6)
- [Phuket sample](https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9)
- [Chiang Mai sample](https://images.unsplash.com/photo-1611892440504-42a792e24d32)
- [Bangkok sample](https://images.unsplash.com/photo-1542314831-068cd1dbfeeb)
