import { BarChart3, BedDouble, CalendarCheck, ShieldCheck, Ticket } from "lucide-react";
import { dateKey, displayDay, DAY } from "./chain";
import { canBuyNight, formatTHB, type BookingHistory, type Night } from "./marketV3";
import type { Market } from "./useMarket";

const sample = [
  { label: "Mon", sales: 3, volume: 6300, originalVolume: 5400 },
  { label: "Tue", sales: 2, volume: 4900, originalVolume: 4000 },
  { label: "Wed", sales: 4, volume: 9600, originalVolume: 8800 },
  { label: "Thu", sales: 2, volume: 5200, originalVolume: 4400 },
  { label: "Fri", sales: 6, volume: 18300, originalVolume: 14400 },
  { label: "Sat", sales: 7, volume: 24150, originalVolume: 18200 },
  { label: "Sun", sales: 4, volume: 11200, originalVolume: 9600 },
];
const averagePrice = (volume: bigint, count: bigint) => (volume + count / 2n) / count;

export function PartnerOverview({ inventory, timestamp, history, historyError, preview = false }: { inventory: Night[]; timestamp: bigint; history?: BookingHistory; historyError?: string; preview?: boolean }) {
  const active = inventory.filter((night) => canBuyNight(night, timestamp));
  const checkIns = inventory.filter((night) => night.stayDate <= timestamp && night.stayDate + DAY > timestamp
    && night.sold && !night.redeemed && !night.expired);
  const redeemed = inventory.filter((night) => night.redeemed).length;
  const stats = [
    { label: "Nights minted", value: preview ? 38 : inventory.length, Icon: BedDouble },
    { label: "Available nights", value: preview ? 16 : active.length, Icon: Ticket },
    { label: "Check-ins today", value: preview ? 5 : checkIns.length, Icon: CalendarCheck },
    { label: "Redeemed stays", value: preview ? 12 : redeemed, Icon: ShieldCheck },
  ];

  const groups = new Map<string, { volume: bigint; originalVolume: bigint; sales: bigint }>();
  for (const night of inventory) {
    const confirmed = history?.resales.get(night.id);
    if (!confirmed) continue;
    const day = dateKey(night.stayDate);
    const group = groups.get(day) ?? { volume: 0n, originalVolume: 0n, sales: 0n };
    groups.set(day, {
      volume: group.volume + confirmed.volume,
      originalVolume: group.originalVolume + night.originalPrice * confirmed.sales,
      sales: group.sales + confirmed.sales,
    });
  }
  const realRows = Array.from(groups).sort(([a], [b]) => a.localeCompare(b)).map(([date, group]) =>
    ({ label: displayDay(date), ...group, average: averagePrice(group.volume, group.sales) }));
  const demoRows = sample.map(({ label, sales, volume, originalVolume }) => ({
    label, sales: BigInt(sales), volume: BigInt(volume) * 100n, originalVolume: BigInt(originalVolume) * 100n,
    average: averagePrice(BigInt(volume) * 100n, BigInt(sales)),
  }));
  const allRows = preview ? demoRows : realRows;
  const hasAnalytics = preview || Boolean(history);
  const rows = allRows.slice(-7);
  const totalSales = allRows.reduce((total, row) => total + row.sales, 0n);
  const volume = allRows.reduce((total, row) => total + row.volume, 0n);
  const originalVolume = allRows.reduce((total, row) => total + row.originalVolume, 0n);
  const max = rows.reduce((highest, row) => row.average > highest ? row.average : highest, 1n);

  return <div className="portal-overview">
    {preview && <div><span className="badge">SAMPLE DASHBOARD</span></div>}
    <div className="partner-stats">{stats.map(({ label, value, Icon }) => <article className="panel metric-card" key={label}>
      <span className="tile-icon"><Icon size={20} /></span><span>{label}</span><strong>{value}</strong>
    </article>)}</div>
    <article className="panel analytics-panel"><div className="row-between">
      <div className="booking-heading"><span className="tile-icon"><BarChart3 size={24} /></span><div>
        <h3>Resale pricing analytics</h3><p>Original and resale prices for completed resales</p></div></div>
      <span className="pill">{preview ? "Sample data · THB" : history ? "Confirmed sales · MockTHB" : "History unavailable"}</span>
    </div>
    {hasAnalytics && <>
      <p className="analytics-count"><strong>{String(totalSales)}</strong> completed {totalSales === 1n ? "resale" : "resales"}</p>
      <div className="analytics-summary">
        <dl className="analytics-metrics">
          <div><dt>Average original price</dt><dd>{totalSales ? formatTHB(averagePrice(originalVolume, totalSales)) : "—"}</dd></div>
          <div><dt>Original volume</dt><dd>{formatTHB(originalVolume)}</dd></div>
        </dl>
        <dl className="analytics-metrics analytics-metrics-resale">
          <div><dt>Average resale price</dt><dd>{totalSales ? formatTHB(averagePrice(volume, totalSales)) : "—"}</dd></div>
          <div><dt>Resale volume</dt><dd>{formatTHB(volume)}</dd></div>
        </dl>
      </div>
      <p className="analytics-note">Both sets of figures cover the same sales. If a booking resells twice, its original price counts twice.</p>
    </>}
    {rows.length ? <div className="price-chart">
      <h4>Average resale price by stay date</h4>
      {rows.map((row) => <div key={row.label} className="chart-row">
        <span>{row.label}</span><div className="chart-track" aria-hidden="true"><div style={{ width: String(row.average * 100n / max) + "%" }} /></div>
        <span>{formatTHB(row.average)} <small>· {String(row.sales)} sold</small></span>
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
