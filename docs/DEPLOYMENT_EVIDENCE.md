# StayCoin V3 deployment evidence

- **Website** [StayCoin production](https://staycoin-prototype.vercel.app/)
- **Network** Ethereum Sepolia, chain ID **11155111**
- **Release** Git commit `0770e35a3c5027b2675a77551cbc38291e78cc81`

| Contract | Address | Block | Explorer evidence |
| --- | --- | ---: | --- |
| MockTHB | `0xa2C5bff32a914957d0117D438AE944946451607F` | 12,199,603 | [Deployment](https://sepolia.etherscan.io/tx/0x1b7aa87652e86674a46e90c9c7e5cf49b626a4c6d6ad74c407f6b7693fe431d0) · [Sourcify](https://sourcify.dev/server/v2/contract/11155111/0xa2C5bff32a914957d0117D438AE944946451607F) |
| StayCoinNightTokenV3 | `0x5A84E37e839194D659a820bf24b3A41F183414fA` | 12,199,649 | [Deployment](https://sepolia.etherscan.io/tx/0x7a8751366f1312bbfba551fbc45a972dcf952b9d4a5dc39b7f01184effc8b41e) · [Sourcify](https://sourcify.dev/server/v2/contract/11155111/0x5A84E37e839194D659a820bf24b3A41F183414fA) |

Executable bytecode matched the tested builds. Sourcify reported an exact source match for both deployments. Night Token V3 points to the MockTHB address above, and MockTHB uses two decimals. Both listed contracts are owned by PlatformWallet `0x50BCA15eA3df196fD78ef83Ec5beac2B6f9C5477`. The production browser build was verified against these deployments.

## Confirmed Sepolia transactions

| Step | Result | Evidence |
| --- | --- | --- |
| Mint | Night Token #1, DemoResort Deluxe A, November 30, 2026 in Bangkok | [Mint receipt](https://sepolia.etherscan.io/tx/0xc96a521de27c3c85bfbed921e317dc267e937fbbb27b5812e4b7012bdeb2a2e6) |
| Primary purchase | TravelerA paid **5,000 MockTHB**. The hotel received **4,750**, StayCoin received **250**, and TravelerA received Token #1. | [Purchase receipt](https://sepolia.etherscan.io/tx/0x91b3e31d6a576a5bcaa69d10f9a08ff506d0c576a0802d0a9c9860bdd1d6c70a) |
| Resale | TravelerB paid **6,000 MockTHB**. TravelerA received **5,570**, the hotel received **250**, StayCoin received **180**, and TravelerB received Token #1. | [Resale receipt](https://sepolia.etherscan.io/tx/0xea69865130fbc29709f3f827b5ac14453e2eceb2ed738097f909a331f78c5427) |
| Ownership | ERC-1155 balance after resale was zero for TravelerA and one for TravelerB. | [Night Token contract](https://sepolia.etherscan.io/address/0x5A84E37e839194D659a820bf24b3A41F183414fA) |
| Hotel redemption | The visible Sepolia booking is dated November 30. Signed redemption, burn, and duplicate redemption were tested locally. | Sepolia redemption receipt pending |

The confirmed Sepolia trades use the same fee rules as the 2,000 / 3,000 classroom example. The exact classroom amounts were verified on a local chain. See the [test report](TEST_REPORT.md).

## Release limits and fallback

The MVP uses test funds and hotel-supplied room counts. It has no independent smart-contract audit. Real THB payments, Hotel Bond, StayPoints, Happy Pass issuance, and advanced guest verification remain future work.

V2 remains available at `0xa4F706eA6289E37f9Dd8f13EbCbE9B6bc65bbF0e`. The previous V2 Vercel deployment is `dpl_BVgwdzf8m3SRZAKft8q6EYT67Q3m` from Git commit `f6cce06`. To roll back, promote that deployment. Before rebuilding V2, set `VITE_STAYCOIN_CONTRACT_ADDRESS` to the V2 address and `VITE_STAYCOIN_DEPLOYMENT_BLOCK` to `12194790` for that build. Verify the V2 banner on the public domain. V2 and V3 keep separate booking records.
