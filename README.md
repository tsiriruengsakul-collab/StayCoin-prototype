# StayCoin V3

StayCoin is a hotel booking and resale marketplace for an educational Sepolia demo. A Night Token is a single ERC-1155 booking entitlement. Guests pay with MockTHB, a two-decimal ERC-20 test token. Sepolia test ETH covers gas. The site name is configured in `src/brand.ts`.

## Run locally

Use Node.js 22.13 or newer. From the repository root:

```sh
npm ci
npm run dev
npm test
npm run build
```

Without Sepolia configuration, the site displays labeled sample inventory. Use **Sign in → Continue in demo mode** for a sample booking and StayPoints balance. The **Hotel partner portal** and **Transaction activity** links are in the footer. Hardhat runs the contracts and simulated wallets locally, including the full V3 lifecycle and existing V2 regression suite.

## Prepare the Sepolia contracts

1. Run `npm run prepare:sepolia:v3`. This generates `deployment/MockTHB.sol` and `deployment/StayCoinNightTokenV3.sol`. The script checks each flattened contract's ABI and executable runtime against its Hardhat build and the generated files used by the frontend.
2. Upload **the files from the deployment folder** to [Remix](https://remix.ethereum.org). Set the compiler to **Solidity 0.8.28**, enable the optimizer with **200 runs**, and set the EVM version to **Cancun**. Compile each file.
3. In **Deploy & Run**, use **Sepolia Testnet – MetaMask**, chain ID **11155111**, with PlatformWallet selected. Set **Value** to **0 wei**. In the Contract dropdown select **MockTHB**, with no constructor arguments. Deploy and approve in MetaMask.
4. Confirm the successful receipt and verify MockTHB's runtime fingerprint and two decimals. Compile the second file and select **StayCoinNightTokenV3** in the dropdown. Enter the new MockTHB address as its `mockTHB` constructor argument. Deploy with the same PlatformWallet and zero value.
5. Record each contract's address, deployment transaction hash, block, and owner. Confirm both runtime fingerprints, V3's configured payment token, and its ERC-1155 interface. The expected fingerprints are in `src/generated/`. They exclude the Solidity metadata trailer. Explorer source verification is a separate check and can be attempted from Remix.

## Connect the Vercel Preview

Configure the existing Vercel project for the feature branch's **Preview** environment. Use these public values from the verified Sepolia deployments:

| Variable | Value |
| --- | --- |
| `VITE_STAYCOIN_CONTRACT_ADDRESS` | Night Token V3 address |
| `VITE_STAYCOIN_MOCKTHB_ADDRESS` | MockTHB address |
| `VITE_STAYCOIN_DEPLOYMENT_BLOCK` | Night Token V3 deployment block as a decimal number |

Redeploy Preview after changing variables because Vite reads them during the build. To use the same contracts locally, copy `.env.example` to `.env.local`, populate the three variables, and restart Vite. Connect MetaMask on Sepolia and look for **Verified Night Token V3 · MockTHB payments**. Live actions depend on successful bytecode and configuration verification.

Before switching Production, complete a successful live primary purchase and resale on Preview and verify the receipt, actual ERC-20 payouts, and resulting holder on Sepolia. Use the same three variables for Production after review and merge, then verify the canonical URL and repeat the wallet and receipt checks. See the [presenter guide](docs/demo.md) for the full rehearsal, evidence, and rollback.

## Payments and check-in

- A 2,000 MockTHB primary purchase pays 1,900 to the hotel and 100 to StayCoin. Resale at 3,000 pays 2,660 to the seller, 250 to the hotel, and 90 to StayCoin. Every payment and corresponding Night Token transfer occurs in the same transaction.
- The hotel receives 25% of positive resale markup versus the **original primary purchase price**. StayCoin receives 3% of the resale price. The seller's profit or loss compares their proceeds with their own latest purchase price. A repeated resale can pay the hotel a markup share while the seller takes a loss.
- A hotel with 60 approved rooms can tokenize at most 12 rooms per Bangkok date across all categories. Room counts come from off-chain records reviewed by the platform. Sales close when the stay date starts in Bangkok. Check-in is available during that Bangkok day.
- The guest signs a short-lived wallet authorization. The issuing hotel checks it along with the current holder, date, and booking status. The message is tied to the network, contract, booking, holder, hotel, and nonce. Successful check-in burns the Night Token. The hotel verifies personal identity separately and keeps personal data off-chain.
- StayPoints and Happy Pass remain labeled previews. Hotel Bond, email receipts, and QR scanning are deferred. For check-in, use the manual booking reference and signed authorization. Real THB payments, PromptPay or card integrations, and embedded wallets are future commercial work.
- V2 deployments and tests are retained. V2 and V3 have separate balances and booking records. This classroom prototype uses test assets and has no independent smart-contract audit.

## Figures to reconcile for the project presentation

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

Illustrative resort and room photography from Unsplash. Sample hotel names are fictional.

- [Hero](https://images.unsplash.com/photo-1540541338287-41700207dee6)
- [Phuket sample](https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9)
- [Chiang Mai sample](https://images.unsplash.com/photo-1611892440504-42a792e24d32)
- [Bangkok sample](https://images.unsplash.com/photo-1542314831-068cd1dbfeeb)
- [Krabi sample](https://images.unsplash.com/photo-1566073771259-6a8506099945)
- [Koh Samui sample](https://images.unsplash.com/photo-1571896349842-33c89424de2d)
- [Ari sample](https://images.unsplash.com/photo-1566665797739-1674de7a421a)

The header, footer, and favicon use the StayCoin house-and-ribbon symbol.
