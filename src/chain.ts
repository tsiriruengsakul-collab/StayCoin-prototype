import { Contract, formatEther, getAddress, isAddress, ZeroAddress, type ContractRunner } from "ethers";

export const sepolia = { id: 11155111, hex: "0xaa36a7", explorer: "https://sepolia.etherscan.io" };
const configuredAddress = (import.meta.env?.VITE_STAYCOIN_CONTRACT_ADDRESS || "").trim();
export const contractAddress = isAddress(configuredAddress) && configuredAddress !== ZeroAddress
  ? getAddress(configuredAddress)
  : null;
export const invalidAddress = Boolean(configuredAddress && !contractAddress);

export const nightTokenAbi = [
  "function VERSION() view returns (uint256)",
  "function pointBalance(address) view returns (uint256)",
  "function pointsExpireAt(address) view returns (uint256)",
  "function rewardsReserve() view returns (uint256)",
  "function buyNightWithPoints(uint256,uint256) payable",
  "function fundRewards() payable",
  "function nextPassId() view returns (uint256)",
  "function happyPasses(uint256) view returns (address token, uint8 tier, uint64 starts, uint64 ends, uint256 price, uint256 committed, uint256 issued)",
  "function passForNight(uint256) view returns (uint256)",
  "function createHappyPass(uint8,uint64,uint64,uint256)",
  "function setHotelTier(address,uint8)",
  "function hotelTier(address) view returns (uint8)",
  "function commitHappyNight(uint256,uint256)",
  "function releaseHappyNight(uint256)",
  "function buyHappyPass(uint256) payable",
  "function redeemHappyPass(uint256,uint256)",
  "function refundExpiredPass(uint256)",
  "function hotelBond(address) view returns (uint256)",
  "function hotelBondLocked(address) view returns (uint256)",
  "function nightFeatures(uint256) view returns (uint256 passId, uint256 coverage, uint8 claim, uint256 sales, uint256 volume)",
  "function depositHotelBond() payable",
  "function withdrawHotelBond(uint256)",
  "function protectNight(uint256)",
  "function releaseNightBond(uint256)",
  "function requestBondRefund(uint256)",
  "function resolveBondClaim(uint256,bool)",
  "function claimTimedOutBond(uint256)",
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
  passId: bigint;
  coverage: bigint;
  claim: bigint;
  resaleCount: bigint;
  resaleVolume: bigint;
};
type NightRecord = Pick<Night, "hotel" | "holder" | "stayDate" | "originalPrice" | "lastPaidPrice" | "listingPrice" | "roomType" | "redeemed">;
type PassRecord = { token: string; tier: bigint; starts: bigint; ends: bigint; price: bigint; committed: bigint; issued: bigint };
export type HappyPass = PassRecord & { id: number; balance: bigint };
export const POINT_VALUE = 10n ** 12n;
export const DAY = 86400n;
export const sameAddress = (left: string | null, right: string | null) =>
  Boolean(left && right && left.toLowerCase() === right.toLowerCase());

export async function readMarket(contract: Contract, address: string | null, blockTag: number) {
  const overrides = { blockTag };
  const [owner, nextId, hotel, proceeds, nextPass, rewards, points, pointsExpiry, bond, locked, tier] = await Promise.all([
    contract.owner(overrides) as Promise<string>,
    contract.nextNightId(overrides) as Promise<bigint>,
    address ? contract.hotels(address, overrides) as Promise<Hotel> : null,
    address ? contract.proceeds(address, overrides) as Promise<bigint> : 0n,
    contract.nextPassId(overrides) as Promise<bigint>,
    contract.rewardsReserve(overrides) as Promise<bigint>,
    address ? contract.pointBalance(address, overrides) as Promise<bigint> : 0n,
    address ? contract.pointsExpireAt(address, overrides) as Promise<bigint> : 0n,
    address ? contract.hotelBond(address, overrides) as Promise<bigint> : 0n,
    address ? contract.hotelBondLocked(address, overrides) as Promise<bigint> : 0n,
    address ? contract.hotelTier(address, overrides) as Promise<bigint> : 0n,
  ]);
  const nights: Night[] = [];
  const hotels = new Map<string, Promise<Hotel>>();
  // This small pilot reads directly from the contract, in bounded RPC batches.
  for (let start = 1; start < Number(nextId); start += 12) {
    const end = Math.min(start + 12, Number(nextId));
    const ids = Array.from({ length: end - start }, (_, index) => start + index);
    const batch = await Promise.all(ids.map(async (id) => {
      const [record, features] = await Promise.all([
        contract.nights(id, overrides) as Promise<NightRecord>,
        contract.nightFeatures(id, overrides) as Promise<[bigint, bigint, bigint, bigint, bigint]>,
      ]);
      const [passId, coverage, claim, resaleCount, resaleVolume] = features;
      let property = hotels.get(record.hotel);
      if (!property) {
        property = contract.hotels(record.hotel, overrides) as Promise<Hotel>;
        hotels.set(record.hotel, property);
      }
      const ownsNight = !address || !sameAddress(record.holder, address) || record.redeemed
        || await contract.balanceOf(address, id, overrides) === 1n;
      if (!ownsNight) throw new Error("Booking ownership could not be verified.");
      return {
        passId, coverage, claim, resaleCount, resaleVolume,
        id, hotel: record.hotel, holder: record.holder, stayDate: record.stayDate,
        originalPrice: record.originalPrice, lastPaidPrice: record.lastPaidPrice,
        listingPrice: record.listingPrice, roomType: record.roomType, redeemed: record.redeemed,
        property: await property,
      };
    }));
    nights.push(...batch);
  }
  const passes: HappyPass[] = [];
  for (let id = 1; id < Number(nextPass); id += 1) {
    const pass = await contract.happyPasses(id, overrides) as PassRecord;
    const token = new Contract(pass.token, ["function balanceOf(address) view returns (uint256)"], contract.runner);
    const balance: bigint = address ? await token.balanceOf(address, overrides) : 0n;
    passes.push({ id, balance, token: pass.token, tier: pass.tier, starts: pass.starts, ends: pass.ends,
      price: pass.price, committed: pass.committed, issued: pass.issued });
  }
  return { owner, hotel, proceeds, nights, passes, rewards, points, pointsExpiry, bond, locked, tier };

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
