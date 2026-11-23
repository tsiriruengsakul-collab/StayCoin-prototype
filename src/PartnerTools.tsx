import { BarChart3, BedDouble, CalendarCheck, ShieldCheck, Ticket } from "lucide-react";
import { canBuyNight, dateKey, displayDay, DAY, hotelLabel, shortAddress, testEth, type BookingHistory, type Night } from "./chain";
import { baht } from "./demo";
import type { Market } from "./useMarket";

const sample = [
  { label: "Mon", sales: 3, total: 6300 },
  { label: "Tue", sales: 2, total: 4900 },
  { label: "Wed", sales: 4, total: 9600 },
  { label: "Thu", sales: 2, total: 5200 },
  { label: "Fri", sales: 6, total: 18300 },
  { label: "Sat", sales: 7, total: 24150 },
  { label: "Sun", sales: 4, total: 11200 },
];

export function PartnerOverview({ inventory, timestamp, history, historyError, preview = false }: { inventory: Night[]; timestamp: bigint; history?: BookingHistory; historyError?: string; preview?: boolean }) {
  const active = inventory.filter((night) => canBuyNight(night, timestamp));
  const checkIns = inventory.filter((night) => night.stayDate <= timestamp && night.stayDate + DAY > timestamp
    && night.sold && !night.redeemed && !night.expired);
  const protectedNights = inventory.filter((night) => night.bond > 0n).length;
  const stats = [
    { label: "Nights minted", value: preview ? 38 : inventory.length, Icon: BedDouble },
    { label: "Available nights", value: preview ? 16 : active.length, Icon: Ticket },
    { label: "Check-ins today", value: preview ? 5 : checkIns.length, Icon: CalendarCheck },
    { label: "Nights with held bonds", value: preview ? 12 : protectedNights, Icon: ShieldCheck },
  ];

  const groups = new Map<string, { volume: bigint; sales: bigint }>();
  for (const night of inventory) {
    const confirmed = history?.resales.get(night.id);
    if (!confirmed) continue;
    const day = dateKey(night.stayDate);
    const group = groups.get(day) ?? { volume: 0n, sales: 0n };
    groups.set(day, { volume: group.volume + confirmed.volume, sales: group.sales + confirmed.sales });
  }
  const realRows = Array.from(groups).sort(([a], [b]) => a.localeCompare(b)).map(([date, group]) =>
    ({ label: displayDay(date), ...group, average: group.volume / group.sales }));
  const demoRows = sample.map(({ label, sales, total }) => ({ label, sales: BigInt(sales), volume: BigInt(total), average: BigInt(Math.round(total / sales)) }));
  const allRows = preview ? demoRows : realRows;
  const hasAnalytics = preview || Boolean(history);
  const rows = allRows.slice(-7);
  const totalSales = allRows.reduce((total, row) => total + row.sales, 0n);
  const volume = allRows.reduce((total, row) => total + row.volume, 0n);
  const max = rows.reduce((highest, row) => row.average > highest ? row.average : highest, 1n);
  const money = (amount: bigint) => preview ? baht(Number(amount)) : testEth(amount);

  return <div className="portal-overview">
    {preview && <div><span className="badge">SAMPLE DASHBOARD</span></div>}
    <div className="partner-stats">{stats.map(({ label, value, Icon }) => <article className="panel metric-card" key={label}>
      <span className="tile-icon"><Icon size={20} /></span><span>{label}</span><strong>{value}</strong>
    </article>)}</div>
    <article className="panel analytics-panel"><div className="row-between">
      <div className="booking-heading"><span className="tile-icon"><BarChart3 size={24} /></span><div>
        <h3>Resale pricing analytics</h3><p>Average completed resale price by stay date</p></div></div>
      <span className="pill">{preview ? "Sample data · THB" : history ? "Confirmed sales · Sepolia" : "History unavailable"}</span>
    </div>
    {hasAnalytics && <dl className="pass-facts analytics-totals"><div><dt>Completed resales</dt><dd>{String(totalSales)}</dd></div>
      <div><dt>Average resale price</dt><dd>{totalSales ? money(volume / totalSales) : "—"}</dd></div>
      <div><dt>Resale volume</dt><dd>{money(volume)}</dd></div></dl>}
    {rows.length ? <div className="price-chart" aria-label="Average prices for the last seven tracked stay dates">
      {rows.map((row) => <div key={row.label} className="chart-row">
        <span>{row.label}</span><div className="chart-track" aria-hidden="true"><div style={{ width: String(row.average * 100n / max) + "%" }} /></div>
        <span>{money(row.average)} <small>· {String(row.sales)} sold</small></span>
      </div>)}
    </div> : <p className="inline-note">{hasAnalytics ? "The chart appears after a traveler completes a resale for your property."
      : historyError || "Set VITE_STAYCOIN_DEPLOYMENT_BLOCK to the deployment receipt’s block to load resale history."}</p>}
    </article>
  </div>;
}

export function ExpireNight({ market, night }: { market: Market; night: Night }) {
  const now = market.synced?.blockTime;
  if (now === undefined || now < night.stayDate + DAY || night.redeemed || night.expired) return null;
  return <button className="button secondary compact" disabled={!market.canWrite || market.busy} onClick={() => {
    if (window.confirm("Mark this booking expired and burn the unused token?")) {
      void market.run("Expire night #" + night.id, (contract) => contract.expireNight(night.id));
    }
  }}>Finalize expiry</button>;
}

export function ExpiredBonds({ market }: { market: Market }) {
  const { data, blockTime } = market.synced!;
  const pending = data.nights.filter((night) =>
    night.bond > 0n && !night.redeemed && (night.expired || blockTime >= night.stayDate + DAY));
  if (!pending.length) return null;
  return <article className="panel claim-review"><h3>Expired hotel bonds</h3>
    <p>Verify the outcome off-chain. After expiry, the platform owner can credit the held bond to the issuing hotel or the final traveler.</p>
    {pending.map((night) => <div className="row-between claim-line" key={night.id}><div>
      <strong>Night #{night.id} · {hotelLabel(night.hotel)}</strong><p>{testEth(night.bond)} held</p>
    </div><div className="partner-actions">{!night.expired ? <ExpireNight market={market} night={night} />
      : [[night.expiredHolder, "final traveler"], [night.hotel, "hotel"]].map(([recipient, role]) => (
        <button key={role} className="button secondary compact" disabled={!market.canWrite || market.busy} onClick={() => {
          if (window.confirm("Credit " + testEth(night.bond) + " to the " + role + " (" + shortAddress(recipient) + ")?")) {
            void market.run("Settle bond for night #" + night.id, (contract) => contract.settleExpiredBond(night.id, recipient));
          }
        }}>Credit {role}</button>
      ))}</div></div>)}
  </article>;
}

export function BondStatus({ market, night }: { market: Market; night: Night }) {
  const settlement = market.history?.settlements.get(night.id);
  if (settlement) return <p className="inline-note">Expired bond credited to {shortAddress(settlement.recipient)} · {testEth(settlement.amount)}.</p>;
  if (night.bond > 0n) return <p className="inline-note">Hotel bond held: {testEth(night.bond)} from the original sale.
    {night.expired ? " The platform owner can resolve this partial bond after expiry." : " The hotel receives the bond after check-in."}</p>;
  if (night.expired && night.sold) return <p className="inline-note">No bond remains held for this expired booking.</p>;
  return null;
}
