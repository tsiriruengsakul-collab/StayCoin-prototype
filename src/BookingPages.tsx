import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Building2, CalendarDays, ExternalLink, Hotel, KeyRound, Repeat2 } from "lucide-react";
import { getAddress } from "ethers";
import { dateKey, DAY, displayDay, futureStayDate, sameAddress, sepolia, shortAddress } from "./chain";
import { canCheckIn, canResell, estimateResale, formatTHB, parseTHB, walletPaymentReceipts, type Night } from "./marketV3";
import { BookingStatus } from "./BookingStatus";
import { GuestAuthorization, HotelVerification } from "./CheckIn";
import { bookingReference, ReceiptCard } from "./Receipt";
import { demoResale, sampleHotels } from "./demo";
import { AccountGate, signInLink } from "./Account";
import { ExpireNight, PartnerOverview } from "./PartnerTools";
import { Empty, PageIntro, WalletGate } from "./Marketplace";
import type { Market } from "./useMarket";

const submit = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  return new FormData(event.currentTarget);
};
const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const minTHB = "0.01";

function BookingHeading({ night }: { night: Night }) {
  return <div className="booking-heading"><span className="tile-icon"><KeyRound size={21} /></span><div>
    <h3>{night.hotelName}</h3>
    <p>{bookingReference(night.id)} · {night.roomCategory} · {displayDay(dateKey(night.stayDate))} · Bangkok</p>
  </div></div>;
}

function ListingForm({ night, market }: { night: Night; market: Market }) {
  const [price, setPrice] = useState("");
  let quote: ReturnType<typeof estimateResale> | undefined;
  try { if (price) quote = estimateResale(parseTHB(price), night.originalPrice, night.lastPaidPrice); } catch { /* Wait for a valid price. */ }
  return <form className="form-row" onSubmit={(event) => {
    event.preventDefault();
    if (quote) void market.run("List night #" + night.id, (contract) => contract.listForResale(night.id, parseTHB(price)));
  }}>
    <label>Asking price in MockTHB<input type="number" min={minTHB} step="0.01" value={price} required
      onChange={(event) => setPrice(event.target.value)} placeholder="3000" /></label>
    <button className="button compact" disabled={!market.canWrite || market.busy || !quote}>
      {night.listingPrice ? "Update listing" : "List for resale"}</button>
    {Boolean(night.listingPrice) && <button type="button" className="button secondary compact" disabled={!market.canWrite || market.busy}
      onClick={() => void market.run("Cancel listing #" + night.id, (contract) => contract.cancelListing(night.id))}>Cancel listing</button>}
    {quote && <p className="inline-note">Estimated proceeds {formatTHB(quote.seller)} · Your net gain/loss {formatTHB(quote.net)}</p>}
  </form>;
}

export function MyBookings({ market }: { market: Market }) {
  const blockTime = market.synced?.blockTime;
  const bookings = market.synced?.data.nights.filter((night) => night.sold && (
      sameAddress(night.holder, market.wallet.address) || sameAddress(night.expiredHolder, market.wallet.address)
      || sameAddress(market.history?.checkedIn.get(night.id) ?? null, market.wallet.address)
    )) ?? [];
  const { wallet } = market;
  const receipts = wallet.signedIn && market.history ? walletPaymentReceipts(market.history.purchases, wallet.address) : [];
  return <section className="shell content-page">
    <PageIntro title="My bookings" description="See stays held by your wallet, check their status, and list eligible bookings for resale." />
    {wallet.isDemo ? <article className="panel"><div className="row-between"><div className="booking-heading">
        <span className="tile-icon"><KeyRound size={22} /></span><div><h3>{sampleHotels[0].name}</h3>
        <p>{sampleHotels[0].city} · {sampleHotels[0].room} · {displayDay(sampleHotels[0].date)}</p></div></div>
        <BookingStatus status="sample" /></div><p className="inline-note">In a wallet account, eligible stays can be listed for resale or presented at check-in.</p></article>
      : !wallet.signedIn ? <AccountGate path="/bookings" detail="Sign in to view your bookings, manage listings, and view payment receipts." />
      : blockTime === undefined ? <WalletGate market={market} />
      : bookings.length === 0 ? <Empty title="No bookings in this wallet" detail="A confirmed booking will appear here after a purchase." />
      : <div className="panel-list">{bookings.map((night) => {
        const eligible = canResell(night, blockTime);
        const status = night.redeemed ? "redeemed" : night.expired ? "expiredBurned" : eligible ? (night.listingPrice ? "listed" : "booked")
          : blockTime < night.stayDate + DAY ? "checkInToday" : "awaitingExpiry";
        return <article className="panel" key={night.id}><div className="booking-card-head">
          <BookingHeading night={night} />
          <div className="booking-card-summary">
            <BookingStatus status={status} />
            <p className="booking-amount"><span>You paid</span><span><strong>{formatTHB(night.lastPaidPrice)}</strong> <small>MockTHB</small></span></p>
            {eligible && night.listingPrice > 0n && <p className="booking-asking">Listed for {formatTHB(night.listingPrice)}</p>}
          </div>
        </div>
          {eligible && <ListingForm night={night} market={market} />}
          {canCheckIn(night, blockTime) && sameAddress(night.holder, wallet.address) && <GuestAuthorization key={night.holder + String(night.nonce)} night={night} market={market} />}
          <ExpireNight night={night} market={market} />
        </article>;
      })}</div>}
    {market.synced && wallet.signedIn && <section className="inventory"><h2>Payment receipts</h2>
      {!market.history ? <p>{market.historyError || "Receipts appear once Sepolia event history loads."}</p>
        : receipts.length === 0 ? <p>No payment receipts yet.</p>
        : <div className="panel-list">{receipts.map(({ purchase, resale }) =>
          <ReceiptCard key={purchase.hash} market={market} receipt={purchase} resale={resale} heading={false} />)}</div>}
    </section>}
  </section>;
}

type ResaleCardProps = {
  hotel: string;
  stay: string;
  reference?: string;
  example?: boolean;
  newListing?: boolean;
  price: bigint;
  originalPrice: bigint;
  fee: bigint;
  payout?: { label: string; amount: bigint };
  action?: ReactNode;
};

function ResaleCard({ hotel, stay, reference, example, newListing, price, originalPrice, fee, payout, action }: ResaleCardProps) {
  return <article className={newListing ? "panel resale-card resale-card-new" : "panel resale-card"}>
    <div className="resale-card-main">
      <div className="booking-heading">
        <span className="tile-icon" aria-hidden="true"><Repeat2 size={22} /></span>
        <div>
          {example && <span className="pill">Example listing</span>}
          {newListing && <span className="pill resale-new-badge">New listing</span>}
          <h3>{hotel}</h3>
          <p>{stay}</p>
          {reference && <p className="resale-reference">{reference}</p>}
        </div>
      </div>
      <div className="resale-offer">
        <div className="resale-price">
          <span>Resale price</span>
          <div><strong>{formatTHB(price)}</strong> <small>{example ? "THB" : "MockTHB"}</small></div>
          <p className="resale-original">Original price {formatTHB(originalPrice)}</p>
        </div>
        {action}
      </div>
    </div>
    <dl className="resale-fees">
      <div><dt>Platform fee included</dt><dd>{formatTHB(fee)}</dd></div>
      {payout && <div><dt>{payout.label}</dt><dd>{formatTHB(payout.amount)}</dd></div>}
    </dl>
  </article>;
}

export function Resale({ market }: { market: Market }) {
  const { wallet } = market;
  const [, refreshClock] = useState(0);
  const blockTime = wallet.isDemo ? undefined : market.synced?.blockTime;
  const listings = market.synced?.data.nights.filter((night) =>
    night.quote && blockTime !== undefined && canResell(night, blockTime)) ?? [];
  const newListings = new Set<number>();
  const now = Date.now();
  let nextExpiration = Infinity;
  for (const night of listings) {
    const listedAt = market.history?.listings.get(night.id)?.timestamp;
    if (listedAt === undefined) continue;
    const expiration = (listedAt + 30 * 60) * 1000;
    if (expiration <= now) continue;
    newListings.add(night.id);
    nextExpiration = Math.min(nextExpiration, expiration);
  }
  useEffect(() => {
    if (!Number.isFinite(nextExpiration)) return;
    const timer = window.setTimeout(() => refreshClock((version) => version + 1), Math.max(0, nextExpiration - Date.now()));
    return () => window.clearTimeout(timer);
  }, [nextExpiration]);
  const demoPrice = BigInt(demoResale.price) * 100n;
  const demoOriginal = BigInt(demoResale.previousPrice) * 100n;
  return <section className="shell content-page resale-page">
    <PageIntro title="Resale marketplace" description="Find a stay listed by another traveler and see the total price before you book." />
    {blockTime === undefined ? <ResaleCard example hotel={demoResale.name}
      stay={demoResale.city + " · " + demoResale.room + " · " + displayDay(demoResale.date)}
      price={demoPrice} originalPrice={demoOriginal} fee={estimateResale(demoPrice, demoOriginal, demoOriginal).platform}
      action={!wallet.signedIn && !wallet.isDemo && <a href={signInLink("/resale")} className="button secondary">Sign in</a>} />
      : listings.length === 0 ? <Empty title="No active resale listings" detail="Listed bookings appear here until they sell or reach the stay date." />
        : <div className="panel-list">{listings.map((night) => {
          const split = night.quote!;
          const isSeller = wallet.signedIn && sameAddress(night.holder, wallet.address);
          const isHotel = wallet.signedIn && sameAddress(night.hotel, wallet.address);
          const payout = isSeller ? { label: "Seller receives", amount: split.seller }
            : isHotel ? { label: "Hotel receives", amount: split.hotel } : undefined;
          const action = !wallet.signedIn ? <a href={signInLink("/resale")} className="button">Sign in to buy</a>
            : isSeller ? <a href="/bookings" className="button secondary">Manage listing</a>
            : isHotel ? <a href="/dashboard" className="button secondary">View hotel inventory</a>
            : <button className="button" disabled={!market.canWrite || market.busy}
              onClick={() => void market.checkout(night, true)}>Buy resale</button>;
          return <ResaleCard key={night.id} hotel={night.hotelName} reference={bookingReference(night.id)} newListing={newListings.has(night.id)}
            stay={night.roomCategory + " · " + displayDay(dateKey(night.stayDate)) + " · Bangkok"}
            price={night.listingPrice} originalPrice={night.originalPrice} fee={split.platform} payout={payout} action={action} />;
        })}</div>}
  </section>;
}

export function Dashboard({ market }: { market: Market }) {
  const data = market.synced?.data;
  const address = market.wallet.address;
  const registered = Boolean(data?.hotel?.verifiedRooms);
  const approved = Boolean(data?.hotel?.approved);
  const isAdmin = sameAddress(data?.owner ?? null, address);
  const isTokenAdmin = sameAddress(data?.currencyOwner ?? null, address);
  const [reference, setReference] = useState("");
  const match = reference.trim().replace(/^#|^SC-V3-/i, "");
  const timestamp = market.synced?.blockTime ?? 0n;
  const signedIn = market.wallet.signedIn;
  const visible = Boolean(signedIn && (registered || isAdmin));
  const inventory = data?.nights.filter((night) => sameAddress(night.hotel, address)) ?? [];
  const results = match ? inventory.filter((night) => String(night.id) === match) : undefined;

  return <section className="shell content-page">
    <div className="portal-hero"><div><span className="badge">HOTEL PARTNERS</span>
      <PageIntro title="Hotel dashboard" description="Manage inventory, verify guest wallets, and review resale performance." /></div>
      <Building2 size={52} strokeWidth={1.4} aria-hidden="true" /></div>
    {!signedIn && !market.wallet.isDemo && <AccountGate path="/dashboard" detail="Sign in with your registered hotel or platform wallet to manage live inventory." />}
    {market.wallet.isDemo && <p className="inline-note portal-demo-note">You’re viewing the sample partner dashboard. Sign in with a registered hotel wallet to make changes on Sepolia.</p>}
    <PartnerOverview inventory={visible ? inventory : []} timestamp={timestamp} history={market.history} historyError={market.historyError} preview={!visible} />
    {signedIn && (!data || !address) ? <WalletGate market={market} /> : signedIn && data && address && <>
      <div className="dashboard-grid">
        {isAdmin && <article className="panel"><h3>Register a hotel</h3><p>The platform owner approves a hotel wallet and its off-chain room count.</p>
          <form className="stack-form" onSubmit={(event) => {
            const form = submit(event);
            void market.run("Register hotel", (contract) => contract.registerHotel(getAddress(field(form, "wallet")), BigInt(field(form, "rooms")), field(form, "hotelName")));
          }}>
            <label>Hotel wallet address<input name="wallet" required placeholder="0x…" /></label>
            <label>Demo hotel label<input name="hotelName" required maxLength={64} placeholder="DemoResort" /></label>
            <label>Total rooms<input name="rooms" type="number" required min={5} step={1} placeholder="60" /></label>
            <button className="button" disabled={!market.canWrite || market.busy}>Register hotel</button>
          </form></article>}
        {approved && <article className="panel"><h3>Mint a night</h3>
          <p>{data.hotel?.name} · {String((data.hotel?.verifiedRooms ?? 0n) / 5n)} tokenizable nights per stay date</p>
          <form className="stack-form" onSubmit={(event) => {
            const form = submit(event);
            void market.run("Mint night token", (contract) => contract.createNight(futureStayDate(field(form, "date"), timestamp),
              parseTHB(field(form, "price")), field(form, "roomCategory")));
          }}>
            <label>Stay date (Bangkok time)<input name="date" type="date" min={dateKey(timestamp + DAY)} required /></label>
            <label>Room category<input name="roomCategory" maxLength={48} required placeholder="Deluxe King" /></label>
            <label>Primary price in MockTHB<input name="price" type="number" min={minTHB} step="0.01" required placeholder="2000" /></label>
            <button className="button" disabled={!market.canWrite || market.busy}>Mint night</button>
          </form></article>}
        {isTokenAdmin && <article className="panel"><h3>Distribute MockTHB</h3><p>MockTHB is for the classroom prototype and has no monetary value.</p>
          <form className="stack-form" onSubmit={(event) => {
            const form = submit(event);
            void market.run("Mint MockTHB", (_contract, token) => token.mint(getAddress(field(form, "wallet")), parseTHB(field(form, "amount"))));
          }}>
            <label>Recipient wallet<input name="wallet" placeholder="0x…" required /></label>
            <label>Amount in MockTHB<input name="amount" type="number" required min={minTHB} step="0.01" placeholder="10000" /></label>
            <button className="button" disabled={!market.canWrite || market.busy}>Send test tokens</button>
          </form></article>}
      </div>
      {registered && !approved && <p className="inline-note">Hotel approval is suspended. Existing bookings can still check in.</p>}
      {!isAdmin && !isTokenAdmin && !registered && <Empty title="This wallet is not registered as a hotel" detail="Ask the platform owner to register the hotel wallet." />}

      {registered && <div className="inventory">
        <h2><Hotel size={24} /> Your inventory</h2>
        <label className="check-in-field">Find booking by reference or token ID<input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="SC-V3-1" /></label>
        {(results ?? inventory).length === 0 ? <Empty title="No matching nights" detail="Check the booking reference or mint a night using the form above." />
          : <div className="panel-list">{(results ?? inventory).map((night) => {
            const eligibleForCheckIn = canCheckIn(night, timestamp);
            const status = night.redeemed ? "redeemed" : night.expired ? "expiredBurned" : timestamp >= night.stayDate + DAY ? "awaitingExpiry"
              : night.sold ? (eligibleForCheckIn ? "checkInOpen" : "booked") : timestamp >= night.stayDate ? "salesClosed" : "available";
            return <article className="panel" key={night.id}><div className="row-between"><BookingHeading night={night} /><BookingStatus status={status} /></div>
              {night.sold && !night.redeemed && !night.expired && <p className="panel-meta">Traveler <code>{night.holder}</code></p>}
              <p className="panel-meta">Original price {formatTHB(night.originalPrice)} MockTHB</p>
              {eligibleForCheckIn && <HotelVerification key={night.holder + String(night.nonce)} market={market} night={night} />}
              <ExpireNight night={night} market={market} />
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
