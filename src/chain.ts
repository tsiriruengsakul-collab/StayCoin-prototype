import { Contract, formatEther, getAddress, isAddress, ZeroAddress, type ContractRunner } from "ethers";

export const sepolia = { id: 11155111, hex: "0xaa36a7", explorer: "https://sepolia.etherscan.io" };
const configuredAddress = (import.meta.env?.VITE_STAYCOIN_CONTRACT_ADDRESS || "").trim();
export const contractAddress = isAddress(configuredAddress) && configuredAddress !== ZeroAddress
  ? getAddress(configuredAddress)
  : null;
export const invalidAddress = Boolean(configuredAddress && !contractAddress);

export const nightTokenAbi = [
  "function symbol() view returns (string)",
  "function owner() view returns (address)",
  "function nextNightId() view returns (uint256)",
  "function hotels(address) view returns (string name, string city, uint32 rooms)",
  "function nights(uint256) view returns (address hotel, address holder, uint256 stayDate, uint256 originalPrice, uint256 lastPaidPrice, uint256 listingPrice, string roomType, bool redeemed)",
  "function issuedForDate(address,uint256) view returns (uint256)",
  "function proceeds(address) view returns (uint256)",
  "function balanceOf(address,uint256) view returns (uint256)",
  "function registerHotel(address,string,string,uint32)",
  "function createNight(uint256,string,uint256)",
  "function buyNight(uint256) payable",
  "function listForResale(uint256,uint256)",
  "function cancelListing(uint256)",
  "function buyResale(uint256,address) payable",
  "function checkIn(uint256,address)",
  "function withdrawProceeds(address)",
];

export function marketplace(runner: ContractRunner) {
  if (!contractAddress) throw new Error("Set a valid Sepolia contract address to enable wallet transactions.");
  return new Contract(contractAddress, nightTokenAbi, runner);
}

export type Hotel = { name: string; city: string; rooms: bigint };
export type Night = {
  id: number;
  hotel: string;
  holder: string;
  stayDate: bigint;
  originalPrice: bigint;
  lastPaidPrice: bigint;
  listingPrice: bigint;
  roomType: string;
  redeemed: boolean;
  property: Hotel;
};
type NightRecord = Omit<Night, "id" | "property">;
export const sameAddress = (left: string | null, right: string | null) =>
  Boolean(left && right && left.toLowerCase() === right.toLowerCase());

export async function readMarket(contract: Contract, address: string | null, blockTag: number) {
  const overrides = { blockTag };
  const [owner, nextId, hotel, proceeds] = await Promise.all([
    contract.owner(overrides) as Promise<string>,
    contract.nextNightId(overrides) as Promise<bigint>,
    address ? contract.hotels(address, overrides) as Promise<Hotel> : null,
    address ? contract.proceeds(address, overrides) as Promise<bigint> : 0n,
  ]);
  const nights: Night[] = [];
  const hotels = new Map<string, Promise<Hotel>>();
  // This small pilot reads directly from the contract, in bounded RPC batches.
  for (let start = 1; start < Number(nextId); start += 12) {
    const end = Math.min(start + 12, Number(nextId));
    const ids = Array.from({ length: end - start }, (_, index) => start + index);
    const batch = await Promise.all(ids.map(async (id) => {
      const record = await contract.nights(id, overrides) as NightRecord;
      let property = hotels.get(record.hotel);
      if (!property) {
        property = contract.hotels(record.hotel, overrides) as Promise<Hotel>;
        hotels.set(record.hotel, property);
      }
      const ownsNight = !address || !sameAddress(record.holder, address) || record.redeemed
        || await contract.balanceOf(address, id, overrides) === 1n;
      if (!ownsNight) throw new Error("Booking ownership could not be verified.");
      return {
        id, hotel: record.hotel, holder: record.holder, stayDate: record.stayDate,
        originalPrice: record.originalPrice, lastPaidPrice: record.lastPaidPrice,
        listingPrice: record.listingPrice, roomType: record.roomType, redeemed: record.redeemed,
        property: await property,
      };
    }));
    nights.push(...batch);
  }
  return { owner, hotel, proceeds, nights };
}

export function resaleSplit(price: bigint, paid: bigint) {
  const hotel = (price > paid ? price - paid : 0n) * 2500n / 10000n;
  const platform = price * 300n / 10000n;
  return { hotel, platform, seller: price - hotel - platform };
}

export function bookingDate(day: string) {
  const millis = Date.parse(day + "T00:00:00+07:00");
  if (!Number.isFinite(millis)) throw new Error("Enter a valid Bangkok stay date.");
  return BigInt(millis / 1000);
}
export const dateKey = (seconds: bigint) =>
  new Date((Number(seconds) + 7 * 3600) * 1000).toISOString().slice(0, 10);
export const displayDay = (day: string) => new Intl.DateTimeFormat("en", {
  month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
}).format(new Date(day + "T00:00:00Z"));
export const testEth = (value: bigint) => formatEther(value) + " test ETH";
export const shortAddress = (value: string) => value.slice(0, 6) + "…" + value.slice(-4);

export function errorText(error: unknown) {
  if (error && typeof error === "object") {
    const result = error as { code?: number | string; reason?: string; shortMessage?: string; message?: string };
    if (result.code === 4001 || result.code === "ACTION_REJECTED") return "You declined the request in your wallet.";
    if (result.code === -32002) return "Open MetaMask to complete the request already in progress.";
    return result.reason || result.shortMessage || result.message || "Something went wrong. Try again.";
  }
  return "Something went wrong. Try again.";
}
