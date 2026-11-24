import {
  Contract, formatEther, getAddress, isAddress, parseEther, ZeroAddress,
  type ContractRunner, type Provider,
} from "ethers";
import deployment from "./generated/nightTokenV2.json";
import { runtimeFingerprint } from "./runtimeCode";

export const sepolia = { id: 11155111, hex: "0xaa36a7", explorer: "https://sepolia.etherscan.io" };
const configuredAddress = (import.meta.env?.VITE_STAYCOIN_CONTRACT_ADDRESS || "").trim();
export const contractAddress = isAddress(configuredAddress) && configuredAddress !== ZeroAddress
  ? getAddress(configuredAddress)
  : null;
export const invalidAddress = Boolean(configuredAddress && !contractAddress);
const configuredBlock = (import.meta.env?.VITE_STAYCOIN_DEPLOYMENT_BLOCK || "").trim();
export const deploymentBlock = /^\d+$/.test(configuredBlock) && Number.isSafeInteger(Number(configuredBlock)) && Number(configuredBlock) > 0
  ? Number(configuredBlock) : null;

export const nightTokenAbi = deployment.abi;
export const expectedRuntimeHash = deployment.runtimeHash;

export function marketplace(runner: ContractRunner, address = contractAddress) {
  if (!address) throw new Error("Configure the patched V2 Sepolia contract address to enable transactions.");
  return new Contract(address, nightTokenAbi, runner);
}

export async function verifyNightTokenV2(provider: Provider, address: string, blockTag: number) {
  const code = await provider.getCode(address, blockTag);
  if (code === "0x") throw new Error("No contract is deployed at this address on Sepolia.");
  let fingerprint = "";
  try { fingerprint = runtimeFingerprint(code); } catch { /* The configured code uses a different format. */ }
  if (fingerprint !== expectedRuntimeHash) throw new Error("This address is not the tested, patched Night Token V2 contract.");
  const contract = marketplace(provider, address);
  if (!await contract.supportsInterface("0xd9b67a26", { blockTag })) {
    throw new Error("The configured contract does not report ERC-1155 support.");
  }
  return contract;
}

export type Hotel = { approved: boolean; verifiedRooms: bigint };
type NightRecord = {
  hotel: string;
  stayDate: bigint;
  originalPrice: bigint;
  lastPaidPrice: bigint;
  listingPrice: bigint;
  listingSeller: string;
  sold: boolean;
  redeemed: boolean;
  expired: boolean;
};
type ResaleQuote = { seller: bigint; hotel: bigint; platform: bigint };
export type Night = NightRecord & {
  id: number;
  holder: string;
  expiredHolder: string;
  bond: bigint;
  quote: ResaleQuote | null;
};
export const DAY = 86400n;
export const sameAddress = (left: string | null, right: string | null) =>
  Boolean(left && right && left.toLowerCase() === right.toLowerCase());

export async function readMarket(contract: Contract, address: string | null, blockTag: number, timestamp: bigint) {
  const overrides = { blockTag };
  const [owner, nextId, hotel, proceeds] = await Promise.all([
    contract.owner(overrides) as Promise<string>,
    contract.nextNightId(overrides) as Promise<bigint>,
    address ? contract.hotels(address, overrides) as Promise<Hotel> : null,
    address ? contract.pendingWithdrawals(address, overrides) as Promise<bigint> : 0n,
  ]);
  const nights: Night[] = [];
  for (let start = 1; start < Number(nextId); start += 8) {
    const ids = Array.from({ length: Math.min(8, Number(nextId) - start) }, (_, index) => start + index);
    nights.push(...await Promise.all(ids.map(async (id) => {
      const [record, holder, bond]: [NightRecord, string, bigint] = await Promise.all([
        contract.nights(id, overrides), contract.currentHolder(id, overrides), contract.bondHeld(id, overrides),
      ]);
      const [expiredHolder, quote, balance] = await Promise.all([
        record.expired ? contract.expiredHolder(id, overrides) as Promise<string> : ZeroAddress,
        record.listingPrice > 0n && timestamp < record.stayDate && !record.expired && !record.redeemed
          ? readResaleQuote(contract, id, blockTag) : null,
        address && sameAddress(holder, address) ? contract.balanceOf(address, id, overrides) as Promise<bigint> : 1n,
      ]);
      if (balance !== 1n) throw new Error("The current booking holder could not be verified.");
      return {
        id, holder, expiredHolder, bond, quote,
        hotel: record.hotel, stayDate: record.stayDate, originalPrice: record.originalPrice, lastPaidPrice: record.lastPaidPrice,
        listingPrice: record.listingPrice, listingSeller: record.listingSeller, sold: record.sold,
        redeemed: record.redeemed, expired: record.expired,
      };
    })));
  }
  return { owner, hotel, proceeds, nights };
}

async function readResaleQuote(contract: Contract, id: number, blockTag: number): Promise<ResaleQuote> {
  const [seller, hotel, platform]: [bigint, bigint, bigint] = await contract.quoteResale(id, { blockTag });
  return { seller, hotel, platform };
}

export type BookingHistory = {
  through: number;
  resales: Map<number, { sales: bigint; volume: bigint }>;
  checkedIn: Map<number, string>;
  settlements: Map<number, { recipient: string; amount: bigint }>;
};
export async function readBookingHistory(
  contract: Contract, firstBlock: number, through: number, previous?: BookingHistory,
): Promise<BookingHistory> {
  if (firstBlock > through) throw new Error("The configured V2 deployment block is in the future.");
  if (previous?.through === through) return previous;
  const base = previous && previous.through < through ? previous : undefined;
  const resales = new Map(base?.resales);
  const checkedIn = new Map(base?.checkedIn);
  const settlements = new Map(base?.settlements);
  const provider = contract.runner?.provider;
  if (!provider) throw new Error("Sepolia history is unavailable.");
  const address = await contract.getAddress();
  const topics = ["Resold", "CheckedIn", "ExpiredBondSettled"].map((name) => contract.interface.getEvent(name)!.topicHash);
  for (let from = base ? base.through + 1 : firstBlock; from <= through; from += 2_000) {
    const logs = await provider.getLogs({ address, topics: [topics], fromBlock: from, toBlock: Math.min(through, from + 1_999) });
    for (const log of logs) {
      const event = contract.interface.parseLog(log);
      if (!event) continue;
      const id = Number(event.args.id);
      if (event.name === "Resold") {
        const record = resales.get(id) ?? { sales: 0n, volume: 0n };
        resales.set(id, { sales: record.sales + 1n, volume: record.volume + event.args.priceWei });
      }
      if (event.name === "CheckedIn") checkedIn.set(id, event.args.traveler);
      if (event.name === "ExpiredBondSettled") settlements.set(id, { recipient: event.args.recipient, amount: event.args.amountWei });
    }
  }
  return { through, resales, checkedIn, settlements };
}

async function readFreshNight(contract: Contract, id: number) {
  const block = await contract.runner?.provider?.getBlock("latest");
  if (!block) throw new Error("Could not read the latest block. Try again.");
  const record: NightRecord = await contract.nights(id, { blockTag: block.number });
  return { record, blockTag: block.number, now: BigInt(block.timestamp) };
}

export const canBuyNight = (night: NightRecord, now: bigint) =>
  night.hotel !== ZeroAddress && !night.sold && !night.expired && !night.redeemed && now < night.stayDate;
export const canResell = (night: NightRecord, now: bigint) =>
  night.sold && !night.expired && !night.redeemed && now < night.stayDate;

export async function buyPrimaryNight(contract: Contract, id: number) {
  const { record, now } = await readFreshNight(contract, id);
  if (!canBuyNight(record, now)) throw new Error("This night has sold or is past the booking cutoff.");
  return contract.buyNight(id, { value: record.originalPrice });
}

export async function buyResaleNight(contract: Contract, night: Pick<Night, "id" | "listingSeller" | "listingPrice" | "quote">) {
  const { record, blockTag, now } = await readFreshNight(contract, night.id);
  if (!canResell(record, now) || !record.listingPrice || record.listingPrice !== night.listingPrice ||
      !sameAddress(record.listingSeller, night.listingSeller)) {
    throw new Error("This listing changed or reached its booking cutoff. Refresh the listing before buying.");
  }
  const quote = await readResaleQuote(contract, night.id, blockTag);
  if (!night.quote || quote.seller !== night.quote.seller || quote.hotel !== night.quote.hotel || quote.platform !== night.quote.platform) {
    throw new Error("The resale payout changed. Review the updated quote before buying.");
  }
  return contract.buyResale(night.id, record.listingSeller, { value: record.listingPrice });
}

export function resaleSplit(price: bigint, paid: bigint) {
  const hotel = (price > paid ? price - paid : 0n) * 2500n / 10000n;
  const platform = price * 300n / 10000n;
  return { hotel, platform, seller: price - hotel - platform };
}

export function bookingDate(day: string) {
  const millis = Date.parse(day + "T00:00:00+07:00");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(millis) || dateKey(BigInt(millis / 1000)) !== day) {
    throw new Error("Enter a valid Bangkok calendar date.");
  }
  return BigInt(millis / 1000);
}

export function futureStayDate(day: string, now: bigint) {
  const date = bookingDate(day);
  if (date <= now) throw new Error("Choose a stay date after today in Bangkok.");
  return date;
}

export function priceInWei(value: string) {
  if (!/^\d+(\.\d{1,18})?$/.test(value)) throw new Error("Enter a positive test ETH price with up to 18 decimal places.");
  const price = parseEther(value);
  if (price === 0n) throw new Error("Enter a price greater than zero.");
  return price;
}

export const dateKey = (seconds: bigint) =>
  new Date((Number(seconds) + 7 * 3600) * 1000).toISOString().slice(0, 10);
export const displayDay = (day: string) => new Intl.DateTimeFormat("en", {
  month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
}).format(new Date(day + "T00:00:00Z"));
export const testEth = (value: bigint) => formatEther(value) + " test ETH";
export const shortAddress = (value: string) => value.slice(0, 6) + "…" + value.slice(-4);
export const hotelLabel = (address: string) => "Hotel " + shortAddress(address);

export function errorText(error: unknown, gasOnly = false) {
  if (error && typeof error === "object") {
    const result = error as { code?: number | string; reason?: string; shortMessage?: string; message?: string;
      info?: { error?: { message?: string } } };
    if (result.code === 4001 || result.code === "ACTION_REJECTED") return "You declined the request in your wallet.";
    if (result.code === -32002) return "Open MetaMask to complete the request already in progress.";
    if (result.code === "INSUFFICIENT_FUNDS") return gasOnly ? "This wallet needs more Sepolia test ETH for gas." : "This wallet needs more Sepolia test ETH for the payment and gas.";
    if (result.code === "NETWORK_ERROR") return "The wallet network changed. Switch back to Sepolia and try again.";
    const message = result.reason || result.info?.error?.message || result.shortMessage || result.message || "";
    const explanations = [
      [/Incorrect test ETH payment|Incorrect listed price|Price changed/, "The exact on-chain price is required. Refresh this booking and try again."],
      [/ERC20InsufficientBalance/, "This wallet does not have enough MockTHB for the purchase."],
      [/ERC20InsufficientAllowance/, "Approve the booking’s MockTHB payment amount and retry."],
      [/Outside check-in day/, "Check-in is open only on the booking’s Bangkok stay date."],
      [/Night expired|Not available|Not resale eligible/, "This booking has sold, closed, or is no longer eligible for this action."],
      [/Hotel not approved|Use approved room count/, "Use an approved hotel wallet and its verified room count."],
      [/20 percent cap reached/, "This hotel has reached its 20% inventory cap for that Bangkok date."],
      [/Not holder|Traveler not holder|Wrong listing seller/, "The booking holder changed or does not match the selected traveler."],
      [/Only issuing hotel/, "Switch to the wallet of the hotel that issued this booking."],
      [/OwnableUnauthorizedAccount/, "Switch to the contract owner wallet to perform this action."],
      [/Stay not expired/, "Expiry opens after the Bangkok stay day ends."],
      [/Nothing to withdraw|No bond available/, "There is no remaining balance for this action."],
      [/missing revert data|could not coalesce/, "Sepolia could not complete this request. Refresh the booking, check MetaMask, and try again."],
    ] as const;
    return explanations.find(([pattern]) => pattern.test(message))?.[1] || message || "Something went wrong. Try again.";
  }
  return "Something went wrong. Try again.";
}
