import type { PackageSummary } from "@/lib/client/claim";
import { addressUrl } from "@/lib/client/format";
import { claimCopy as c } from "@/lib/copy/claim";
import { Transaction } from "./claim-receipt";

export function PublicClaim({ claim }: { claim: PackageSummary["claimed"] }) {
  if (!claim) return null;
  return (
    <section className="public-claim" aria-label={c("PUBLIC_CLAIM_TITLE")}>
      <header>
        <span className="public-claim-mark" aria-hidden="true">
          ↗
        </span>
        <div>
          <h2>{c("PUBLIC_CLAIM_TITLE")}</h2>
          <p>{c("PUBLIC_CLAIM_BODY")}</p>
        </div>
      </header>
      {claim.wallet && (
        <div className="public-claim-wallet">
          <span>{c("PUBLIC_WALLET")}</span>
          <a href={addressUrl(claim.wallet)} target="_blank" rel="noreferrer">
            {claim.wallet}
          </a>
        </div>
      )}
      <div className="claim-transactions">
        {claim.setClaimTx && (
          <Transaction label={c("TX_SET")} hash={claim.setClaimTx} />
        )}
        {claim.claimTxs.map((hash, i) => (
          <Transaction
            key={`${hash}-${i}`}
            label={c("TX_CLAIM", { number: i + 1 })}
            hash={hash}
          />
        ))}
        {!claim.setClaimTx && !claim.claimTxs.length && (
          <p>{c("TX_MISSING")}</p>
        )}
      </div>
    </section>
  );
}
