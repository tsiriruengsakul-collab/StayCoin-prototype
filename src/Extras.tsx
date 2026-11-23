import { Gift, Sparkles, Ticket } from "lucide-react";
import { brand } from "./brand";
import { baht } from "./demo";
import { PageIntro } from "./Marketplace";
import type { Market } from "./useMarket";

export function Rewards({ market }: { market: Market }) {
  return <section className="shell content-page">
    <PageIntro title="StayPoints" description="Preview how points earned from completed stays could apply to eligible bookings." />
    <div className="product-grid">
      <article className="panel product-card"><span className="tile-icon"><Gift size={25} /></span><h3>Earn on completed stays</h3>
        <p>In the rewards prototype, points go to the guest checked in by the hotel.</p></article>
      <article className="panel product-card"><span className="tile-icon"><Sparkles size={25} /></span><h3>Use points at checkout</h3>
        <p>The prototype applies points as a discount on an eligible primary booking.</p></article>
    </div>
    <article className="panel wallet-summary"><div><span className="pill">Demo only</span>
      <h3>{market.wallet.isDemo ? "240 sample StayPoints" : "StayPoints preview"}</h3>
      <p>StayPoints are locally tested in the separate marketplace prototype. The Sepolia Night Token contract has no rewards balance or checkout discount.</p>
    </div><a className="button secondary" href="/">Find a stay</a></article>
  </section>;
}

const demoPasses = [
  { tier: 3, cities: "Chiang Mai and Bangkok", price: 1400, base: 2000, photo: "chiang-mai" },
  { tier: 4, cities: "Phuket and Krabi", price: 1750, base: 2500, photo: "krabi" },
  { tier: 5, cities: "Koh Samui and Phuket", price: 2660, base: 3800, photo: "samui" },
];

export function Passes() {
  return <section className="shell content-page">
    <div className="season-hero"><div>
      <span className="badge">SEASONAL STAYS</span><h1>{brand.seasonalPass}</h1>
      <p>Preview discounted seasonal room nights at participating hotels in the same tier.</p>
    </div><Ticket size={84} strokeWidth={1.3} aria-hidden="true" /></div>
    <div className="section-heading"><div><h2>Sample seasonal passes</h2>
      <p>Demo only · illustrative prices in Thai baht</p></div></div>
    <div className="hotel-grid">{demoPasses.map((pass) => <article className="hotel-card" key={pass.tier}>
      <div className="hotel-image"><img src={"/photos/" + pass.photo + ".webp"} alt="" /><span>{pass.tier}-star tier</span></div>
      <div className="hotel-body"><h3>{pass.cities}</h3><p className="card-meta">One night · June to September</p>
        <div className="card-bottom"><span><strong>{baht(pass.price)}</strong> <del>{baht(pass.base)}</del></span><span className="pill">30% off</span></div></div>
    </article>)}</div>
    <p className="inline-note">Happy Pass is locally tested in the separate marketplace prototype. The Sepolia Night Token contract does not issue or redeem these passes.</p>
  </section>;
}
