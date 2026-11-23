import { useState, type FormEvent } from "react";
import { Building2, CalendarDays, ExternalLink, Hotel, KeyRound, Repeat2 } from "lucide-react";
import { getAddress, parseEther } from "ethers";
import { bookingDate, dateKey, displayDay, resaleSplit, sameAddress, sepolia, shortAddress, testEth, type Night } from "./chain";
import { baht, demoResale, today, sampleHotels } from "./demo";
import { AccountGate, signInLink } from "./Account";
import { BondPanel, ClaimReview, GuestBond, HotelNightActions, PartnerOverview, PassAdmin } from "./PartnerTools";
import { Empty, PageIntro, WalletGate } from "./Marketplace";
import type { Market } from "./useMarket";

const submit = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  return new FormData(event.currentTarget);
};
const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const minWei = "0.000000000000000001";

function BookingHeading({ night }: { night: Night }) {
  return <div className="booking-heading"><span className="tile-icon"><KeyRound size={21} /></span><div>
    <h3>{night.property.name}</h3>
    <p>#{night.id} · {night.roomType} · {night.property.city} · {displayDay(dateKey(night.stayDate))}</p>
  </div></div>;
}

function ListingForm({ night, market }: { night: Night; market: Market }) {
  const [price, setPrice] = useState("");
  let quote: ReturnType<typeof resaleSplit> | undefined;
  try { if (price && parseEther(price) > 0n) quote = resaleSplit(parseEther(price), night.lastPaidPrice); } catch { /* Wait for a valid price. */ }
  return <form className="form-row" onSubmit={(event) => {
    event.preventDefault();
    if (quote) void market.run("List night #" + night.id, (contract) => contract.listForResale(night.id, parseEther(price)));
  }}>
    <label>Asking price in test ETH<input type="number" min={minWei} step="any" value={price} required
      onChange={(event) => setPrice(event.target.value)} placeholder="0.003" /></label>
    <button className="button compact" disabled={!market.canWrite || market.busy || !quote}>
      {night.listingPrice ? "Update listing" : "List for resale"}</button>
    {Boolean(night.listingPrice) && <button type="button" className="button secondary compact" disabled={!market.canWrite || market.busy}
      onClick={() => void market.run("Cancel listing #" + night.id, (contract) => contract.cancelListing(night.id))}>Cancel listing</button>}
    {quote && <p className="inline-note">Seller {testEth(quote.seller)} · Hotel {testEth(quote.hotel)} · Platform {testEth(quote.platform)}</p>}
  </form>;
}

export function MyBookings({ market }: { market: Market }) {
  const blockTime = market.synced?.blockTime;
  const bookings = market.synced?.data.nights.filter((night) => night.lastPaidPrice > 0n
    && sameAddress(night.holder, market.wallet.address)) ?? [];
  const { wallet } = market;
  return <section className="shell content-page">
    <PageIntro title="My bookings" description="See stays held by your wallet, check their status, and list eligible bookings for resale." />
    {wallet.isDemo ? <article className="panel"><div className="row-between"><div className="booking-heading">
        <span className="tile-icon"><KeyRound size={22} /></span><div><h3>{sampleHotels[0].name}</h3>
        <p>{sampleHotels[0].city} · {sampleHotels[0].room} · {displayDay(sampleHotels[0].date)}</p></div></div>
        <span className="pill">Sample booking</span></div><p className="inline-note">In a wallet account, eligible stays can be listed for resale or presented at check-in.</p></article>
      : !wallet.signedIn ? <AccountGate path="/bookings" detail="Sign in to view your bookings, manage listings, and see bond claims." />
      : blockTime === undefined ? <WalletGate market={market} />
      : bookings.length === 0 ? <Empty title="No bookings in this wallet" detail="A confirmed booking will appear here after a purchase." />
      : <div className="panel-list">{bookings.map((night) => {
        const eligible = !night.redeemed && night.stayDate > blockTime;
        const status = night.claim === 3n ? "Refunded" : night.claim === 1n ? "Claim pending" : night.redeemed ? "Redeemed" : eligible ? (night.listingPrice ? "Listed" : "Booked")
          : blockTime < night.stayDate + 86400n ? "Check-in today" : "Expired";
        return <article className="panel" key={night.id}><div className="row-between">
          <BookingHeading night={night} /><span className="pill">{status}</span></div>
          <p className="panel-meta">Paid {testEth(night.lastPaidPrice)}{eligible && night.listingPrice > 0n && " · Asking " + testEth(night.listingPrice)}</p>
          {eligible && <ListingForm night={night} market={market} />}
          <GuestBond night={night} market={market} />
        </article>;
      })}</div>}
    {market.synced && wallet.signedIn && <Proceeds market={market} />}
  </section>;
}

export function Resale({ market }: { market: Market }) {
  const blockTime = market.wallet.isDemo ? undefined : market.synced?.blockTime;
  const listings = market.synced?.data.nights.filter((night) =>
    night.listingPrice > 0n && !night.redeemed && blockTime !== undefined && night.stayDate > blockTime) ?? [];
  const demo = resaleSplit(BigInt(demoResale.price), BigInt(demoResale.previousPrice));
  return <section className="shell content-page">
    <PageIntro title="Resale marketplace" description="Take over an eligible booking from another traveler. See the price and payout split before you buy." />
    {blockTime === undefined ? <article className="panel">
      <div className="row-between"><div className="booking-heading"><span className="tile-icon"><Repeat2 size={22} /></span><div>
        <h3>{demoResale.name}</h3><p>{demoResale.city} · {demoResale.room} · {displayDay(demoResale.date)}</p>
      </div></div><span className="pill">Example listing</span></div>
      <div className="split-grid">
        <div><span>Buyer pays</span><strong>{baht(demoResale.price)}</strong></div>
        <div><span>Seller receives</span><strong>{baht(Number(demo.seller))}</strong></div>
        <div><span>Hotel receives</span><strong>{baht(Number(demo.hotel))}</strong></div>
        <div><span>Platform fee</span><strong>{baht(Number(demo.platform))}</strong></div>
      </div><p className="inline-note">Example quoted in Thai baht. Sepolia listings settle in test ETH.</p>
      {!market.wallet.signedIn && !market.wallet.isDemo && <a href={signInLink("/resale")} className="button secondary">Sign in to buy or resell</a>}
    </article> : listings.length === 0 ? <Empty title="No active resale listings" detail="Listed bookings appear here until they sell or reach the stay date." />
      : <div className="panel-list">{listings.map((night) => {
        const split = resaleSplit(night.listingPrice, night.lastPaidPrice);
        const own = sameAddress(night.holder, market.wallet.address);
        return <article className="panel" key={night.id}><div className="row-between"><BookingHeading night={night} /><span className="pill">Active listing</span></div>
          <div className="split-grid">
            <div><span>Buyer pays</span><strong>{testEth(night.listingPrice)}</strong></div>
            <div><span>Seller receives</span><strong>{testEth(split.seller)}</strong></div>
            <div><span>Hotel receives</span><strong>{testEth(split.hotel)}</strong></div>
            <div><span>Platform fee</span><strong>{testEth(split.platform)}</strong></div>
          </div>
          {night.coverage > 0n && <p className="inline-note">Hotel Bond cover up to {testEth(night.coverage < night.listingPrice ? night.coverage : night.listingPrice)}.</p>}
          {!market.wallet.signedIn ? <a href={signInLink("/resale")} className="button">Sign in to buy</a>
            : <button className="button" disabled={!market.canWrite || market.busy || own} onClick={() => void market.run("Buy resale #" + night.id, async (contract) => {
            const fresh = await contract.nights(night.id);
            if (fresh.listingPrice !== night.listingPrice || !sameAddress(fresh.holder, night.holder)) {
              throw new Error("This listing changed. Review the updated price before buying.");
            }
            return contract.buyResale(night.id, fresh.holder, { value: fresh.listingPrice });
          })}>{own ? "Your listing" : "Buy resale"}</button>}
        </article>;
      })}</div>}
  </section>;
}

function Proceeds({ market }: { market: Market }) {
  const amount = market.synced?.data.proceeds ?? 0n;
  const address = market.wallet.address;
  return <article className="panel proceeds"><div><h3>Available proceeds</h3><p>{testEth(amount)}</p></div>
    <button className="button secondary" disabled={!amount || !market.canWrite || market.busy}
      onClick={() => address && void market.run("Withdraw proceeds", (contract) => contract.withdrawProceeds(address))}>Withdraw to wallet</button>
  </article>;
}

export function Dashboard({ market }: { market: Market }) {
  const data = market.synced?.data;
  const address = market.wallet.address;
  const registered = Boolean(data?.hotel?.rooms);
  const isAdmin = sameAddress(data?.owner ?? null, address);
  const timestamp = market.synced?.blockTime ?? 0n;
  const signedIn = market.wallet.signedIn;
  const visible = Boolean(signedIn && (registered || isAdmin));
  const inventory = data?.nights.filter((night) => sameAddress(night.hotel, address)) ?? [];
  const checkIn = (night: Night) => market.run("Check in night #" + night.id, (contract) => contract.checkIn(night.id, night.holder));

  return <section className="shell content-page">
    <div className="portal-hero"><div><span className="badge">HOTEL PARTNERS</span>
      <PageIntro title="Hotel dashboard" description="Manage inventory, check-ins, bond protection, and resale performance." /></div>
      <Building2 size={52} strokeWidth={1.4} aria-hidden="true" /></div>
    {!signedIn && !market.wallet.isDemo && <AccountGate path="/dashboard" detail="Sign in with your registered hotel or platform wallet to manage live inventory." />}
    {market.wallet.isDemo && <p className="inline-note portal-demo-note">You’re viewing the sample partner dashboard. Sign in with a registered hotel wallet to make changes on Sepolia.</p>}
    <PartnerOverview inventory={visible ? inventory : []} timestamp={timestamp} preview={!visible} />
    {signedIn && (!data || !address) ? <WalletGate market={market} /> : signedIn && data && address && <>
      <div className="dashboard-grid">
        {isAdmin && <article className="panel"><h3>Register a hotel</h3><p>Platform owner controls enrollment and the fixed room count.</p>
          <form className="stack-form" onSubmit={(event) => {
            const form = submit(event);
            void market.run("Register hotel", (contract) => contract.registerHotel(getAddress(field(form, "wallet")),
              field(form, "hotel"), field(form, "city"), Number(field(form, "rooms"))));
          }}>
            <label>Hotel wallet address<input name="wallet" required placeholder="0x…" /></label>
            <label>Hotel name<input name="hotel" required maxLength={80} placeholder="Demo Beach Hotel" /></label>
            <label>City<input name="city" required maxLength={48} placeholder="Phuket" /></label>
            <label>Total rooms<input name="rooms" type="number" required min={5} max={4294967295} step={1} placeholder="60" /></label>
            <button className="button" disabled={!market.canWrite || market.busy}>Register hotel</button>
          </form></article>}
        {registered && <article className="panel"><h3>Mint a night</h3>
          <p>{data.hotel?.name} · {String((data.hotel?.rooms ?? 0n) / 5n)} tokenizable nights per stay date</p>
          <form className="stack-form" onSubmit={(event) => {
            const form = submit(event);
            void market.run("Mint night token", (contract) => contract.createNight(bookingDate(field(form, "date")),
              field(form, "room"), parseEther(field(form, "price"))));
          }}>
            <label>Stay date (Bangkok time)<input name="date" type="date" min={today()} required /></label>
            <label>Room type<input name="room" required maxLength={64} placeholder="Ocean-view king" /></label>
            <label>Primary price in test ETH<input name="price" type="number" min={minWei} step="any" required placeholder="0.002" /></label>
            <button className="button" disabled={!market.canWrite || market.busy}>Mint night</button>
          </form></article>}
        {registered && <BondPanel market={market} />}
        {isAdmin && <PassAdmin market={market} />}
      </div>
      {isAdmin && <ClaimReview market={market} />}
      {!isAdmin && !registered && <Empty title="This wallet is not registered as a hotel" detail="Ask the platform owner to register the hotel wallet." />}
      {(isAdmin || registered) && <Proceeds market={market} />}
      {registered && <div className="inventory">
        <h2><Hotel size={24} /> Your inventory</h2>
        {inventory.length === 0 ? <Empty title="No nights minted" detail="Mint the first night using the form above." />
          : <div className="panel-list">{inventory.map((night) => {
            const isCheckInDay = timestamp >= night.stayDate && timestamp < night.stayDate + 86400n;
            const canCheckIn = !night.redeemed && night.claim !== 1n && night.lastPaidPrice > 0n && isCheckInDay;
            const label = night.claim === 3n ? "Refunded" : night.claim === 1n ? "Claim pending" : night.redeemed ? "Redeemed" : timestamp >= night.stayDate + 86400n ? "Expired"
              : night.lastPaidPrice > 0n ? (isCheckInDay ? "Check-in open" : "Booked") : timestamp >= night.stayDate ? "Sales closed" : night.passId ? "Seasonal inventory" : "Available";
            return <article className="panel" key={night.id}><div className="row-between"><BookingHeading night={night} /><span className="pill">{label}</span></div>
              {night.lastPaidPrice > 0n && <p className="panel-meta">Traveler <code>{night.holder}</code></p>}
              {canCheckIn && <button className="button compact" disabled={!market.canWrite || market.busy}
                onClick={() => { if (window.confirm("Confirm you have verified the traveler at the property. This burns their booking.")) void checkIn(night); }}>Redeem at check-in</button>}
              <HotelNightActions night={night} market={market} />
            </article>;
          })}</div>}
      </div>}
    </>}
  </section>;
}

export function Activity({ market }: { market: Market }) {
  const activity = market.wallet.signedIn ? market.activity.filter((item) => sameAddress(item.account, market.wallet.address)) : [];
  return <section className="shell content-page">
    <PageIntro title="Transaction activity" description="Track submitted transactions from this browser and open their records in the Sepolia explorer." />
    {!market.wallet.signedIn && !market.wallet.isDemo ? <AccountGate path="/activity" detail="Sign in to see transactions submitted by your account in this browser." />
      : activity.length === 0 ? <Empty title="No transactions submitted" detail="When MetaMask submits an on-chain action, the real transaction hash will appear here." />
      : <div className="panel-list">{activity.map((item) => <article className="panel" key={item.hash}>
        <div className="row-between"><div><h3>{item.label}</h3><p className="card-meta"><CalendarDays size={15} /> {new Date(item.time).toLocaleString()} · {shortAddress(item.account)}</p></div>
          <span className={"pill state-" + item.status}>{item.status}</span></div>
        <a className="hash-link" href={sepolia.explorer + "/tx/" + item.hash} target="_blank" rel="noreferrer">
          <span>{item.hash}</span><ExternalLink size={16} /></a>
      </article>)}</div>}
  </section>;
}
