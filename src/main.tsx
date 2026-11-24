import { StrictMode, useEffect, useState, type MouseEvent } from "react";
import { createRoot } from "react-dom/client";
import { Building2, CircleAlert, Menu, Wallet, X } from "lucide-react";
import "@fontsource-variable/manrope";
import "@fontsource-variable/inter";
import "./style.css";
import { brand } from "./brand";
import { sameAddress, shortAddress } from "./chain";
import { configured, formatTHB, gasAmount, prototypeNotice } from "./marketV3";
import { ReceiptCard } from "./Receipt";
import { Activity, Dashboard, MyBookings, Resale } from "./BookingPages";
import { SignIn, signInLink } from "./Account";
import { Passes, Rewards } from "./Extras";
import { Marketplace } from "./Marketplace";
import { useMarket } from "./useMarket";

const routes = [
  { path: "/", title: "Explore stays", Page: Marketplace, customerNav: true },
  { path: "/resale", title: "Resale", Page: Resale, customerNav: true },
  { path: "/happy-pass", title: brand.seasonalPass, Page: Passes, customerNav: true },
  { path: "/bookings", title: "My bookings", Page: MyBookings, customerNav: true },
  { path: "/rewards", title: "StayPoints", Page: Rewards, customerNav: true },
  { path: "/dashboard", title: "Hotel partner portal", Page: Dashboard, customerNav: false },
  { path: "/activity", title: "Activity", Page: Activity, customerNav: false },
  { path: "/sign-in", title: "Sign in", Page: SignIn, customerNav: false },
];

function Wordmark() {
  return <a className="wordmark" href="/" aria-label={brand.websiteName + " home"}><img src="/stay-logo.svg" alt="" />{brand.websiteName}</a>;
}

function App() {
  const market = useMarket();
  const { wallet } = market;
  const [location, setLocation] = useState(window.location.pathname);
  const [menu, setMenu] = useState(false);
  const route = routes.find(({ path }) => location === path || location === path + "/");
  const Page = route?.Page ?? Marketplace;
  useEffect(() => {
    const pop = () => { setLocation(window.location.pathname); setMenu(false); };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    document.title = route && route.path !== "/" ? route.title + " · " + brand.websiteName : brand.websiteName;
  }, [route]);

  const nav = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest<HTMLAnchorElement>("a");
    if (!anchor || anchor.target || anchor.origin !== window.location.origin || !routes.some(({ path }) => anchor.pathname === path)) return;
    event.preventDefault();
    if (location !== anchor.pathname) {
      window.history.pushState(null, "", anchor.pathname + anchor.search);
      setLocation(anchor.pathname);
      market.setActionError("");
      window.scrollTo(0, 0);
      requestAnimationFrame(() => document.getElementById("content")?.focus({ preventScroll: true }));
    }
    setMenu(false);
  };

  const latest = wallet.signedIn ? market.activity.find((item) => item.account.toLowerCase() === wallet.address?.toLowerCase()) : undefined;
  const accountLabel = wallet.isDemo ? "Demo account" : wallet.signedIn && wallet.address
    ? wallet.nickname || shortAddress(wallet.address) : "";
  const portal = route?.path === "/dashboard";
  const live = Boolean(market.synced && !wallet.isDemo);
  let message = "The Sepolia V3 and MockTHB addresses are required for live inventory. Sample inventory is shown.";
  if (wallet.isDemo) message = "Demo account · sample inventory and example balances only.";
  else if (configured && !wallet.ready) message = "Use MetaMask on Sepolia to load live inventory. Sample inventory is shown.";
  else if (market.marketError) message = market.marketError + " Sample inventory is shown.";
  else if (configured) message = "Loading live Sepolia inventory. Sample inventory is shown until it is available.";

  return <div onClick={nav} className="site">
    <a className="skip-link" href="#content">Skip to content</a>
    <header className="topbar">
      <div className="shell topbar-inner"><Wordmark />
        <nav className={menu ? "main-nav open" : "main-nav"} aria-label={portal ? "Partner navigation" : "Main navigation"} id="main-nav">
          {portal ? <><a href="/dashboard" aria-current="page">Partner portal</a><a href="/">Back to marketplace</a></>
            : routes.filter(({ customerNav }) => customerNav).map(({ path, title }) => <a href={path} key={path} aria-current={route?.path === path ? "page" : undefined}>{title}</a>)}
        </nav>
        <div className="wallet-header">
          {accountLabel ? <a className="button wallet-button" href="/sign-in" title={accountLabel}><Wallet size={17} /><span className="wallet-label">{accountLabel}</span></a>
              : <a className="button wallet-button" href={signInLink(portal ? "/dashboard" : route?.path === "/sign-in" ? "/" : route?.path ?? "/")}><Wallet size={17} /> Sign in</a>}
          <button className="menu-button" aria-controls="main-nav" aria-expanded={menu} aria-label={menu ? "Close navigation" : "Open navigation"}
            onClick={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</button>
        </div>
      </div>
    </header>
    <div className="shell notices">
      <div className="status-strip prototype-notice" role="status">
        <span className={live ? "badge live" : "badge"}>{live ? "SEPOLIA" : "DEMO MODE"}</span>
        <span>{prototypeNotice}</span>
      </div>
      {!live && <p className="mode-hint">{message}</p>}
      {live && wallet.signedIn && market.synced && <p className="status-strip">
        <span>MockTHB balance <strong>{formatTHB(market.synced.data.mockBalance)}</strong></span>
        <span>Sepolia gas balance <strong>{gasAmount(market.synced.data.gasBalance)} test ETH</strong></span>
      </p>}
      {wallet.signedIn && !wallet.ready && <div className="status-strip transaction-strip" role="status">
        <span>Switch to Sepolia for live test transactions.</span><button className="button secondary compact" disabled={wallet.busy}
          onClick={() => void wallet.switchNetwork()}>Switch network</button></div>}
      {(wallet.error || market.actionError) && <div className="notice-error" role="alert"><CircleAlert size={19} />
        <span>{market.actionError || wallet.error}</span></div>}
      {market.busy && <div className="status-strip transaction-strip" role="status">Complete the wallet prompt or follow confirmation in <a href="/activity">Activity</a>.</div>}
      {!market.busy && latest?.status === "confirmed" && Date.now() - latest.time < 120000 &&
        <div className="status-strip transaction-success" role="status">{latest.label} confirmed on Sepolia. <a href="/activity">View activity</a></div>}
    </div>
    {wallet.signedIn && live && market.recentReceipt && sameAddress(market.recentReceipt.buyer, wallet.address)
      && route?.path !== "/bookings" && <section className="shell notices" aria-label="Latest booking confirmation"><ReceiptCard market={market} receipt={market.recentReceipt} /></section>}
    <main id="content" tabIndex={-1}><Page market={market} /></main>
    <footer className="footer"><div className="shell footer-inner"><div><Wordmark /><p>{brand.tagline}</p></div>
      <span className="token-badge"><img src="/stay-logo.svg" alt="" /> {brand.tokenSymbol}</span>
      <nav className="footer-links" aria-label="Footer navigation"><a href="/activity">Transaction activity</a>
        <a href="/dashboard"><Building2 size={16} /> Hotel partner portal</a></nav></div></footer>
  </div>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
