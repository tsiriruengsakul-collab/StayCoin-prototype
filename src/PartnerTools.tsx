import { useState, type FormEvent } from "react";
import { BarChart3, BedDouble, CalendarCheck, ShieldCheck, Ticket } from "lucide-react";
import { getAddress, parseEther } from "ethers";
import { brand } from "./brand";
import { bookingDate, dateKey, displayDay, DAY, sameAddress, testEth, type Night } from "./chain";
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

export function PartnerOverview({ inventory, timestamp, preview = false }: { inventory: Night[]; timestamp: bigint; preview?: boolean }) {
  const active = inventory.filter((night) => night.stayDate > timestamp && night.lastPaidPrice === 0n);
  const checkIns = inventory.filter((night) => night.stayDate <= timestamp && night.stayDate + DAY > timestamp
    && night.lastPaidPrice > 0n && !night.redeemed && night.claim !== 1n);
  const protectedNights = inventory.filter((night) => night.coverage > 0n).length;
  const stats = [
    { label: "Nights minted", value: preview ? 38 : inventory.length, Icon: BedDouble },
    { label: "Available nights", value: preview ? 16 : active.length, Icon: Ticket },
    { label: "Check-ins today", value: preview ? 5 : checkIns.length, Icon: CalendarCheck },
    { label: "Protected nights", value: preview ? 12 : protectedNights, Icon: ShieldCheck },
  ];

  const groups = new Map<string, { volume: bigint; sales: bigint }>();
  for (const night of inventory) {
    if (night.resaleCount === 0n) continue;
    const day = dateKey(night.stayDate);
    const group = groups.get(day) ?? { volume: 0n, sales: 0n };
    groups.set(day, { volume: group.volume + night.resaleVolume, sales: group.sales + night.resaleCount });
  }
  const realRows = Array.from(groups).sort(([a], [b]) => a.localeCompare(b)).map(([date, group]) =>
    ({ label: displayDay(date), ...group, average: group.volume / group.sales }));
  const demoRows = sample.map(({ label, sales, total }) => ({ label, sales: BigInt(sales), volume: BigInt(total), average: BigInt(Math.round(total / sales)) }));
  const allRows = preview ? demoRows : realRows;
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
      <span className="pill">{preview ? "Sample data · THB" : "Confirmed sales · Sepolia"}</span>
    </div>
    <dl className="pass-facts analytics-totals"><div><dt>Completed resales</dt><dd>{String(totalSales)}</dd></div>
      <div><dt>Average resale price</dt><dd>{totalSales ? money(volume / totalSales) : "—"}</dd></div>
      <div><dt>Resale volume</dt><dd>{money(volume)}</dd></div></dl>
    {rows.length ? <div className="price-chart" aria-label="Average prices for the last seven tracked stay dates">
      {rows.map((row) => <div key={row.label} className="chart-row">
        <span>{row.label}</span><div className="chart-track" aria-hidden="true"><div style={{ width: String(row.average * 100n / max) + "%" }} /></div>
        <span>{money(row.average)} <small>· {String(row.sales)} sold</small></span>
      </div>)}
    </div> : <p className="inline-note">The chart appears after a traveler completes a resale for your property.</p>}
    </article>
  </div>;
}

function form(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  return new FormData(event.currentTarget);
}
const value = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
const minimumEth = "0.000000000000000001";

export function BondPanel({ market }: { market: Market }) {
  const data = market.synced!.data;
  const available = data.bond - data.locked;
  const locked = market.busy || !market.canWrite;
  return <article className="panel">
    <div className="booking-heading"><span className="tile-icon"><ShieldCheck size={20} /></span><h3>Hotel Bond</h3></div>
    <p>Deposit test ETH, then assign coverage to unsold nights from your inventory.</p>
    <dl className="pass-facts"><div><dt>Available</dt><dd>{testEth(available)}</dd></div><div><dt>Locked</dt><dd>{testEth(data.locked)}</dd></div></dl>
    <form className="stack-form" onSubmit={(event) => {
      const fields = form(event);
      void market.run("Deposit hotel bond", (contract) => contract.depositHotelBond({ value: parseEther(value(fields, "amount")) }));
    }}>
      <label>Deposit amount in test ETH<input required name="amount" type="number" min={minimumEth} step="any" placeholder="0.01" /></label>
      <button className="button" disabled={locked}>Deposit bond</button>
      {available > 0n && <button type="button" className="button secondary" disabled={locked}
        onClick={() => void market.run("Release available hotel bond to proceeds", (contract) => contract.withdrawHotelBond(available))}>Move available bond to proceeds</button>}
    </form>
  </article>;
}

export function PassAdmin({ market }: { market: Market }) {
  const [show, setShow] = useState(false);
  const locked = market.busy || !market.canWrite;
  return <article className="panel"><h3>Platform programs</h3><p>Create seasonal passes, assign hotel tiers, and fund StayPoints discounts.</p>
    <button className="button secondary" aria-expanded={show} onClick={() => setShow(!show)}>{show ? "Hide controls" : "Manage programs"}</button>
    {show && <div className="admin-forms">
      <form className="stack-form" onSubmit={(event) => {
        const fields = form(event);
        void market.run("Set hotel tier", (contract) => contract.setHotelTier(getAddress(value(fields, "wallet")), Number(value(fields, "tier"))));
      }}>
        <label>Registered hotel wallet<input name="wallet" required placeholder="0x…" /></label>
        <label>Hotel tier<input required name="tier" type="number" min="2" max="5" step="1" /></label>
        <button className="button secondary" disabled={locked}>Set hotel tier</button>
      </form>
      <form className="stack-form" onSubmit={(event) => {
        const fields = form(event);
        void market.run("Create " + brand.seasonalPass, (contract) => contract.createHappyPass(Number(value(fields, "tier")),
          bookingDate(value(fields, "from")), bookingDate(value(fields, "end")), parseEther(value(fields, "price"))));
      }}>
        <label>Pass tier<input required name="tier" type="number" min="2" max="5" step="1" /></label>
        <label>First eligible stay date<input required name="from" type="date" /></label>
        <label>Season ends (exclusive)<input required name="end" type="date" /></label>
        <label>Price in test ETH<input required name="price" min={minimumEth} step="any" type="number" /></label>
        <button className="button secondary" disabled={locked}>Create {brand.seasonalPass} series</button>
      </form>
      <form className="stack-form" onSubmit={(event) => {
        const fields = form(event);
        void market.run("Fund StayPoints", (contract) => contract.fundRewards({ value: parseEther(value(fields, "reserve")) }));
      }}>
        <p>Rewards reserve: {testEth(market.synced!.data.rewards)}</p>
        <label>Funding in test ETH<input required name="reserve" min={minimumEth} step="any" type="number" /></label>
        <button className="button secondary" disabled={locked}>Fund discounts</button>
      </form>
    </div>}
  </article>;
}

export function ClaimReview({ market }: { market: Market }) {
  const pending = market.synced!.data.nights.filter((night) => night.claim === 1n);
  if (!pending.length) return null;
  return <article className="panel claim-review"><h3>Bond claims to review</h3><p>Verify fulfillment with the hotel and traveler before resolving a claim.</p>
    {pending.map((night) => {
      const reviewEnded = market.synced!.blockTime >= night.stayDate + 7n * DAY;
      return <div className="row-between claim-line" key={night.id}><div><strong>Night #{night.id} · {night.property.name}</strong>
        <p>{reviewEnded ? "Traveler can claim the refund now." : "Hotel and traveler confirmation required."}</p></div>
        <div className="partner-actions">
          <button className="button compact" disabled={!market.canWrite || market.busy} onClick={() => {
            if (window.confirm("Approve the test ETH refund and burn this booking?")) void market.run("Approve claim #" + night.id,
              (contract) => contract.resolveBondClaim(night.id, true));
          }}>Approve refund</button>
          <button className="button secondary compact" disabled={!market.canWrite || market.busy || reviewEnded} onClick={() => {
            if (window.confirm("Deny this claim? The guest will no longer be able to request a refund for this booking.")) void market.run("Deny claim #" + night.id,
              (contract) => contract.resolveBondClaim(night.id, false));
          }}>Deny</button>
        </div>
      </div>;
    })}
  </article>;
}

export function HotelNightActions({ night, market }: { night: Night; market: Market }) {
  const [passId, setPassId] = useState("");
  const { data, blockTime } = market.synced!;
  const available = night.lastPaidPrice === 0n && !night.redeemed && blockTime < night.stayDate;
  const passes = available && night.passId === 0n ? data.passes.filter((pass) =>
    pass.tier === data.tier && blockTime < pass.starts && night.stayDate >= pass.starts &&
    night.stayDate < pass.ends && pass.price <= night.originalPrice * 70n / 100n) : [];
  const committed = data.passes.find((pass) => BigInt(pass.id) === night.passId);
  const canRelease = available && committed && blockTime < committed.starts && committed.committed > committed.issued;
  const locked = !market.canWrite || market.busy;
  return <>
    {night.passId > 0n && <p className="panel-meta">Committed to {brand.seasonalPass} #{String(night.passId)}</p>}
    {night.coverage > 0n && <p className="panel-meta">Coverage locked · {testEth(night.coverage)}</p>}
    {night.claim === 1n && <p className="panel-meta">Bond claim pending. Check-in is paused.</p>}
    <div className="partner-actions">
      {available && night.coverage === 0n && <button className="button secondary compact"
        disabled={locked || data.bond - data.locked < night.originalPrice}
        onClick={() => void market.run("Protect night #" + night.id, (contract) => contract.protectNight(night.id))}>Protect with bond</button>}
      {night.coverage > 0n && night.claim !== 1n && blockTime >= night.stayDate + 2n * DAY &&
        <button className="button secondary compact" disabled={locked} onClick={() => void market.run("Release bond for night #" + night.id,
          (contract) => contract.releaseNightBond(night.id))}>Release bond</button>}
      {canRelease && <button className="button secondary compact" disabled={locked}
        onClick={() => void market.run("Release seasonal night #" + night.id, (contract) => contract.releaseHappyNight(night.id))}>Return to primary inventory</button>}
      {passes.length > 0 && <form className="form-row" onSubmit={(event) => {
        event.preventDefault();
        if (passId) void market.run("Commit night #" + night.id, (contract) => contract.commitHappyNight(BigInt(passId), night.id));
      }}><label>Eligible {brand.seasonalPass} series<select value={passId} onChange={(event) => setPassId(event.target.value)} required>
        <option value="">Choose a series</option>{passes.map((pass) => <option key={pass.id} value={pass.id}>#{pass.id} · {testEth(pass.price)}</option>)}
      </select></label><button className="button secondary compact" disabled={locked || !passId}>Commit night</button></form>}
    </div>
  </>;
}

export function GuestBond({ night, market }: { night: Night; market: Market }) {
  const now = market.synced!.blockTime;
  if (!sameAddress(night.holder, market.wallet.address)) return null;
  const cover = night.coverage < night.lastPaidPrice ? night.coverage : night.lastPaidPrice;
  if (night.claim === 3n) return <p className="inline-note">Refund approved and credited to your available proceeds.</p>;
  if (night.claim === 2n) return <p className="inline-note">Bond claim denied.</p>;
  if (night.claim === 1n) return <div className="inline-note">Your bond claim is under review.
    {now >= night.stayDate + 7n * DAY && <button className="button secondary compact" disabled={!market.canWrite || market.busy}
      onClick={() => void market.run("Collect overdue refund #" + night.id, (contract) => contract.claimTimedOutBond(night.id))}>Collect overdue refund</button>}</div>;
  if (!cover || night.redeemed) return null;
  return <div className="inline-note"><p>Bond cover up to {testEth(cover)} if the hotel cannot honor the booking.</p>
    {now >= night.stayDate && now < night.stayDate + 2n * DAY && <button className="button secondary compact"
      disabled={!market.canWrite || market.busy} onClick={() => {
        if (window.confirm("Report that the hotel could not honor your booking? Check-in will be paused during review.")) {
          void market.run("Request bond refund #" + night.id, (contract) => contract.requestBondRefund(night.id));
        }
      }}>Request bond refund</button>}</div>;
}
