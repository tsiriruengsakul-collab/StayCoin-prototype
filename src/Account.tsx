import { useEffect } from "react";
import { LockKeyhole, Wallet } from "lucide-react";
import { brand } from "./brand";
import { PageIntro } from "./Marketplace";
import type { Market } from "./useMarket";

const destinations = new Set(["/", "/bookings", "/resale", "/rewards", "/happy-pass", "/activity", "/dashboard"]);
export const signInLink = (path: string) => "/sign-in?return=" + encodeURIComponent(path);

export function AccountGate({ path, detail }: { path: string; detail: string }) {
  return <div className="empty account-gate"><LockKeyhole size={26} aria-hidden="true" />
    <h3>Sign in to continue</h3><p>{detail}</p>
    <a className="button" href={signInLink(path)}>Sign in</a></div>;
}

export function SignIn({ market }: { market: Market }) {
  const { wallet } = market;
  const requested = new URLSearchParams(window.location.search).get("return") || "/";
  const destination = destinations.has(requested) ? requested : "/";
  useEffect(() => {
    if (wallet.signedIn || wallet.isDemo) document.getElementById("continue-account")?.focus();
  }, [wallet.signedIn, wallet.isDemo]);
  return <section className="shell content-page sign-in-page">
    <PageIntro title={"Sign in to " + brand.websiteName} description="Browse without an account. Sign in to view your bookings, use rewards, or manage hotel inventory." />
    {wallet.signedIn || wallet.isDemo ? <article className="panel signin-option">
      <span className="tile-icon"><LockKeyhole size={23} /></span><div><h3>{wallet.isDemo ? "Demo account active" : "Wallet signed in"}</h3>
        <p>{wallet.isDemo ? "Explore sample data in this browser." : "Your wallet is connected to this browser session."}</p></div>
      <a id="continue-account" className="button" href={destination}>Continue</a>
      <button className="button secondary" onClick={wallet.signOut}>Sign out</button>
    </article> : <div className="signin-options">
      <article className="panel signin-option"><span className="tile-icon"><Wallet size={23} /></span><div><h3>Sign in with MetaMask</h3>
        <p>Approve a free message to open your wallet session. Transactions are approved separately.</p></div>
        <button className="button" disabled={wallet.busy} onClick={() => void wallet.signIn()}>Sign in with wallet</button></article>
      <article className="panel signin-option"><span className="tile-icon"><LockKeyhole size={23} /></span><div><h3>Try a demo account</h3>
        <p>Explore examples without installing MetaMask or entering a password.</p></div>
        <button className="button secondary" onClick={wallet.demoSignIn}>Continue in demo mode</button></article>
    </div>}
  </section>;
}
