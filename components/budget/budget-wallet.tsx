"use client";

// /owner: the budget wallet (EndCreditsBudget spend limits). The owner's USDC stays in their own
// wallet; from that wallet they approve USDC to the budget contract and give our agent key an
// allowance per period. Every transaction here is sent from the owner's wallet, never the server.
// Wallet calls remain explicit: approve USDC, then set or revoke the agent allowance.
import { useCallback, useEffect, useState } from "react";
import { encodeFunctionData, parseAbi, type Hex } from "viem";
import { ActionNotice, useFeedback } from "@/components/product/feedback";
import { api } from "@/components/product/request";
import { Button, Card, ErrorBox, Mono } from "@/components/ui";
import {
  connectWallet,
  errorName,
  onBaseSepolia,
  walletProvider,
  type WalletKind,
} from "@/components/approver/connect-wallet";
import { fill } from "@/lib/client/approve";
import { WORKSPACE as W } from "@/lib/copy/workspace";
import { BUDGET_COPY as C } from "@/lib/copy/budget";
import { parseUsdc, USDC_PATTERN } from "@/lib/money";
import {
  spendingAmount,
  approvalCovers,
  spendingArguments,
} from "./spending-limit";

export interface BudgetView {
  budgetAddress: string | null;
  usdc: string | null;
  budgetOwner: string | null;
  spender: string | null;
  usdcBalance: string | null;
  usdcAllowanceToBudget: string | null;
  allowance: {
    perPeriod: string;
    period: number;
    periodStart: string;
    spentInPeriod: string;
    remaining: string;
  } | null;
  error: "rpc_unavailable" | null;
}

const ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function setAllowance(address spender, uint128 perPeriod, uint64 period)",
  "function revoke(address spender)",
]);

const DAY = 86400;
const PERIOD_OPTIONS = [3600, DAY, 7 * DAY];
const periodName = (s: number) =>
  C.PERIODS[String(s)] ?? fill(C.HOURS, { hours: String(s / 3600) });
const same = (a: string | null, b: string | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();
const REFRESH_AFTER_MS = 4_000;

/** eth_sendTransaction from the connected wallet on Base Sepolia; returns the tx hash. */
async function send(
  kind: WalletKind,
  from: string,
  to: string,
  data: Hex,
): Promise<string> {
  const p = await walletProvider(kind);
  await onBaseSepolia(p);
  const hash = await p.request({
    method: "eth_sendTransaction",
    params: [{ from, to, data }],
  });
  if (typeof hash !== "string") throw new Error("no transaction");
  return hash;
}

export function BudgetWallet() {
  const notify = useFeedback();
  const [view, setView] = useState<BudgetView | null>(null);
  const [wallet, setWallet] = useState<{
    address: string;
    kind: WalletKind;
  } | null>(null);
  const [perPeriod, setPerPeriod] = useState("");
  const [period, setPeriod] = useState(DAY);
  const [sliderMax, setSliderMax] = useState(100);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    const r = await api<BudgetView>("/api/owner/budget");
    if (r.ok) setView(r.data);
    else
      setNote({ kind: "error", text: fill(C.LOAD_FAILED, { error: r.error }) });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the fetches set state when they answer
    void refresh();
    // Default per-period cap: the owner's daily limit.
    void api<{ dailyLimit: string }>("/api/owner/settings").then((r) => {
      if (r.ok) {
        setPerPeriod((v) => v || r.data.dailyLimit);
        setSliderMax((v) => Math.max(v, Number(r.data.dailyLimit)));
      }
    });
  }, [refresh]);

  async function run(label: string, action: () => Promise<string | null>) {
    setBusy(label);
    setNote(null);
    try {
      const text = await action();
      if (text) {
        setNote({ kind: "ok", text });
        notify(C.TITLE, text);
      }
    } catch (e) {
      setNote({ kind: "error", text: fill(C.FAILED, { error: errorName(e) }) });
    } finally {
      setBusy(null);
    }
  }

  const connect = (kind: WalletKind) =>
    run(C.CONNECTING, async () => {
      const address = await connectWallet(kind);
      if (!address) throw new Error("no account");
      setWallet({ address, kind });
      return null;
    });

  const useWallet = () =>
    run(C.USE_WALLET, async () => {
      const r = await api<BudgetView>("/api/owner/budget", {
        method: "POST",
        body: JSON.stringify({ address: wallet!.address }),
      });
      if (!r.ok) throw new Error(r.error);
      setView(r.data);
      return C.SAVED;
    });

  // Sends one call from the budget wallet, then re-reads the chain once the block has landed.
  const sendFromOwner = (label: string, to: string | null, data: () => Hex) =>
    run(label, async () => {
      if (!wallet || !to) return null;
      await send(wallet.kind, wallet.address, to, data());
      setTimeout(() => void refresh(), REFRESH_AFTER_MS);
      return C.SENT;
    });

  if (view && !view.budgetAddress) {
    return (
      <Card title={C.TITLE}>
        <p className="text-muted text-sm">{C.NOT_CONFIGURED}</p>
      </Card>
    );
  }

  const isOwner = !!wallet && same(wallet.address, view?.budgetOwner ?? null);
  const a = view?.allowance;
  const readable =
    !!view &&
    !view.error &&
    !!view.spender &&
    !!view.usdc &&
    !!view.budgetAddress;
  const validAmount = USDC_PATTERN.test(perPeriod) && parseUsdc(perPeriod) > 0n;
  const approvalReady =
    readable && approvalCovers(view.usdcAllowanceToBudget, perPeriod);
  const selectLimit = (value: string) => {
    setPerPeriod(value);
    setNote(null);
  };

  return (
    <Card title={C.TITLE}>
      <div className="budget-wallet-content">
        <p className="text-muted">{C.EXPLAIN}</p>
        {view && (
          <>
            <details className="allowance-addresses">
              <summary>{W.walletDetails}</summary>
              <div>
                {C.WALLET}:{" "}
                {view.budgetOwner ? (
                  <Mono>{view.budgetOwner}</Mono>
                ) : (
                  <span className="text-muted">{C.NONE}</span>
                )}
              </div>
              {view.spender && (
                <div>
                  {C.SPENDER}: <Mono>{view.spender}</Mono>
                </div>
              )}
            </details>
            {view.budgetOwner && view.error === null && (
              <dl className="allowance-balances">
                <div>
                  <dt>{C.BALANCE}</dt>
                  <dd>{view.usdcBalance ?? C.UNKNOWN}</dd>
                </div>
                <div>
                  <dt>{C.APPROVED}</dt>
                  <dd>{view.usdcAllowanceToBudget ?? C.UNKNOWN}</dd>
                </div>
                <div className="allowance-period-summary">
                  <dt>{C.ALLOWANCE}</dt>
                  <dd>
                    {a
                      ? fill(C.ALLOWANCE_LINE, {
                          perPeriod: a.perPeriod,
                          period: periodName(a.period),
                          spent: a.spentInPeriod,
                          remaining: a.remaining,
                        })
                      : C.NO_ALLOWANCE}
                  </dd>
                </div>
              </dl>
            )}
            {view.error && <ErrorBox>{C.RPC}</ErrorBox>}
          </>
        )}

        {wallet ? (
          <ActionNotice>
            {C.CONNECTED} <Mono>{wallet.address}</Mono>
          </ActionNotice>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!!busy}
              onClick={() => connect("injected")}
            >
              {C.CONNECT}
            </Button>
          </div>
        )}

        {wallet && !same(wallet.address, view?.budgetOwner ?? null) && (
          <Button type="button" disabled={!!busy} onClick={useWallet}>
            {C.USE_WALLET}
          </Button>
        )}
        {wallet && view?.budgetOwner && !isOwner && (
          <p className="text-muted">
            {fill(C.WRONG_WALLET, {
              budgetOwner: view.budgetOwner,
              address: wallet.address,
            })}
          </p>
        )}

        {isOwner && view && (
          <div className="spending-setup">
            <div className="spending-slider-panel">
              <label htmlFor="spend-period-amount">{C.SLIDER}</label>
              <div className="spending-amount">
                <output htmlFor="spend-period-amount">
                  {perPeriod || C.UNKNOWN}
                </output>
                <span>{W.unit}</span>
                <label className="spending-period-label" htmlFor="spend-period">
                  {C.PERIOD}
                </label>
                <select
                  id="spend-period"
                  value={period}
                  disabled={!!busy}
                  onChange={(e) => setPeriod(Number(e.target.value))}
                >
                  {PERIOD_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {periodName(s)}
                    </option>
                  ))}
                </select>
              </div>
              <input
                id="spend-period-amount"
                type="range"
                min="0.000001"
                max={sliderMax}
                step="0.000001"
                value={perPeriod || "0.000001"}
                disabled={!!busy || !perPeriod}
                aria-valuetext={fill(C.STEP_AMOUNT, {
                  amount: perPeriod || C.UNKNOWN,
                })}
                aria-describedby="spending-help"
                onChange={(e) =>
                  selectLimit(String(Number(Number(e.target.value).toFixed(6))))
                }
              />
              <div className="spending-scale">
                <span>0</span>
                <span>
                  {sliderMax} {W.unit}
                </span>
              </div>
              <div className="spending-presets">
                {[5, 20, 50, 100].map((value) => (
                  <button
                    key={value}
                    type="button"
                    disabled={!!busy}
                    aria-pressed={perPeriod === String(value)}
                    onClick={() => {
                      setSliderMax((max) => Math.max(max, value));
                      selectLimit(String(value));
                    }}
                  >
                    {value} {W.unit}
                  </button>
                ))}
              </div>
              <div className="spending-range">
                <span>
                  {C.RANGE}: {sliderMax} {W.unit}
                </span>
                <button
                  type="button"
                  disabled={
                    !!busy ||
                    sliderMax <= 100 ||
                    Number(perPeriod) > sliderMax / 10
                  }
                  onClick={() => setSliderMax((max) => Math.max(100, max / 10))}
                >
                  {C.RANGE_LESS}
                </button>
                <button
                  type="button"
                  disabled={!!busy || sliderMax >= 100_000_000}
                  onClick={() =>
                    setSliderMax((max) => Math.min(100_000_000, max * 10))
                  }
                >
                  {C.RANGE_MORE}
                </button>
              </div>
              <p id="spending-help">{C.SLIDER_HELP}</p>
            </div>
            <div className="allowance-controls">
              <div className="allowance-control">
                <h3>{C.APPROVE_STEP}</h3>
                <p>{C.APPROVE_HELP}</p>
                <strong className="spending-step-amount">
                  {fill(C.STEP_AMOUNT, { amount: perPeriod || C.UNKNOWN })}
                </strong>
                <Button
                  type="button"
                  disabled={!!busy || !readable || !validAmount}
                  onClick={() =>
                    sendFromOwner(C.APPROVE, view.usdc, () => {
                      if (!readable) throw new Error(C.NOT_READY);
                      return encodeFunctionData({
                        abi: ABI,
                        functionName: "approve",
                        args: [
                          view.budgetAddress as Hex,
                          spendingAmount(perPeriod),
                        ],
                      });
                    })
                  }
                >
                  {C.APPROVE}
                </Button>
              </div>
              <div className="allowance-control">
                <h3>{C.ALLOWANCE_STEP}</h3>
                <p>{C.ALLOWANCE_HELP}</p>
                <p className="spending-approval-state" role="status">
                  {approvalReady ? C.APPROVAL_READY : C.APPROVAL_REQUIRED}
                </p>
                <Button
                  type="button"
                  disabled={!!busy || !approvalReady}
                  onClick={() =>
                    sendFromOwner(C.SET_ALLOWANCE, view.budgetAddress, () => {
                      if (!readable) throw new Error(C.NOT_READY);
                      const selected = spendingArguments(
                        perPeriod,
                        period,
                        view.usdcAllowanceToBudget,
                      );
                      return encodeFunctionData({
                        abi: ABI,
                        functionName: "setAllowance",
                        args: [
                          view.spender as Hex,
                          selected.amount,
                          selected.period,
                        ],
                      });
                    })
                  }
                >
                  {C.SET_ALLOWANCE}
                </Button>
              </div>
            </div>
            {a && (
              <Button
                type="button"
                disabled={!!busy || !view.spender}
                onClick={() =>
                  sendFromOwner(C.REVOKE, view.budgetAddress, () =>
                    encodeFunctionData({
                      abi: ABI,
                      functionName: "revoke",
                      args: [view.spender as Hex],
                    }),
                  )
                }
              >
                {C.REVOKE}
              </Button>
            )}
          </div>
        )}

        <Button
          className="allowance-refresh"
          type="button"
          disabled={!!busy}
          onClick={() => void refresh()}
        >
          {C.REFRESH}
        </Button>
        {busy && (
          <ActionNotice tone="pending">
            {busy === C.CONNECTING ? C.CONNECTING : C.CONFIRM}
          </ActionNotice>
        )}
        {note?.kind === "error" && <ErrorBox>{note.text}</ErrorBox>}
        {note?.kind === "ok" && (
          <ActionNotice tone="success">{note.text}</ActionNotice>
        )}
      </div>
    </Card>
  );
}
