const statuses = {
  sample: ["Sample booking", "neutral"],
  checking: ["Checking current ownership", "neutral"],
  available: ["Available", "available"],
  booked: ["Booked", "booked"],
  current: ["Current holder", "booked"],
  listed: ["Listed", "listed"],
  checkInToday: ["Check-in today", "check-in"],
  checkInOpen: ["Check-in open", "check-in"],
  redeemed: ["Redeemed", "redeemed"],
  redeemedBurned: ["Redeemed · token burned", "redeemed"],
  transferred: ["Transferred · historical receipt only", "neutral"],
  awaitingExpiry: ["Awaiting expiry", "closed"],
  salesClosed: ["Sales closed", "closed"],
  expired: ["Expired", "closed"],
  expiredBurned: ["Expired · token burned", "closed"],
} as const;

export type BookingState = keyof typeof statuses;

export function BookingStatus({ status }: { status: BookingState }) {
  const [label, tone] = statuses[status];
  return <span className={"pill booking-status booking-status-" + tone}>{label}</span>;
}
