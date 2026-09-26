import { CREDITS_DESK as C } from "@/lib/copy/credits-desk";
import { txUrl } from "@/lib/client/format";
import type { SessionView } from "@/lib/sessions/view";
export function SessionTicket({ view }: { view: SessionView }) {
  return (
    <aside className="session-ticket">
      <p className="ticket-label">{C.ticket}</p>
      <svg
        className="session-ticket-art"
        viewBox="0 0 280 210"
        fill="none"
        aria-hidden="true"
      >
        <ellipse cx="140" cy="173" rx="99" ry="15" fill="#303d2d" />
        <g className="ticket-disc">
          <circle
            cx="107"
            cy="98"
            r="70"
            fill="#b8edc5"
            stroke="#20281e"
            strokeWidth="2"
          />
          <circle cx="107" cy="98" r="55" stroke="#20281e" />
          <circle cx="107" cy="98" r="39" stroke="#20281e" />
          <circle cx="107" cy="98" r="9" fill="#20281e" />
          <path d="m68 55 11 13m53 62 14 12" stroke="#20281e" strokeWidth="3" />
        </g>
        <g transform="rotate(9 185 112)">
          <path
            d="M146 51h80v126l-8-5-8 5-8-5-8 5-8-5-8 5-8-5-8 5-8-5-8 5V51Z"
            fill="#f5f4e9"
            stroke="#20281e"
            strokeWidth="2"
          />
          <path
            d="M161 72h50m-50 11h31m-31 48h50m-50 11h40"
            stroke="#697360"
            strokeWidth="2"
          />
          <circle cx="185" cy="109" r="13" fill="#b8edc5" />
          <path d="m178 109 5 5 10-11" stroke="#20281e" strokeWidth="2" />
          <path
            d="M163 154v8m4-8v8m5-8v8m3-8v8m6-8v8m4-8v8m3-8v8m5-8v8m3-8v8m6-8v8m4-8v8"
            stroke="#20281e"
          />
        </g>
        <path
          d="M224 25v18m-9-9h18M36 137v12m-6-6h12"
          stroke="#b8edc5"
          strokeWidth="2"
        />
      </svg>
      <div className="ticket-count">
        <strong>{view.credits.length.toString().padStart(2, "0")}</strong>
        <span>{C.packages}</span>
      </div>
      <p className="ticket-explanation">{C.explanation}</p>
      <div className="ticket-perforation" />
      <dl>
        <div>
          <dt>{C.session}</dt>
          <dd>{view.id}</dd>
        </div>
        {view.startedAt && (
          <div>
            <dt>{C.started}</dt>
            <dd>
              <time dateTime={view.startedAt}>
                {new Date(view.startedAt).toLocaleString()}
              </time>
            </dd>
          </div>
        )}
        {view.endedAt && (
          <div>
            <dt>{C.ended}</dt>
            <dd>
              <time dateTime={view.endedAt}>
                {new Date(view.endedAt).toLocaleString()}
              </time>
            </dd>
          </div>
        )}
      </dl>
      {view.recordTx && (
        <a href={txUrl(view.recordTx)} target="_blank" rel="noreferrer">
          {C.record}
        </a>
      )}
      <p className="ticket-network">{C.network}</p>
    </aside>
  );
}
