import {
  Contract, formatUnits, getAddress, Interface, isAddress, parseUnits, ZeroAddress,
  type ContractRunner, type Provider, type Signer, type TransactionReceipt, type TransactionResponse,
} from "ethers";
import mockArtifact from "./generated/mockTHB.json";
import bookingArtifact from "./generated/nightTokenV3.json";
import { DAY, sameAddress, sepolia } from "./chain";
import { runtimeFingerprint } from "./runtimeCode";

function addressOf(value: string | undefined) {
  const address = value?.trim() ?? "";
  return isAddress(address) && address !== ZeroAddress ? getAddress(address) : null;
}
export const contractAddress = addressOf(import.meta.env?.VITE_STAYCOIN_CONTRACT_ADDRESS);
export const mockTHBAddress = addressOf(import.meta.env?.VITE_STAYCOIN_MOCKTHB_ADDRESS);
export const deploymentBlock = Number(import.meta.env?.VITE_STAYCOIN_DEPLOYMENT_BLOCK || 0);
export const configured = Boolean(contractAddress && mockTHBAddress && Number.isSafeInteger(deploymentBlock) && deploymentBlock > 0);
export const prototypeNotice = "Educational Sepolia testnet prototype. Booking payments use MockTHB, which has no real monetary value.";
export const marketAbi = bookingArtifact.abi;
export const currencyAbi = mockArtifact.abi;

export function marketplace(runner: ContractRunner, address = contractAddress) {
  if (!address) throw new Error("Configure the V3 Sepolia booking address first.");
  return new Contract(address, marketAbi, runner);
}
export function currency(runner: ContractRunner, address = mockTHBAddress) {
  if (!address) throw new Error("Configure the Sepolia MockTHB address first.");
  return new Contract(address, currencyAbi, runner);
}

export async function verifyV3(provider: Provider, booking: string, mockTHB: string, blockTag: number) {
  const entries = [[booking, bookingArtifact.runtimeHash], [mockTHB, mockArtifact.runtimeHash]];
  await Promise.all(entries.map(async ([address, expected]) => {
    const code = await provider.getCode(address, blockTag);
    let matches = false;
    try { matches = runtimeFingerprint(code) === expected; } catch { /* Unsupported runtime. */ }
    if (!matches) throw new Error("The configured Sepolia contracts do not match the verified V3 and MockTHB builds.");
  }));
  const market = marketplace(provider, booking);
  const token = currency(provider, mockTHB);
  const [payment, decimals, standard] = await Promise.all([
    market.paymentToken({ blockTag }), token.decimals({ blockTag }), market.supportsInterface("0xd9b67a26", { blockTag }),
  ]);
  if (!sameAddress(payment, mockTHB) || decimals !== 2n || !standard) throw new Error("The V3 payment token configuration is incorrect.");
  return { market, token };
}

type NightRecord = {
  hotel: string; holder: string; stayDate: bigint; originalPrice: bigint; lastPaidPrice: bigint;
  listingPrice: bigint; nonce: bigint; sold: boolean; redeemed: boolean; expired: boolean; roomCategory: string;
};
type Hotel = { approved: boolean; verifiedRooms: bigint; name: string };
export type Quote = { seller: bigint; hotel: bigint; platform: bigint };
export type Night = NightRecord & { id: number; hotelName: string; expiredHolder: string; quote: Quote | null };
export const canBuyNight = (night: NightRecord, now: bigint) =>
  night.hotel !== ZeroAddress && !night.sold && !night.redeemed && !night.expired && now < night.stayDate;
export const canResell = (night: NightRecord, now: bigint) =>
  night.sold && !night.redeemed && !night.expired && now < night.stayDate;
export const canCheckIn = (night: NightRecord, now: bigint) =>
  night.sold && !night.redeemed && !night.expired && now >= night.stayDate && now < night.stayDate + DAY;

export async function readMarket(market: Contract, token: Contract, wallet: string | null, blockTag: number, time: bigint) {
  const block = { blockTag };
  const [owner, nextId, hotel, currencyOwner, mockBalance, gasBalance] = await Promise.all([
    market.owner(block) as Promise<string>, market.nextNightId(block) as Promise<bigint>,
    wallet ? market.hotels(wallet, block) as Promise<Hotel> : null, token.owner(block) as Promise<string>,
    wallet ? token.balanceOf(wallet, block) as Promise<bigint> : 0n,
    wallet ? market.runner?.provider?.getBalance(wallet, blockTag) ?? 0n : 0n,
  ]);
  const hotels = new Map<string, Promise<Hotel>>();
  const nights: Night[] = [];
  for (let start = 1; start < Number(nextId); start += 8) {
    const ids = Array.from({ length: Math.min(8, Number(nextId) - start) }, (_, index) => start + index);
    nights.push(...await Promise.all(ids.map(async (id): Promise<Night> => {
      const n: NightRecord = await market.nights(id, block);
      const [expiredHolder, quote] = await Promise.all([
        n.expired ? market.expiredHolder(id, block) as Promise<string> : ZeroAddress,
        n.listingPrice > 0n && canResell(n, time) ? readQuote(market, id, blockTag) : null,
      ]);
      if (!hotels.has(n.hotel)) hotels.set(n.hotel, market.hotels(n.hotel, block));
      const entry = await hotels.get(n.hotel)!;
      return { id, hotelName: entry.name, expiredHolder, quote, hotel: n.hotel, holder: n.holder, stayDate: n.stayDate,
        originalPrice: n.originalPrice, lastPaidPrice: n.lastPaidPrice, listingPrice: n.listingPrice, nonce: n.nonce,
        sold: n.sold, redeemed: n.redeemed, expired: n.expired, roomCategory: n.roomCategory };
    })));
  }
  return { owner, hotel, currencyOwner, mockBalance, gasBalance, nights };
}

async function readQuote(market: Contract, id: number, blockTag: number): Promise<Quote> {
  const [seller, hotel, platform] = await market.quoteResale(id, { blockTag });
  return { seller, hotel, platform };
}

export function estimateResale(price: bigint, original: bigint, lastPaid: bigint) {
  const hotel = (price > original ? price - original : 0n) * 25n / 100n;
  const platform = price * 3n / 100n;
  const seller = price - hotel - platform;
  return { seller, hotel, platform, net: seller - lastPaid };
}

export function formatTHB(satang: bigint) {
  const magnitude = satang < 0n ? -satang : satang;
  const integer = new Intl.NumberFormat("en-TH").format(magnitude / 100n);
  return (satang < 0n ? "−" : "") + "฿" + integer + "." + String(magnitude % 100n).padStart(2, "0");
}
export function parseTHB(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error("Enter a positive MockTHB amount with up to two decimal places.");
  const amount = parseUnits(value, 2);
  if (amount <= 0n) throw new Error("Enter a MockTHB amount greater than zero.");
  return amount;
}
export function gasAmount(value: bigint) {
  const scale = 10n ** 13n;
  return value > 0n && value < scale ? "<0.00001" : formatUnits(value / scale, 5);
}

export async function requireWalletContext(
  provider: { send(method: string, args: unknown[]): Promise<unknown> }, account: string, chainId = sepolia.id,
) {
  const [chain, accounts] = await Promise.all([provider.send("eth_chainId", []), provider.send("eth_accounts", [])]);
  if (Number(chain) !== chainId || !Array.isArray(accounts) || !sameAddress(accounts[0], account)) {
    throw new Error("Your wallet account or network changed. Return to Sepolia with the original account before retrying.");
  }
}

export type PaymentReceipt = {
  id: number; hash: string; block: number; buyer: string; seller: string | null;
  paid: bigint; payout: Quote; platformWallet: string;
};
const marketInterface = new Interface(marketAbi);
const tokenInterface = new Interface(currencyAbi);
function paymentEvent(event: NonNullable<ReturnType<Interface["parseLog"]>>, hash: string, block: number): PaymentReceipt {
  const a = event.args;
  return { id: Number(a.id), hash, block, buyer: a.buyer, seller: event.name === "Resold" ? a.seller : null,
    paid: a.price, platformWallet: a.platform,
    payout: { seller: event.name === "Resold" ? a.sellerAmount : 0n, hotel: a.hotelAmount, platform: a.platformAmount } };
}

export type BookingHistory = {
  through: number;
  purchases: PaymentReceipt[];
  resales: Map<number, { sales: bigint; volume: bigint }>;
  checkedIn: Map<number, string>;
};

export function walletPaymentReceipts(purchases: PaymentReceipt[], address: string | null) {
  type WalletReceipt = { purchase: PaymentReceipt; resale?: PaymentReceipt };
  const receipts: WalletReceipt[] = [];
  const held = new Map<number, WalletReceipt>();
  for (const payment of purchases) {
    if (sameAddress(payment.seller, address)) {
      const acquired = held.get(payment.id);
      if (acquired) acquired.resale = payment;
      held.delete(payment.id);
    }
    if (sameAddress(payment.buyer, address)) {
      const receipt = { purchase: payment };
      receipts.push(receipt);
      held.set(payment.id, receipt);
    }
  }
  return receipts.reverse();
}

export async function readBookingHistory(market: Contract, fromBlock: number, through: number, previous?: BookingHistory): Promise<BookingHistory> {
  if (previous?.through === through) return previous;
  if (fromBlock > through) throw new Error("The deployment block is in the future.");
  const base = previous && previous.through < through ? previous : undefined;
  const purchases = [...(base?.purchases ?? [])];
  const resales = new Map(base?.resales);
  const checkedIn = new Map(base?.checkedIn);
  const provider = market.runner?.provider;
  if (!provider) throw new Error("Cannot read Sepolia history.");
  const address = await market.getAddress();
  const topics = ["PrimaryPurchased", "Resold", "CheckedIn"].map((event) => marketInterface.getEvent(event)!.topicHash);
  for (let start = base ? base.through + 1 : fromBlock; start <= through; start += 2_000) {
    const logs = await provider.getLogs({ address, topics: [topics], fromBlock: start, toBlock: Math.min(through, start + 1_999) });
    for (const log of logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index)) {
      const event = marketInterface.parseLog(log);
      if (!event) continue;
      if (event.name === "CheckedIn") checkedIn.set(Number(event.args.id), event.args.traveler);
      else {
        const entry = paymentEvent(event, log.transactionHash, log.blockNumber);
        purchases.push(entry);
        if (entry.seller) {
          const prior = resales.get(entry.id) ?? { sales: 0n, volume: 0n };
          resales.set(entry.id, { sales: prior.sales + 1n, volume: prior.volume + entry.paid });
        }
      }
    }
  }
  return { through, purchases, resales, checkedIn };
}

export async function verifyPurchaseReceipt(market: Contract, token: Contract, id: number, buyer: string, receipt: TransactionReceipt) {
  const [marketAddress, tokenAddress, night, balance, holder] = await Promise.all([
    market.getAddress(), token.getAddress(), market.nights(id, { blockTag: receipt.blockNumber }),
    market.balanceOf(buyer, id, { blockTag: receipt.blockNumber }),
    market.currentHolder(id, { blockTag: receipt.blockNumber }),
  ]);
  if (receipt.status !== 1 || balance !== 1n || !sameAddress(holder, buyer)) throw new Error("Could not confirm ownership after the purchase.");
  const event = receipt.logs.flatMap((log) => {
    const parsed = sameAddress(log.address, marketAddress) ? marketInterface.parseLog(log) : null;
    return parsed && ["PrimaryPurchased", "Resold"].includes(parsed.name) && parsed.args.id === BigInt(id) && sameAddress(parsed.args.buyer, buyer)
      ? [parsed] : [];
  })[0];
  if (!event) throw new Error("The expected booking payment event was not found.");
  const result = paymentEvent(event, receipt.hash, receipt.blockNumber);
  const destinations = new Map<string, bigint>();
  for (const [to, amount] of [[night.hotel, result.payout.hotel], [result.platformWallet, result.payout.platform], [result.seller, result.payout.seller]] as const) {
    if (to && amount) destinations.set(to.toLowerCase(), (destinations.get(to.toLowerCase()) ?? 0n) + amount);
  }
  for (const log of receipt.logs) {
    const transfer = sameAddress(log.address, tokenAddress) ? tokenInterface.parseLog(log) : null;
    if (transfer?.name !== "Transfer" || !sameAddress(transfer.args.from, buyer)) continue;
    const key: string = transfer.args.to.toLowerCase();
    destinations.set(key, (destinations.get(key) ?? 0n) - transfer.args.value);
  }
  if ([...destinations.values()].some((left) => left !== 0n) || result.paid !== result.payout.hotel + result.payout.platform + result.payout.seller) {
    throw new Error("Could not verify the MockTHB payment split from the transaction logs.");
  }
  return result;
}

export async function purchase(
  market: Contract, token: Contract, night: Night, resale: boolean, account: string,
  ensureWallet: () => Promise<void>,
  confirm: (label: string, response: TransactionResponse) => Promise<TransactionReceipt>,
) {
  const provider = market.runner?.provider;
  if (!provider) throw new Error("Connect to Sepolia first.");
  const price = resale ? night.listingPrice : night.originalPrice;
  async function validateOffer() {
    const block = await provider!.getBlock("latest");
    if (!block) throw new Error("Could not read the latest block.");
    const fresh: NightRecord = await market.nights(night.id, { blockTag: block.number });
    const time = BigInt(block.timestamp);
    if (resale ? !canResell(fresh, time) || !sameAddress(fresh.holder, night.holder) || fresh.listingPrice !== price
      : !canBuyNight(fresh, time) || fresh.originalPrice !== price) {
      throw new Error("This offer changed or closed before checkout. Refresh the listing.");
    }
  }
  await ensureWallet();
  await validateOffer();
  const spender = await market.getAddress();
  const [balance, allowance] = await Promise.all([token.balanceOf(account), token.allowance(account, spender)]);
  if (balance < price) throw new Error("This wallet does not have enough MockTHB.");
  if (allowance < price) {
    await ensureWallet();
    await confirm("Approve " + formatTHB(price) + " MockTHB", await token.approve(spender, price));
    await ensureWallet();
    await validateOffer();
  }
  await ensureWallet();
  const send = resale ? market.buyResale(night.id, night.holder, price) : market.buyNight(night.id, price);
  const receipt = await confirm((resale ? "Buy resale #" : "Book night #") + night.id, await send);
  return verifyPurchaseReceipt(market, token, night.id, account, receipt);
}

export const proofTypes = { CheckIn: [
  { name: "tokenId", type: "uint256" }, { name: "hotel", type: "address" }, { name: "holder", type: "address" },
  { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
] };
export const proofDomain = (verifyingContract: string, chainId: number) => ({
  name: "StayCoin Night Token", version: "3", chainId, verifyingContract,
});
type GuestProof = { tokenId: string; hotel: string; holder: string; nonce: string; deadline: string; signature: string };
export async function signGuestProof(night: Night, signer: Signer, contract: string) {
  const block = await signer.provider?.getBlock("latest");
  if (!block || !canCheckIn(night, BigInt(block.timestamp))) throw new Error("Check-in is only open during the Bangkok stay date.");
  if (!sameAddress(await signer.getAddress(), night.holder)) throw new Error("Sign with the current booking holder wallet.");
  const limit = BigInt(block.timestamp + 600);
  const end = night.stayDate + DAY - 1n;
  const proof = { tokenId: String(night.id), hotel: night.hotel, holder: night.holder, nonce: String(night.nonce),
    deadline: String(limit < end ? limit : end) };
  const signature = await signer.signTypedData(proofDomain(contract, sepolia.id), proofTypes, proof);
  return JSON.stringify({ ...proof, signature, chainId: sepolia.id, contract });
}

export function parseGuestProof(text: string, night: Night, contract: string, now: bigint): GuestProof {
  let value: GuestProof & { chainId: number; contract: string };
  try { value = JSON.parse(text); } catch { throw new Error("Paste the guest’s full authorization text."); }
  if (!value || value.chainId !== sepolia.id || !sameAddress(typeof value.contract === "string" ? value.contract : null, contract)
    || value.tokenId !== String(night.id) || !sameAddress(typeof value.hotel === "string" ? value.hotel : null, night.hotel)
    || !sameAddress(typeof value.holder === "string" ? value.holder : null, night.holder) || value.nonce !== String(night.nonce)
    || typeof value.deadline !== "string" || !/^\d{1,12}$/.test(value.deadline)
    || typeof value.signature !== "string" || !/^0x[0-9a-f]{130}$/i.test(value.signature)) {
    throw new Error("The authorization does not match this booking, contract, or current guest.");
  }
  if (BigInt(value.deadline) < now) throw new Error("The guest authorization expired. Ask for a new signature.");
  return value;
}
