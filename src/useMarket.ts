import { useEffect, useRef, useState } from "react";
import { type Contract, type TransactionResponse } from "ethers";
import { brand } from "./brand";
import { contractAddress, errorText, marketplace, readMarket, sepolia } from "./chain";
import { useWallet } from "./wallet";

type Status = "pending" | "confirmed" | "failed" | "unverified";
type Activity = { hash: string; label: string; status: Status; time: number; account: string };
const storageKey = "staycoin-sepolia-activity";
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
  const context = wallet.ready && contractAddress ? (wallet.address ?? "read-only") : null;
  const [snapshot, setSnapshot] = useState<{ context: string; data: MarketData; blockTime: bigint }>();
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
    setSnapshot(undefined);
    if (!context) return;
    const provider = wallet.provider();
    let active = true;
    let timer: number | undefined;
    async function poll() {
      try {
        const chain = await provider.getNetwork();
        if (chain.chainId !== BigInt(sepolia.id)) throw new Error("Switch to Sepolia.");
        const block = await provider.getBlock("latest");
        if (!block || !contractAddress) throw new Error("Sepolia data is temporarily unavailable.");
        if (await provider.getCode(contractAddress, block.number) === "0x") {
          throw new Error("There is no contract at the configured address on Sepolia.");
        }
        const contract = marketplace(provider);
        if (await contract.symbol({ blockTag: block.number }) !== brand.tokenSymbol) {
          throw new Error("Configure the deployed Night Token contract.");
        }
        const data = await readMarket(contract, wallet.address, block.number);
        if (active && context) {
          setSnapshot({ context, data, blockTime: BigInt(block.timestamp) });
          setMarketError("");
        }
      } catch (err) {
        if (active) {
          setSnapshot(undefined);
          setMarketError(errorText(err));
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
  const canWrite = Boolean(synced && wallet.address && !marketError);
  const run = async (label: string, submit: (contract: Contract) => Promise<TransactionResponse>) => {
    if (!canWrite || !wallet.address || actionLock.current) return false;
    const account = wallet.address;
    actionLock.current = true;
    setBusy(true);
    setActionError("");
    let hash = "";
    type Replacement = { code?: string; cancelled?: boolean; replacement?: TransactionResponse; receipt?: { hash?: string; status?: number } };
    const update = (patch: Partial<Activity>) =>
      setActivity((items) => items.map((item) => item.hash === hash ? { ...item, ...patch } : item));

    try {
      const provider = wallet.provider();
      if ((await provider.getNetwork()).chainId !== BigInt(sepolia.id)) throw new Error("Switch to Sepolia first.");
      const signer = await provider.getSigner(account);
      const transaction = await submit(marketplace(signer));
      hash = transaction.hash;
      setActivity((items) => [{ hash, label, status: "pending" as const, time: Date.now(), account }, ...items].slice(0, 100));
      const receipt = await transaction.wait(1, 90000);
      if (!receipt) throw new Error("Confirmation is pending. Check Transaction Activity.");
      update({ status: receipt.status === 1 ? "confirmed" : "failed" });
      return receipt.status === 1;
    } catch (err) {
      const result = err as Replacement;
      if (hash && result.code === "TRANSACTION_REPLACED" && result.replacement) {
        const equivalent = !result.cancelled && result.receipt?.status === 1;
        if (!equivalent) setActionError("The original transaction was replaced or cancelled.");
        update({ status: equivalent ? "confirmed" : "failed", hash: result.replacement.hash,
          label: equivalent ? label : label + " (replaced or cancelled)" });
        return equivalent;
      }
      if (hash) {
        update({ status: result.receipt?.status === 0 ? "failed" : "unverified" });
        setActionError(result.receipt?.status === 0 ? "The transaction reverted on Sepolia." :
          "Confirmation is unavailable. Check the transaction in Activity or on Etherscan.");
      } else {
        setActionError(errorText(err));
      }
      return false;
    } finally {
      actionLock.current = false;
      setBusy(false);
      if (hash) setRevision((value) => value + 1);
    }
  };

  return { wallet, synced, canWrite, run, activity, busy, actionError, marketError, setActionError };
}

export type Market = ReturnType<typeof useMarket>;
