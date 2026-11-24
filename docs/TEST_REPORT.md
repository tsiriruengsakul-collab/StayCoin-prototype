# StayCoin V3 test report

Run on November 24, 2026, Bangkok time. Solidity compilation, standalone Remix ABI and runtime checks, all Hardhat tests, and the TypeScript/Vite production build passed.

| Required test | Local result | Sepolia evidence or limitation |
| --- | --- | --- |
| 01 Primary purchase | **Pass.** Hotel 1,900, platform 100, TravelerA debited 2,000 and owns one token. | **Pass** at the live 5,000 price. Live 2,000 example remains untested. [Receipt](https://sepolia.etherscan.io/tx/0x91b3e31d6a576a5bcaa69d10f9a08ff506d0c576a0802d0a9c9860bdd1d6c70a) |
| 02 Resale | **Pass.** Buyer debited 3,000, payouts 2,660 / 250 / 90, holder changed, second purchase rejected. | **Pass** at the live 6,000 price. Live 3,000 example and second purchase are untested. [Receipt](https://sepolia.etherscan.io/tx/0xea69865130fbc29709f3f827b5ac14453e2eceb2ed738097f909a331f78c5427) |
| 03 Unauthorized resale | **Pass.** Previous holder's listing attempt failed with `Not holder`. | Untested. |
| 04 Double redemption | **Pass.** Issuing hotel redeemed using TravelerB's proof, buyer balance became zero, and a repeat attempt failed with `Not redeemable`. | Untested. Token #1's check-in day is November 30 Bangkok time. |
| 05 Invalid permissions | **Pass.** Unauthorized minting, redemption, and test-currency distribution failed. | Untested. |
| 06 Expiration | **Pass.** Sales closed at Bangkok midnight, late redemption failed, and expiration burned the token. Direct transfers were blocked by the marketplace-only rule. | Untested. Real Sepolia block timestamps advance independently of the browser. |
| 07 Transfer bypass | **Pass.** Standard ERC-1155 single and batch transfer calls reverted with `Use StayCoin marketplace`. | Untested. |

## Actual command output

Run `npm run prepare:sepolia:v3`, `npm test`, and `npm run build` from the repository root. The V3 test group from this run:

```text
  StayCoin V3 MockTHB lifecycle
    ✔ assigns a two-decimal educational currency and rejects tokens with other decimals
    ✔ pays 1,900 to the hotel and 100 to the platform on the 2,000 MockTHB primary sale
    ✔ pays 2,660 / 250 / 90 on resale and cannot sell the listing twice
    ✔ keeps the original reference on repeat resale and calculates the seller’s actual loss
    ✔ charges no hotel markup below the original price and allows listing cancellation
    ✔ enforces roles and prohibits direct transfers and ERC-20 minting by travelers
    ✔ rejects native ETH and atomically rolls back allocation when allowance or balance cannot cover all transfers
    ✔ checks holder, deadline, chain and replay, then burns the eligible token once (47ms)
    ✔ closes sales at Bangkok midnight, blocks late redemption, and burns expired bookings
    ✔ caps one hotel’s aggregate room categories at 20 percent for one Bangkok date
    ✔ checks both deployed interfaces and runs exact approvals, checkout, resale receipts, and history through the frontend adapter (51ms)
    ✔ stops multi-step checkout if the wallet changes after approval


  63 passing (2s)


63 passing (63 mocha)
```

The browser backup rehearses the exact 2,000 and 3,000 amounts using local wallets and advances only the local chain's clock. The live Sepolia evidence above covers the already-confirmed purchase, resale, and ownership transfer. No public receipt exists for the locally rejected scenarios.
