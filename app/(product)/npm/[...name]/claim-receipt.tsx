import type { ClaimView } from "@/lib/client/claim";
import { addressUrl, txUrl } from "@/lib/client/format";
import { claimCopy as c } from "@/lib/copy/claim";

export function ClaimReceipt({ claim }: { claim: ClaimView }) {
  return (
    <section className="claim-receipt" aria-label={c("RECEIPT_TITLE")}>
      <div className="claim-success-mark" aria-hidden="true">
        <svg viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="21" />
          <path d="m14 24 7 7 14-15" />
        </svg>
      </div>
      <h4>{c("RECEIPT_TITLE")}</h4>
      <p>{c("RECEIPT_AMOUNT")}</p>
      <div className="claim-receipt-amount">
        {claim.claimedAmount ?? "—"}
        <span>{c("USDC")}</span>
      </div>
      <p>{c("RECEIPT_BODY")}</p>
      {claim.wallet && (
        <div className="claim-receipt-wallet">
          <span>{c("CLAIMED_TO")}</span>
          <a href={addressUrl(claim.wallet)} target="_blank" rel="noreferrer">
            {claim.wallet}
          </a>
        </div>
      )}
      <div className="claim-transactions">
        <h5>{c("TX_TITLE")}</h5>
        {claim.setClaimTx && (
          <Transaction label={c("TX_SET")} hash={claim.setClaimTx} />
        )}
        {(claim.claimTxs ?? []).map((hash, i) => (
          <Transaction
            key={`${hash}-${i}`}
            label={c("TX_CLAIM", { number: i + 1 })}
            hash={hash}
          />
        ))}
        {!claim.setClaimTx && !claim.claimTxs?.length && (
          <p>{c("TX_MISSING")}</p>
        )}
      </div>
    </section>
  );
}
function Transaction({ label, hash }: { label: string; hash: string }) {
  return (
    <a
      className="claim-transaction"
      href={txUrl(hash)}
      target="_blank"
      rel="noreferrer"
    >
      <span>
        <strong>{label}</strong>
        <code>{hash}</code>
      </span>
      <small>{c("TX_LINK")}</small>
    </a>
  );
}
