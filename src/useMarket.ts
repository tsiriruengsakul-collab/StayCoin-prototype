import { useEffect, useRef, useState } from "react";
import { type Contract, type Signer, type TransactionReceipt, type TransactionResponse } from "ethers";
import { errorText, sepolia } from "./chain";
import { configured, contractAddress, currency, deploymentBlock, marketplace, mockTHBAddress, purchase,
  readBookingHistory, readMarket, requireWalletContext, signGuestProof, verifyV3, type BookingHistory, type Night, type PaymentReceipt } from "./marketV3";
import { useWallet } from "./wallet";

type Status = "pending" | "confirmed" | "failed" | "unverified";
type Activity = { hash: string; label: string; status: Status; time: number; account: string };
const storageKey = "staycoin-night-v3-sepolia:" + (contractAddress ?? "demo");
type MarketData = Awaited<ReturnType<typeof readMarket>>;

function previousActivity(): Activity[] {
  try {
    const records = JSON.parse(localStorage.getItem(storageKey) || "[]") as Activity[];
    return records.filter((record) => /^0x[0-9a-f]{64}$/i.test(record.hash));
  } catch {
    return [];
  }
}

export function useMarket() {
  const wallet = useWallet();
  const context = wallet.ready && configured ? (wallet.address ?? "read-only") : null;
  const [snapshot, setSnapshot] = useState<{ context: string; data: MarketData; blockTime: bigint; blockNumber: number }>();
  const [recentReceipt, setRecentReceipt] = useState<PaymentReceipt>();
  const [history, setHistory] = useState<BookingHistory>();
  const [historyError, setHistoryError] = useState("");
  const [marketError, setMarketError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [activity, setActivity] = useState(previousActivity);
  const actionLock = useRef(false);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(activity)); } catch { /* Optional browser storage. */ }
  }, [activity]);

  useEffect(() => {
    setMarketError("");
    if (!context) return;
    const provider = wallet.provider();
    let active = true;
    let timer: number | undefined;
    let verified: Awaited<ReturnType<typeof verifyV3>> | undefined;
    async function poll() {
      try {
        const chain = await provider.getNetwork();
        if (chain.chainId !== BigInt(sepolia.id)) throw new Error("Switch to Sepolia.");
        const block = await provider.getBlock("latest");
        if (!block || !contractAddress || !mockTHBAddress) throw new Error("Sepolia V3 data is temporarily unavailable.");
        verified ??= await verifyV3(provider, contractAddress, mockTHBAddress, block.number);
        const data = await readMarket(verified.market, verified.token, wallet.address, block.number, BigInt(block.timestamp));
        if (active && context) {
          setSnapshot({ context, data, blockTime: BigInt(block.timestamp), blockNumber: block.number });
          setMarketError("");
        }
      } catch (err) {
        if (active) {
          verified = undefined;
          setSnapshot(undefined);
          setMarketError(errorText(err, true));
        }
      } finally {
        if (active) timer = window.setTimeout(poll, 15000);
      }
    }
    void poll();
    return () => { active = false; window.clearTimeout(timer); };
  }, [context, revision, wallet.address, wallet.provider]);

  useEffect(() => {
    if (!wallet.ready) return;
    const unresolved = activity.filter((item) => item.status === "pending" || item.status === "unverified");
    if (unresolved.length === 0) return;
    const provider = wallet.provider();
    let active = true;
    async function reconcile() {
      if ((await provider.getNetwork()).chainId !== BigInt(sepolia.id)) return;
      const results = await Promise.allSettled(unresolved.map(async ({ hash }) =>
        ({ hash, receipt: await provider.getTransactionReceipt(hash) })));
      if (!active) return;
      const settled = results.flatMap((result) =>
        result.status === "fulfilled" && result.value.receipt ? [result.value] : []);
      if (settled.length) {
        setActivity((items) => items.map((item) => {
          const result = settled.find(({ hash }) => hash === item.hash);
          if (!result?.receipt || (item.status !== "pending" && item.status !== "unverified")) return item;
          return { ...item, status: result.receipt.status === 1 ? "confirmed" : "failed" };
        }));
        setRevision((value) => value + 1);
      }
    }
    const check = () => { void reconcile().catch(() => { /* Retry while Sepolia is available. */ }); };
    const timer = window.setInterval(check, 12000);
    return () => { active = false; window.clearInterval(timer); };
  }, [activity, wallet.ready, wallet.provider]);

  const synced = snapshot?.context === context ? snapshot : undefined;
  const blockNumber = synced?.blockNumber;
  const historyCache = useRef<BookingHistory | undefined>(undefined);
  useEffect(() => {
    if (blockNumber === undefined || !configured) return;
    let active = true;
    const contract = marketplace(wallet.provider(true));
    void readBookingHistory(contract, deploymentBlock, blockNumber, historyCache.current).then((result) => {
      if (!active) return;
      historyCache.current = result;
      setHistory(result);
      setHistoryError("");
    }).catch(() => {
      if (active) setHistoryError("Could not load Sepolia event history. Check the deployment block and RPC access.");
    });
    return () => { active = false; };
  }, [blockNumber, wallet.provider]);

  const canWrite = Boolean(synced && wallet.address && wallet.signedIn && !marketError);
  type ActionContext = {
    market: Contract; token: Contract; account: string; signer: Signer;
    ensureWallet: () => Promise<void>;
    confirm: (label: string, transaction: TransactionResponse) => Promise<TransactionReceipt>;
  };
  const operation = async <T,>(execute: (ctx: ActionContext) => Promise<T>) => {
    if (!canWrite || !wallet.address || actionLock.current) return undefined;
    const account = wallet.address;
    actionLock.current = true;
    setBusy(true);
    setActionError("");
    let submitted = false;
    try {
      const provider = wallet.provider(true);
      const ensureWallet = () => requireWalletContext(provider, account);
      await ensureWallet();
      const signer = await provider.getSigner(account);
      const confirm: ActionContext["confirm"] = async (label, transaction) => {
        submitted = true;
        const hash = transaction.hash;
        setActivity((items) => [{ hash, label, status: "pending" as const, time: Date.now(), account }, ...items].slice(0, 100));
        const update = (patch: Partial<Activity>) =>
          setActivity((items) => items.map((item) => item.hash === hash ? { ...item, ...patch } : item));
        try {
          const receipt = await transaction.wait(1, 90000);
          if (!receipt || receipt.status !== 1) throw new Error("The Sepolia receipt could not be confirmed.");
          update({ status: "confirmed" });
          return receipt;
        } catch (err) {
          const replacement = err as { code?: string; cancelled?: boolean; receipt?: TransactionReceipt };
          if (replacement.code === "TRANSACTION_REPLACED" && replacement.receipt) {
            if (!replacement.cancelled && replacement.receipt.status === 1) {
              update({ status: "confirmed", hash: replacement.receipt.hash });
              return replacement.receipt;
            }
            update({ status: "failed", hash: replacement.receipt.hash, label: label + " (cancelled or replaced)" });
            throw new Error("The wallet cancelled or replaced this transaction.");
          }
          update({ status: replacement.receipt?.status === 0 ? "failed" : "unverified" });
          throw new Error(replacement.receipt?.status === 0 ? "The transaction reverted on Sepolia."
            : "Confirmation is unavailable. Check the hash in Transaction Activity before retrying.");
        }
      };
      return await execute({ market: marketplace(signer), token: currency(signer), account, signer, ensureWallet, confirm });
    } catch (err) {
      setActionError(errorText(err, true));
      return undefined;
    } finally {
      actionLock.current = false;
      setBusy(false);
      if (submitted) setRevision((value) => value + 1);
    }
  };

  const run = (label: string, submit: (contract: Contract, token: Contract) => Promise<TransactionResponse>) =>
    operation(async ({ market, token, confirm, ensureWallet }) => {
      await ensureWallet();
      return confirm(label, await submit(market, token));
    });

  const checkout = (night: Night, resale: boolean) => operation(async ({ market, token, account, ensureWallet, confirm }) => {
    const receipt = await purchase(market, token, night, resale, account, ensureWallet, confirm);
    setRecentReceipt(receipt);
    return receipt;
  });

  const makeProof = (night: Night) => operation(async ({ market, signer, ensureWallet }) => {
    const proof = await signGuestProof(night, signer, await market.getAddress());
    await ensureWallet();
    return proof;
  });

  return { wallet, synced, canWrite, run, checkout, makeProof, recentReceipt, activity, busy, actionError, marketError,
    history: synced && history && history.through <= synced.blockNumber ? history : undefined, historyError, setActionError };
}

export type Market = ReturnType<typeof useMarket>;
