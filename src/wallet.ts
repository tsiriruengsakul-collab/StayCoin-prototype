import { useCallback, useEffect, useState } from "react";
import { BrowserProvider, verifyMessage, type Eip1193Provider } from "ethers";
import { brand } from "./brand";
import { errorText, sameAddress, sepolia } from "./chain";

type InjectedWallet = Eip1193Provider & {
  isMetaMask?: boolean;
  providers?: InjectedWallet[];
  on?: (event: string, handler: (...args: never[]) => void) => void;
  removeListener?: (event: string, handler: (...args: never[]) => void) => void;
};
type WalletInfo = { address: string | null; chain: string | null };
const sessionKey = "staypass-session-v2";
const sessionLifetime = 8 * 60 * 60 * 1000;
type Session = { mode: "demo" | "wallet"; address?: string; expires: number };
function storedSession(): Session | null {
  try { return JSON.parse(sessionStorage.getItem(sessionKey) || "null"); }
  catch { return null; }
}
const disconnected = { address: null, chain: null };

const injected = () => {
  const provider = (window as Window & { ethereum?: InjectedWallet }).ethereum;
  return provider?.providers?.find((item) => item.isMetaMask) ?? (provider?.isMetaMask ? provider : null);
};

export function useWallet() {
  const [announcedWallet, setAnnouncedWallet] = useState<InjectedWallet | null>(null);
  const [legacyWallet, setLegacyWallet] = useState<InjectedWallet | null>(injected);
  const wallet = announcedWallet ?? legacyWallet;
  const [info, setInfo] = useState<WalletInfo>(disconnected);
  const [session, setSession] = useState(storedSession);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sync = useCallback(async (active: InjectedWallet, ask = false) => {
    const accounts = await active.request({ method: ask ? "eth_requestAccounts" : "eth_accounts" }) as string[];
    const chain = await active.request({ method: "eth_chainId" }) as string;
    const address = accounts[0] ?? null;
    setInfo({ address, chain });
    return address;
  }, []);

  useEffect(() => {
    const detect = () => setLegacyWallet(injected());
    const announce = (event: Event) => {
      const candidate = (event as CustomEvent<{ info?: { rdns?: string }; provider?: InjectedWallet }>).detail;
      if (candidate?.info?.rdns === "io.metamask" && candidate.provider) setAnnouncedWallet(candidate.provider);
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    window.addEventListener("ethereum#initialized", detect);
    return () => {
      window.removeEventListener("eip6963:announceProvider", announce);
      window.removeEventListener("ethereum#initialized", detect);
    };
  }, []);

  useEffect(() => {
    if (!wallet) return;
    let active = true;
    let revision = 0;
    const update = () => {
      const request = ++revision;
      setInfo(disconnected);
      void Promise.all([
        wallet.request({ method: "eth_accounts" }) as Promise<string[]>,
        wallet.request({ method: "eth_chainId" }) as Promise<string>,
      ]).then(([accounts, chain]) => {
        if (active && request === revision) setInfo({ address: accounts[0] ?? null, chain });
      }).catch((err) => {
        if (active && request === revision) setError(errorText(err));
      });
    };
    const disconnect = () => { revision++; setInfo(disconnected); setSession(null); };
    update();
    wallet.on?.("accountsChanged", update);
    wallet.on?.("chainChanged", update);
    wallet.on?.("disconnect", disconnect);
    return () => {
      active = false;
      wallet.removeListener?.("accountsChanged", update);
      wallet.removeListener?.("chainChanged", update);
      wallet.removeListener?.("disconnect", disconnect);
    };
  }, [wallet]);

  useEffect(() => {
    try {
      if (session) sessionStorage.setItem(sessionKey, JSON.stringify(session));
      else sessionStorage.removeItem(sessionKey);
    } catch { /* Session stays in memory. */ }
    if (!session) return;
    const timer = window.setTimeout(() => setSession(null), Math.max(0, session.expires - Date.now()));
    return () => window.clearTimeout(timer);
  }, [session]);

  const signIn = async () => {
    const active = wallet ?? injected();
    if (!active) { setError("Install or open MetaMask to connect a wallet."); return; }
    if (!wallet) setLegacyWallet(active);
    setBusy(true);
    setError("");
    try {
      const address = await sync(active, true);
      if (!address) throw new Error("Choose an account in MetaMask.");
      const message = brand.websiteName + " sign-in\nWebsite: " + window.location.origin + "\nWallet: " + address
        + "\nCode: " + crypto.randomUUID() + "\nThis message does not send a transaction.";
      const signer = await new BrowserProvider(active, "any").getSigner(address);
      const signature = await signer.signMessage(message);
      if (!sameAddress(verifyMessage(message, signature), address) || !sameAddress(await sync(active), address)) {
        throw new Error("Your wallet changed. Sign in again.");
      }
      setSession({ mode: "wallet", address, expires: Date.now() + sessionLifetime });
    }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  };

  const switchNetwork = async () => {
    if (!wallet) return;
    setBusy(true);
    setError("");
    try {
      try {
        await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: sepolia.hex }] });
      } catch (err) {
        if ((err as { code?: number }).code !== 4902) throw err;
        await wallet.request({ method: "wallet_addEthereumChain", params: [{
          chainId: sepolia.hex, chainName: "Sepolia", rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
          nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
          blockExplorerUrls: [sepolia.explorer],
        }] });
      }
      await sync(wallet);
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  };

  const provider = useCallback((fixedSepolia = false) => {
    if (!wallet) throw new Error("Connect MetaMask first.");
    return new BrowserProvider(wallet, fixedSepolia ? sepolia.id : "any");
  }, [wallet]);

  const valid = Boolean(session && session.expires > Date.now());
  const signedIn = valid && session?.mode === "wallet" && sameAddress(info.address, session.address ?? null);
  const isDemo = valid && session?.mode === "demo";
  const demoSignIn = () => {
    setError("");
    setSession({ mode: "demo", expires: Date.now() + sessionLifetime });
  };
  const signOut = () => { setSession(null); setError(""); };
  return { ...info, signedIn, isDemo, ready: info.chain === sepolia.hex, signIn, demoSignIn, signOut,
    switchNetwork, provider, busy, error };
}
