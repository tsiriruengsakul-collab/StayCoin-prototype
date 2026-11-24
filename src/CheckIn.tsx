import { useState } from "react";
import { contractAddress, parseGuestProof, type Night } from "./marketV3";
import type { Market } from "./useMarket";

export function GuestAuthorization({ market, night }: { market: Market; night: Night }) {
  const [proof, setProof] = useState("");
  const [copied, setCopied] = useState(false);
  return <div className="inline-note">
    <p>Sign a short-lived check-in authorization with your wallet. Share its text with the issuing hotel at check-in.</p>
    <button className="button secondary compact" disabled={!market.canWrite || market.busy} onClick={async () => {
      const result = await market.makeProof(night);
      if (result) { setProof(result); setCopied(false); }
    }}>Sign guest authorization</button>
    {proof && <label className="check-in-field">Guest authorization<textarea readOnly value={proof} rows={4} onFocus={(event) => event.currentTarget.select()} /></label>}
    {proof && <button className="button secondary compact" onClick={async () => {
      try { await navigator.clipboard.writeText(proof); setCopied(true); }
      catch { market.setActionError("Select and copy the authorization text."); }
    }}>{copied ? "Copied" : "Copy authorization"}</button>}
  </div>;
}

export function HotelVerification({ market, night }: { market: Market; night: Night }) {
  const [proof, setProof] = useState("");
  const [identityChecked, setIdentityChecked] = useState(false);
  return <form className="inline-note" onSubmit={(event) => {
    event.preventDefault();
    if (!identityChecked || !contractAddress || !market.synced) return;
    const address = contractAddress;
    const time = market.synced.blockTime;
    void market.run("Redeem night #" + night.id, async (contract) => {
      const data = parseGuestProof(proof, night, address, time);
      const args = [night.id, data.holder, BigInt(data.nonce), BigInt(data.deadline), data.signature] as const;
      await contract.checkIn.staticCall(...args);
      return contract.checkIn(...args);
    });
  }}>
    <label className="check-in-field">Guest authorization<textarea value={proof} onChange={(e) => setProof(e.target.value)} required rows={4}
      placeholder="Paste the signed authorization from My Bookings" /></label>
    <label className="rewards-check"><input type="checkbox" checked={identityChecked} onChange={(event) => setIdentityChecked(event.target.checked)} />
      I checked guest identity off-chain.</label>
    <p>The signature proves control of the current holder wallet. Redemption burns this Night Token.</p>
    <button className="button compact" disabled={!identityChecked || !market.canWrite || market.busy || !proof.trim()}>Verify and redeem</button>
  </form>;
}
