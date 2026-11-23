import { StrictMode, useEffect, useState, type MouseEvent } from "react";
import { createRoot } from "react-dom/client";
import { CircleAlert, Menu, Wallet, X } from "lucide-react";
import "@fontsource-variable/manrope";
import "@fontsource-variable/inter";
import "./style.css";
import { brand } from "./brand";
import { contractAddress, invalidAddress, shortAddress } from "./chain";
import { Activity, Dashboard, MyBookings, Resale } from "./BookingPages";
import { Marketplace } from "./Marketplace";
import { useMarket } from "./useMarket";

const routes = [
  { path: "/", title: "Explore stays", Page: Marketplace },
  { path: "/resale", title: "Resale", Page: Resale },
  { path: "/bookings", title: "My bookings", Page: MyBookings },
  { path: "/dashboard", title: "Hotel dashboard", Page: Dashboard },
  { path: "/activity", title: "Activity", Page: Activity },
];

function Wordmark() {
  return <a className="wordmark" href="/" aria-label={brand.websiteName + " home"}><img src="/keycard.svg" alt="" />{brand.websiteName}</a>;
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
      window.history.pushState(null, "", anchor.pathname);
      setLocation(anchor.pathname);
      market.setActionError("");
      window.scrollTo(0, 0);
      requestAnimationFrame(() => document.getElementById("content")?.focus({ preventScroll: true }));
    }
    setMenu(false);
  };

  const latest = market.activity[0];
  let message = "Sample inventory is for demonstration. Live bookings require a Sepolia deployment.";
  if (invalidAddress) message = "The configured address is invalid. Sample inventory is shown.";
  else if (contractAddress && !wallet.ready) message = "Use MetaMask on Sepolia to load live inventory. Sample inventory is shown.";
  else if (market.marketError) message = market.marketError + " Sample inventory is shown.";
  else if (contractAddress) message = "Loading live Sepolia inventory. Sample inventory is shown until it is available.";

  return <div onClick={nav} className="site">
    <a className="skip-link" href="#content">Skip to content</a>
    <header className="topbar">
      <div className="shell topbar-inner"><Wordmark />
        <nav className={menu ? "main-nav open" : "main-nav"} aria-label="Main navigation" id="main-nav">
          {routes.map(({ path, title }) => <a href={path} key={path} aria-current={route?.path === path ? "page" : undefined}>{title}</a>)}
        </nav>
        <div className="wallet-header">
          {wallet.address ? <>
            {wallet.ready ? <span className="wallet-address" title={wallet.address}><Wallet size={17} /> {shortAddress(wallet.address)}</span>
              : <button className="button wallet-button" disabled={wallet.busy} onClick={() => void wallet.switchNetwork()}><Wallet size={17} /> Switch to Sepolia</button>}
          </> : <button className="button wallet-button" disabled={wallet.busy} onClick={() => void wallet.connect()}><Wallet size={17} /> Connect wallet</button>}
          <button className="menu-button" aria-controls="main-nav" aria-expanded={menu} aria-label={menu ? "Close navigation" : "Open navigation"}
            onClick={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</button>
        </div>
      </div>
    </header>
    <div className="shell notices">
      <div className="status-strip" role="status"><span className={market.synced ? "badge live" : "badge"}>{market.synced ? "SEPOLIA" : "DEMO MODE"}</span>
        <span>{market.synced ? "Transactions use test ETH on Sepolia." : message}</span></div>
      {(wallet.error || market.actionError) && <div className="notice-error" role="alert"><CircleAlert size={19} />
        <span>{market.actionError || wallet.error}</span></div>}
      {market.busy && <div className="status-strip transaction-strip" role="status">Complete the wallet prompt or follow confirmation in <a href="/activity">Activity</a>.</div>}
      {!market.busy && latest?.status === "confirmed" && Date.now() - latest.time < 120000 &&
        <div className="status-strip transaction-success" role="status">{latest.label} confirmed on Sepolia. <a href="/activity">View activity</a></div>}
    </div>
    <main id="content" tabIndex={-1}><Page market={market} /></main>
    <footer className="footer"><div className="shell footer-inner"><div><Wordmark /><p>{brand.tagline}</p></div>
      <span className="token-badge"><img src="/keycard.svg" alt="" /> {brand.tokenSymbol}</span>
      <span className="footer-test">Sepolia testnet marketplace</span></div></footer>
  </div>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
