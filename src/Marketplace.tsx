import { useRef, useState, type FormEvent } from "react";
import { BedDouble, CalendarDays, ChevronDown, MapPin, Search, SlidersHorizontal, Ticket, Waves, Wallet } from "lucide-react";
import { brand } from "./brand";
import { signInLink } from "./Account";
import { dateKey, displayDay, sameAddress, sepolia } from "./chain";
import { canBuyNight, configured, formatTHB, type Night } from "./marketV3";
import { baht, sampleHotels, today } from "./demo";
import type { Market } from "./useMarket";

export function PageIntro({ title, description }: { title: string; description: string }) {
  return <header className="page-intro"><h1>{title}</h1><p>{description}</p></header>;
}

export function Empty({ title, detail }: { title: string; detail: string }) {
  return <div className="empty"><Ticket size={30} aria-hidden="true" /><h3>{title}</h3><p>{detail}</p></div>;
}

type SearchInput = { destination: string; checkIn: string; checkOut: string };
const initial = { destination: "", checkIn: "", checkOut: "" };

export function Marketplace({ market }: { market: Market }) {
  const [input, setInput] = useState(initial);
  const [filters, setFilters] = useState(initial);
  const [sort, setSort] = useState("featured");
  const [searchError, setSearchError] = useState("");
  const results = useRef<HTMLElement>(null);
  const live = Boolean(market.synced && !market.wallet.isDemo);
  const match = (name: string, city: string, day: string) => {
    const query = filters.destination.trim().toLowerCase();
    return (name + " " + city).toLowerCase().includes(query)
      && (!filters.checkIn || day >= filters.checkIn) && (!filters.checkOut || day < filters.checkOut);
  };
  const demo = sampleHotels.filter((item) => match(item.name, item.city, item.date));
  const nights = market.synced?.data.nights.filter((night) => canBuyNight(night, market.synced!.blockTime)
    && match(night.hotelName, night.hotel, dateKey(night.stayDate))) ?? [];
  if (sort === "lowest") {
    demo.sort((a, b) => a.price - b.price);
    nights.sort((a, b) => a.originalPrice < b.originalPrice ? -1 : Number(a.originalPrice > b.originalPrice));
  }
  if (sort === "soonest") {
    demo.sort((a, b) => a.date.localeCompare(b.date));
    nights.sort((a, b) => Number(a.stayDate - b.stayDate));
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (input.checkIn && input.checkOut && input.checkOut <= input.checkIn) {
      setSearchError("Choose a check-out date after check-in.");
      return;
    }
    setSearchError("");
    setFilters(input);
    results.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const count = live ? nights.length : demo.length;
  return <>
    <section className="hero shell">
      <div className="hero-media" aria-hidden="true" />
      <div className="hero-content">
        <span className="hero-kicker"><Waves size={17} /> FLEXIBLE STAYS IN THAILAND</span>
        <h1>Book your stay.<br /><em>Keep your options.</em></h1>
        <p>Find a hotel you love. If your plans change, put your booking up for resale.</p>
      </div>
      <div className="hero-location"><MapPin size={16} /> Thailand hotel marketplace</div>
      <form onSubmit={search} className="search-box" aria-label="Search hotels">
        <label className="search-field"><MapPin size={22} /><span><strong>Destination</strong><input
          value={input.destination} onChange={(event) => setInput({ ...input, destination: event.target.value })}
          placeholder={live ? "Hotel name or wallet" : "City or hotel name"} /></span></label>
        <label className="search-field"><CalendarDays size={21} /><span><strong>Check-in from</strong><input type="date"
          min={today()} value={input.checkIn} onChange={(event) => setInput({ ...input, checkIn: event.target.value })} /></span></label>
        <label className="search-field"><CalendarDays size={21} /><span><strong>Check-out by</strong><input type="date"
          min={input.checkIn || today()} value={input.checkOut}
          onChange={(event) => setInput({ ...input, checkOut: event.target.value })} /></span></label>
        <button className="button search-button" type="submit"><Search size={19} /> Search stays</button>
        {searchError && <p className="search-error" role="alert">{searchError}</p>}
      </form>
    </section>
    <section ref={results} className="shell market-results" aria-label="Hotel search results">
      <div className="section-heading">
        <div><h2>{live ? "Available on Sepolia" : "Find your next stay"}</h2>
          <p>{live ? "On-chain inventory · simulated THB (MockTHB)" : "Sample hotel inventory · illustrated prices in Thai baht"}</p></div>
        <div className="sort"><SlidersHorizontal size={16} /><label><span className="sr-only">Sort by</span>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="featured">Featured</option><option value="lowest">Lowest price</option><option value="soonest">Earliest date</option>
          </select></label><ChevronDown size={15} /></div>
      </div>
      {count === 0 ? <Empty title="No stays found" detail="Try another destination or a wider date range." /> : <div className="hotel-grid">
        {live ? nights.map((night) => <NightCard key={night.id} night={night} market={market} />)
          : demo.map((item) => <DemoCard key={item.id} item={item} />)}
      </div>}
      <div className="flex-tip"><span className="tile-icon"><Ticket size={22} /></span><div><h3>A booking you can pass on</h3>
        <p>Plans changed? List an eligible {brand.tokenSymbol} booking on the resale marketplace and set your own asking price.</p></div>
        <a className="button secondary" href="/resale">Explore resale</a></div>
      <div className="flex-tip"><span className="tile-icon"><CalendarDays size={22} /></span><div><h3>{brand.seasonalPass}</h3>
        <p>Explore sample seasonal passes and partner destinations.</p></div><a className="button secondary" href="/happy-pass">See seasonal stays</a></div>
    </section>
  </>;
}

export function DemoCard({ item }: { item: typeof sampleHotels[number] }) {
  const [show, setShow] = useState(false);
  return <article className="hotel-card">
    <div className="hotel-image"><img src={'/photos/' + item.photo + '.webp'} alt="" loading="lazy" />
      <span>{item.type}</span></div>
    <div className="hotel-body"><p className="eyeline"><MapPin size={15} /> {item.city} · {item.area}</p>
      <h3>{item.name}</h3><p className="card-meta"><BedDouble size={16} /> {item.room} · {item.guests} guests</p>
      <p className="card-meta"><CalendarDays size={16} /> {displayDay(item.date)}</p>
      <div className="card-bottom"><span><strong>{baht(item.price)}</strong><small> / night</small></span>
        <button className="button secondary compact" onClick={() => setShow(!show)} aria-expanded={show}>{show ? "Hide details" : "View stay"}</button></div>
      {show && <p className="inline-note">This example shows how a stay appears. Booking opens for live inventory after a Sepolia contract is configured and connected.</p>}
    </div>
  </article>;
}

export function NightCard({ night, market }: { night: Night; market: Market }) {
  const own = sameAddress(night.hotel, market.wallet.address);
  const buy = () => market.checkout(night, false);
  return <article className="hotel-card"><div className="hotel-image chain-image"><BedDouble size={48} /><span>Night #{night.id}</span></div>
    <div className="hotel-body"><p className="eyeline"><MapPin size={15} /> Sepolia hotel inventory</p>
      <h3>{night.hotelName}</h3><p className="card-meta"><BedDouble size={16} /> {night.roomCategory}</p>
      <p className="card-meta"><CalendarDays size={16} /> {displayDay(dateKey(night.stayDate))} · Bangkok</p>
      <a className="contract-link" href={sepolia.explorer + "/address/" + night.hotel} target="_blank" rel="noreferrer">Hotel wallet on Etherscan</a>
      <div className="card-bottom"><span><strong>{formatTHB(night.originalPrice)} <small>MockTHB</small></strong></span>
        {!market.wallet.signedIn ? <a className="button compact" href={signInLink("/")}>Sign in to book</a>
          : <button className="button compact" disabled={!market.canWrite || market.busy || own} onClick={() => void buy()}>{own ? "Your inventory" : "Book stay"}</button>}</div>
    </div></article>;
}

export function WalletGate({ market }: { market: Market }) {
  const ready = market.wallet.ready;
  return <div className="empty"><Wallet size={29} /><h3>{!configured ? "Demo mode" : ready ? "Sepolia inventory unavailable" : "Switch to Sepolia"}</h3>
    <p>{!configured ? "The V3 Sepolia contract and MockTHB configuration is incomplete."
      : ready ? market.marketError || "Verifying the V3 booking and MockTHB contracts."
      : "Use Sepolia in MetaMask to load your on-chain information."}</p>
    {configured && !ready && market.wallet.signedIn && <button className="button secondary" disabled={market.wallet.busy}
      onClick={() => void market.wallet.switchNetwork()}>Switch to Sepolia</button>}
  </div>;
}
