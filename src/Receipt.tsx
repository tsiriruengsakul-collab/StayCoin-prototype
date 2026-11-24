import { BadgeCheck, ExternalLink } from "lucide-react";
import { brand } from "./brand";
import { BookingStatus, type BookingState } from "./BookingStatus";
import { DAY, dateKey, displayDay, sameAddress, sepolia } from "./chain";
import { formatTHB, type PaymentReceipt } from "./marketV3";
import type { Market } from "./useMarket";

export const bookingReference = (id: number) => "SC-V3-" + id;

export function ReceiptCard({ market, receipt, resale, heading = true }: { market: Market; receipt: PaymentReceipt; resale?: PaymentReceipt; heading?: boolean }) {
  const night = market.synced?.data.nights.find((entry) => entry.id === receipt.id);
  const snapshot = market.synced;
  let status: BookingState = resale ? "transferred" : "checking";
  if (!resale && night && snapshot && snapshot.blockNumber >= receipt.block) {
    if (night.redeemed) status = "redeemedBurned";
    else if (night.expired || snapshot.blockTime >= night.stayDate + DAY) status = "expired";
    else if (sameAddress(night.holder, receipt.buyer)) status = "current";
    else status = "transferred";
  }
  const transaction = resale ?? receipt;
  const amount = resale?.payout.seller ?? (status === "transferred" ? undefined : receipt.paid);
  const historyCurrent = snapshot && market.history && market.history.through >= snapshot.blockNumber;
  return <article className="panel">
    <div className="booking-card-head">
      <div className="booking-heading"><span className="tile-icon"><BadgeCheck size={24} /></span><div>
        <h3>{heading ? brand.websiteName + " booking confirmed" : brand.websiteName + " booking receipt"}</h3>
        <p>{resale ? "Resold booking" : receipt.seller ? "Resale purchase" : "Primary purchase"} · {bookingReference(receipt.id)}</p>
        {night && <p>{night.hotelName} · {night.roomCategory} · {displayDay(dateKey(night.stayDate))} (Bangkok)</p>}
      </div></div>
      <div className="booking-card-summary">
        <BookingStatus status={status} />
        {amount === undefined ? <p className="booking-asking">{historyCurrent || market.historyError ? "Resale proceeds unavailable" : "Loading resale proceeds…"}</p>
          : <p className="booking-amount"><span>{resale ? "Resale proceeds" : "You paid"}</span>
            <span><strong>{formatTHB(amount)}</strong> <small>MockTHB</small></span></p>}
        {resale && <p className="booking-asking">You paid {formatTHB(receipt.paid)}</p>}
      </div>
    </div>
    <a className="hash-link" href={sepolia.explorer + "/tx/" + transaction.hash} target="_blank" rel="noreferrer" title={transaction.hash}>
      <ExternalLink size={16} />{resale ? "View resale transaction" : "View purchase transaction"}</a>
    {resale && <div><a className="contract-link" href={sepolia.explorer + "/tx/" + receipt.hash} target="_blank" rel="noreferrer">View original purchase</a></div>}
    {heading && <div><a className="button secondary compact" href="/bookings">Go to My Bookings</a></div>}
  </article>;
}
