# StayCoin technical brief for the presenter

**What does a Night Token represent?** One Night Token is the right to use a specific room category at a specific hotel on one date. The issuing hotel creates it and StayCoin's marketplace moves it to the current traveler. The hotel supplies the room count. For example, 60 approved rooms allow up to 12 Night Tokens per Bangkok stay date.

**Why use blockchain?** The hotel and travelers can check the same ownership record and payment history. The contract updates the owner and sends each recipient their share in the same transaction. If one part fails, the whole purchase reverts.

**Why MetaMask and MockTHB?** MetaMask lets people in the classroom demonstrate four separate wallets and approve their own transactions. The demo runs on Ethereum Sepolia. MockTHB is an educational payment token with no monetary value. Sepolia test ETH pays the network's gas fees. A commercial version would accept Thai baht through a payment provider, using options such as PromptPay or bank cards.

**How do the fees work?** At 2,000 MockTHB, the hotel gets 1,900 and StayCoin gets 100. On a 3,000 resale, the hotel gets 25% of the 1,000 positive markup, or 250. StayCoin gets 3% of 3,000, or 90. The seller receives 2,660. On later resales the hotel fee still uses the original booking price. The seller's profit uses what that seller actually paid.

**How does the hotel know who can check in?** The guest signs a short-lived request from **My bookings** with the wallet that currently holds the token. The issuing hotel finds the booking by reference and checks the guest's identity separately, off-chain. The contract checks the signature, holder, hotel, Bangkok date, and whether the request is still valid. The signature proves control of a wallet. Identity documents stay off-chain.

**How does the contract prevent reuse?** Only the current holder can offer a resale, and a completed resale clears the listing. Ordinary ERC-1155 transfers are blocked so the transaction has to use the marketplace's payment rules. At valid check-in, the token is burned and cannot be redeemed again.

**What should I say is unfinished?** StayCoin is a classroom MVP. The live Sepolia purchase and resale are verified. Signed hotel redemption and reuse prevention passed locally, with the first live redemption receipt still pending as of November 24, 2026. Hotel Bond, StayPoints, Happy Pass issuance, advanced analytics and guest verification, and real baht processing are future features. [Deployment evidence](DEPLOYMENT_EVIDENCE.md)
