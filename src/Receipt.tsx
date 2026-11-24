import { BadgeCheck, ExternalLink } from "lucide-react";
import { brand } from "./brand";
import { DAY, dateKey, displayDay, sameAddress, sepolia } from "./chain";
import { formatTHB, type PaymentReceipt } from "./marketV3";
import type { Market } from "./useMarket";

export const bookingReference = (id: number) => "SC-V3-" + id;

export function ReceiptCard({ market, receipt, heading = true }: { market: Market; receipt: PaymentReceipt; heading?: boolean }) {
  const night = market.synced?.data.nights.find((entry) => entry.id === receipt.id);
  const snapshotCurrent = Boolean(market.synced && market.synced.blockNumber >= receipt.block);
  let entitlement = "Checking current ownership";
  if (snapshotCurrent && night) {
    if (night.redeemed) entitlement = "Redeemed · token burned";
    else if (night.expired || market.synced!.blockTime >= night.stayDate + DAY) entitlement = "Expired";
    else if (sameAddress(night.holder, receipt.buyer)) entitlement = "Current holder";
    else entitlement = "Transferred · historical receipt only";
  }
  return <article className="panel">
    <div className="row-between"><div className="booking-heading"><span className="tile-icon"><BadgeCheck size={24} /></span><div>
      <h3>{heading ? brand.websiteName + " booking confirmed" : brand.websiteName + " booking receipt"}</h3>
      <p>{receipt.seller ? "Resale purchase" : "Primary purchase"} · {bookingReference(receipt.id)} · Night Token #{receipt.id}</p>
    </div></div><span className="pill">{entitlement}</span></div>
    {night && <p className="panel-meta">{night.hotelName} · {night.roomCategory} · {displayDay(dateKey(night.stayDate))} (Bangkok)</p>}
    <dl className="split-grid">
      <div><dt>Paid · MockTHB</dt><dd><strong>{formatTHB(receipt.paid)}</strong></dd></div>
      {receipt.seller && <div><dt>Seller received</dt><dd><strong>{formatTHB(receipt.payout.seller)}</strong></dd></div>}
      <div><dt>Hotel received</dt><dd><strong>{formatTHB(receipt.payout.hotel)}</strong></dd></div>
      <div><dt>{brand.websiteName} received</dt><dd><strong>{formatTHB(receipt.payout.platform)}</strong></dd></div>
    </dl>
    <a className="hash-link" href={sepolia.explorer + "/tx/" + receipt.hash} target="_blank" rel="noreferrer">
      <ExternalLink size={16} /><span>{receipt.hash}</span></a>
    {heading && <div><a className="button secondary compact" href="/bookings">Go to My Bookings</a></div>}
  </article>;
}
