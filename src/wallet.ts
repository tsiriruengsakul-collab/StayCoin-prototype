import { useCallback, useEffect, useState } from "react";
import { BrowserProvider, type Eip1193Provider } from "ethers";
import { errorText, sepolia } from "./chain";

type InjectedWallet = Eip1193Provider & {
  isMetaMask?: boolean;
  providers?: InjectedWallet[];
  on?: (event: string, handler: (...args: never[]) => void) => void;
  removeListener?: (event: string, handler: (...args: never[]) => void) => void;
};
type WalletInfo = { address: string | null; chain: string | null };
const disconnected = { address: null, chain: null };

const injected = () => {
  const provider = (window as Window & { ethereum?: InjectedWallet }).ethereum;
  return provider?.providers?.find((item) => item.isMetaMask) ?? (provider?.isMetaMask ? provider : null);
};

export function useWallet() {
  const [wallet, setWallet] = useState<InjectedWallet | null>(injected);
  const [info, setInfo] = useState<WalletInfo>(disconnected);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sync = useCallback(async (active: InjectedWallet, ask = false) => {
    const accounts = await active.request({ method: ask ? "eth_requestAccounts" : "eth_accounts" }) as string[];
    const chain = await active.request({ method: "eth_chainId" }) as string;
    setInfo({ address: accounts[0] ?? null, chain });
  }, []);

  useEffect(() => {
    const detect = () => setWallet(injected());
    window.addEventListener("ethereum#initialized", detect);
    return () => window.removeEventListener("ethereum#initialized", detect);
  }, []);

  useEffect(() => {
    if (!wallet) return;
    const update = () => { void sync(wallet).catch((err) => { setInfo(disconnected); setError(errorText(err)); }); };
    const disconnect = () => setInfo(disconnected);
    update();
    wallet.on?.("accountsChanged", update);
    wallet.on?.("chainChanged", update);
    wallet.on?.("disconnect", disconnect);
    return () => {
      wallet.removeListener?.("accountsChanged", update);
      wallet.removeListener?.("chainChanged", update);
      wallet.removeListener?.("disconnect", disconnect);
    };
  }, [wallet, sync]);

  const connect = async () => {
    const active = wallet ?? injected();
    if (!active) { setError("Install or open MetaMask to connect a wallet."); return; }
    setWallet(active);
    setBusy(true);
    setError("");
    try { await sync(active, true); }
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

  const provider = useCallback(() => {
    if (!wallet) throw new Error("Connect MetaMask first.");
    return new BrowserProvider(wallet, "any");
  }, [wallet]);

  return { ...info, installed: Boolean(wallet), ready: info.chain === sepolia.hex, connect, switchNetwork,
    provider, busy, error };
}
