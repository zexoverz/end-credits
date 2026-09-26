import Link from "next/link";
import { Badge, ErrorBox, Mono } from "@/components/ui";
import { INSIGHTS as C } from "@/lib/copy/control-room";
import type { RiskProfile as Profile } from "@/lib/risk/profile";
import { addressUrl } from "@/lib/client/format";
const when = (iso: string) => new Date(iso).toLocaleString();
function Address({ address }: { address: string }) {
  return (
    <a href={addressUrl(address)} target="_blank" rel="noreferrer">
      <Mono>{address}</Mono> ↗
    </a>
  );
}
export function RiskProfile({
  profile,
  failed,
  hasPayee,
}: {
  profile: Profile | null;
  failed: boolean;
  hasPayee: boolean;
}) {
  const verdict = profile?.intercepta.address;
  const imp = profile?.intercepta.impersonation;
  const sim = profile?.intercepta.simulation;
  return (
    <section id="payee-risk" className="risk-profile">
      <header>
        <div>
          <p className="control-eyebrow">{C.riskLabel}</p>
          <h2>{C.risk}</h2>
          <p>{C.riskBody}</p>
        </div>
        {profile && (
          <a
            href={`/api/risk/${profile.address}`}
            target="_blank"
            rel="noreferrer"
          >
            {C.rawProfile}
          </a>
        )}
      </header>
      {failed ? (
        <ErrorBox>{C.riskError}</ErrorBox>
      ) : !profile ? (
        <p className="risk-empty">{hasPayee ? C.noRisk : C.noPayee}</p>
      ) : (
        <>
          <div className="risk-address">
            <Address address={profile.address} />
          </div>
          <div className="risk-overview">
            <div className="risk-score">
              <span>{C.score}</span>
              <strong>
                {!verdict || verdict.noHistory ? "—" : verdict.toxicScore}
                <small>{verdict && !verdict.noHistory ? "/ 100" : ""}</small>
              </strong>
              <p>
                {!verdict
                  ? C.noScreens
                  : verdict.noHistory
                    ? C.noHistory
                    : `${C.screened} · ${when(verdict.screenedAt)}`}
              </p>
            </div>
            <dl>
              <div>
                <dt>{C.screens}</dt>
                <dd>{profile.screens.count}</dd>
              </div>
              <div>
                <dt>{C.decisions}</dt>
                <dd>{profile.decisions.count}</dd>
              </div>
              <div>
                <dt>{C.sessions}</dt>
                <dd>{profile.decisions.sessions}</dd>
              </div>
            </dl>
          </div>
          <div className="risk-evidence">
            <section>
              <h3>{C.traits}</h3>
              {!verdict ? (
                <p>{C.noScreens}</p>
              ) : verdict.noHistory ? (
                <p>{C.noHistory}</p>
              ) : verdict.traits.length ? (
                <ul>
                  {verdict.traits.map((t, i) => (
                    <li key={`${t.name}-${i}`}>
                      <code>{t.name}</code>
                      <p>{t.description}</p>
                      {t.risk !== null && (
                        <small>
                          {C.score}: {t.risk}
                        </small>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{C.noTraits}</p>
              )}
            </section>
            <section>
              <h3>{C.impersonation}</h3>
              <p>
                {!imp
                  ? C.noImpersonation
                  : imp.isAddressPoisoned
                    ? C.poisoned
                    : C.notPoisoned}
              </p>
              {imp && <small>{when(imp.screenedAt)}</small>}
              {imp?.originalAddress && (
                <div>
                  <span>{C.original}</span>
                  <Address address={imp.originalAddress} />
                </div>
              )}
            </section>
            <section>
              <h3>{C.simulation}</h3>
              {!sim ? (
                <p>{C.noSimulation}</p>
              ) : (
                <>
                  {sim.detectors.length ? (
                    <ul>
                      {sim.detectors.map((d, i) => (
                        <li key={`${d.code}-${i}`}>
                          <code>{d.code}</code>
                          <p>{d.description}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>{C.noDetectors}</p>
                  )}
                  <small>{when(sim.screenedAt)}</small>
                </>
              )}
            </section>
          </div>
          <div className="risk-outcomes">
            <h3>{C.outcomes}</h3>
            <p>{C.outcomeNote}</p>
            <div>
              {Object.entries(profile.decisions.byOutcome).map(
                ([outcome, value]) => (
                  <div key={outcome}>
                    <Badge outcome={outcome} />
                    <strong>{value.count}</strong>
                    <small>
                      {value.amount.usdc} {C.unit}
                    </small>
                  </div>
                ),
              )}
            </div>
          </div>
          <details open className="risk-observations">
            <summary>
              {C.packagesAtAddress}
              <span>{profile.payeeOf.length}</span>
            </summary>
            {profile.payeeOf.length === 0 ? (
              <p>{C.noObservations}</p>
            ) : (
              profile.payeeOf.map((p) => (
                <article key={p.packageKey}>
                  <header>
                    <Link
                      href={`/app/npm/${p.package.split("/").map(encodeURIComponent).join("/")}`}
                    >
                      {p.package}
                    </Link>
                    {p.changed && <span>{C.changed}</span>}
                  </header>
                  <ol>
                    {p.addresses.map((a) => (
                      <li key={a.address}>
                        <span>{a.current ? C.current : C.previous}</span>
                        <Address address={a.address} />
                        <small>
                          {a.source} · {C.firstSeen}: {when(a.firstObservedAt)}{" "}
                          · {C.lastSeen}: {when(a.lastObservedAt)}
                        </small>
                      </li>
                    ))}
                  </ol>
                </article>
              ))
            )}
          </details>
          {profile.decisions.last && (
            <details className="risk-observations">
              <summary>
                {C.latest}
                <Badge outcome={profile.decisions.last.outcome} />
              </summary>
              <p>
                {profile.decisions.last.package} ·{" "}
                {when(profile.decisions.last.decidedAt)}
              </p>
              <ul>
                {profile.decisions.last.reasons.map((r, i) => (
                  <li key={i}>{r.text}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
