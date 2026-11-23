import { useState } from "react";
import { CalendarDays, Gift, ShieldCheck, Sparkles, Ticket } from "lucide-react";
import { brand } from "./brand";
import { AccountGate, signInLink } from "./Account";
import { dateKey, displayDay, sameAddress, sepolia, testEth, type HappyPass } from "./chain";
import { baht } from "./demo";
import { Empty, PageIntro, WalletGate } from "./Marketplace";
import type { Market } from "./useMarket";

export function Rewards({ market }: { market: Market }) {
  const { wallet, synced } = market;
  const active = wallet.signedIn || wallet.isDemo;
  const points = wallet.isDemo ? 240n : synced?.data.points ?? 0n;
  return <section className="shell content-page">
    <PageIntro title="StayPoints" description="Earn points when the hotel checks you in. Apply them for up to 20% off an eligible new booking." />
    <div className="product-grid">
      <article className="panel product-card"><span className="tile-icon"><Gift size={25} /></span><h3>Earn on completed stays</h3>
        <p>Points go to the guest checked in by the hotel, including guests who bought a stay through resale.</p></article>
      <article className="panel product-card"><span className="tile-icon"><Sparkles size={25} /></span><h3>Use points at checkout</h3>
        <p>StayPoints stay with your wallet. Select the points option on a primary booking if a discount is available.</p></article>
    </div>
    {!active ? <AccountGate path="/rewards" detail="Sign in to view your balance and use points on eligible stays." />
      : !wallet.isDemo && !synced ? <WalletGate market={market} />
      : <article className="panel wallet-summary"><div><span className="pill">{wallet.isDemo ? "Sample rewards" : "Sepolia rewards"}</span>
        <h3>{String(points)} StayPoints</h3>
        <p>{wallet.isDemo ? "Illustrative balance · no points are issued in demo mode."
          : points > 0n && synced?.data.pointsExpiry ? "Expires " + displayDay(dateKey(synced.data.pointsExpiry)) + " unless you earn or use points."
            : "Your balance updates after your hotel checks you in."}</p>
        </div><a className="button secondary" href="/">Find a stay</a></article>}
  </section>;
}

const demoPasses = [
  { tier: 3, cities: "Chiang Mai and Bangkok", price: 1400, base: 2000, photo: "chiang-mai" },
  { tier: 4, cities: "Phuket and Krabi", price: 1750, base: 2500, photo: "krabi" },
  { tier: 5, cities: "Koh Samui and Phuket", price: 2660, base: 3800, photo: "samui" },
];

function LivePass({ pass, market }: { pass: HappyPass; market: Market }) {
  const [nightId, setNightId] = useState("");
  const { synced, wallet } = market;
  const now = synced!.blockTime;
  const nights = synced!.data.nights.filter((night) => night.passId === BigInt(pass.id)
    && night.lastPaidPrice === 0n && night.stayDate > now && !sameAddress(night.hotel, wallet.address));
  const available = pass.committed - pass.issued;
  const selling = now < pass.starts && available > 0n;
  const expired = now >= pass.ends;
  const locked = market.busy || !market.canWrite;
  return <article className="panel pass-card">
    <span className="tile-icon"><Ticket size={24} /></span>
    <div><p className="eyeline">Series #{pass.id} · {String(pass.tier)}-star tier</p><h3>{brand.seasonalPass}</h3>
      <p className="card-meta"><CalendarDays size={16} /> {displayDay(dateKey(pass.starts))} to {displayDay(dateKey(pass.ends))} (end date exclusive)</p></div>
    <dl className="pass-facts"><div><dt>Price per pass</dt><dd>{testEth(pass.price)}</dd></div>
      <div><dt>Presale availability</dt><dd>{selling ? String(available) : "Closed"}</dd></div>
      {wallet.signedIn && <div><dt>Your passes</dt><dd>{String(pass.balance)}</dd></div>}</dl>
    <a className="contract-link" href={sepolia.explorer + "/token/" + pass.token} target="_blank" rel="noreferrer">View token on Etherscan</a>
    {!wallet.signedIn ? <a href={signInLink("/happy-pass")} className="button secondary">Sign in to use passes</a>
      : <>
        {selling && <button className="button" disabled={locked} onClick={() => void market.run("Buy pass #" + pass.id, async (contract) => {
          const fresh = await contract.happyPasses(pass.id);
          return contract.buyHappyPass(pass.id, { value: fresh.price });
        })}>Buy pass</button>}
        {pass.balance > 0n && !expired && <form className="stack-form" onSubmit={(event) => {
          event.preventDefault();
          if (nightId) void market.run("Redeem pass #" + pass.id, (contract) => contract.redeemHappyPass(pass.id, BigInt(nightId)));
        }}><label>Choose a partner night<select value={nightId} onChange={(event) => setNightId(event.target.value)} required>
          <option value="">Select a night</option>{nights.map((night) => <option key={night.id} value={night.id}>
            {night.property.name} · {displayDay(dateKey(night.stayDate))} · {night.roomType}</option>)}
        </select></label>
          {nights.length === 0 && <p>No unbooked dates remain. You can claim a refund for an unused pass once the season ends.</p>}
          <button className="button secondary" disabled={locked || !nights.some((night) => String(night.id) === nightId)}>Redeem pass</button>
        </form>}
        {pass.balance > 0n && expired && <button className="button secondary" disabled={locked}
          onClick={() => void market.run("Refund expired pass #" + pass.id, (contract) => contract.refundExpiredPass(pass.id))}>Claim unused pass refund</button>}
      </>}
  </article>;
}

export function Passes({ market }: { market: Market }) {
  const live = market.synced;
  const demo = !live || market.wallet.isDemo;
  return <section className="shell content-page">
    <div className="season-hero"><div>
      <span className="badge">SEASONAL STAYS</span><h1>{brand.seasonalPass}</h1>
      <p>Buy a discounted room night in advance and choose from available dates at participating hotels in the same tier.</p>
    </div><Ticket size={84} strokeWidth={1.3} aria-hidden="true" /></div>
    <div className="section-heading"><div><h2>{demo ? "Sample seasonal passes" : "Seasonal passes"}</h2>
      <p>{demo ? "Examples in Thai baht · live passes use test ETH on Sepolia" : "Each pass is redeemable for one committed night"}</p></div></div>
    {demo ? <div className="hotel-grid">{demoPasses.map((pass) => <article className="hotel-card" key={pass.tier}>
      <div className="hotel-image"><img src={"/photos/" + pass.photo + ".webp"} alt="" /><span>{pass.tier}-star tier</span></div>
      <div className="hotel-body"><h3>{pass.cities}</h3><p className="card-meta">One night · June to September</p>
        <div className="card-bottom"><span><strong>{baht(pass.price)}</strong> <del>{baht(pass.base)}</del></span><span className="pill">30% off</span></div></div>
      </article>)}</div>
      : live.data.passes.length === 0 ? <Empty title="No seasonal passes yet" detail="Passes appear here after the platform opens a seasonal series." />
      : <div className="product-grid">{live.data.passes.map((pass) => <LivePass pass={pass} market={market} key={pass.id} />)}</div>}
    {demo && !market.wallet.signedIn && !market.wallet.isDemo && <div className="flex-tip">
      <span className="tile-icon"><ShieldCheck size={21} /></span><div><h3>Manage passes with your account</h3><p>Sign in to buy or redeem passes when live inventory is available.</p></div>
      <a className="button secondary" href={signInLink("/happy-pass")}>Sign in</a></div>}
    <p className="inline-note">On Sepolia, unused passes can be burned for a refund after the season ends. Refunds appear under available proceeds in My Bookings.</p>
  </section>;
}
