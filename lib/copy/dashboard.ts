// Copy for /dashboard (AGENTS rule 14). The redesign rewrites the words here, not in the page.
export const DASHBOARD = {
  TITLE: "Your impact, on record.",
  INTRO:
    "Track transfers, reserved contributions, and escrow activity. On-chain amounts come from MultiBaas; refused credits come from the decision log.",
  REFRESH: "Refresh",
  REFRESHING: "Refreshing…",
  LOADING: "Loading from MultiBaas…",
  UPDATED: "Updated {time}",
  AUTO_REFRESH: "Refreshes every 30 s.",
  ERROR_TITLE:
    "The dashboard could not read MultiBaas, so no numbers are shown.",
  ERROR_STATUS: "HTTP {status}",

  CARD_PAID: "Confirmed payer transfers",
  CARD_PAID_SUB: "{count} payments",
  CARD_PROJECTS: "Projects supported",
  CARD_PROJECTS_SUB: "paid or reserved",
  CARD_HELD: "Escrow holds",
  HELD_APPROVED: "Approved",
  HELD_DENIED: "Denied",
  HELD_EXPIRED: "Expired",
  HELD_PENDING: "Pending",
  CARD_REFUSED: "Payments refused",
  CARD_REFUSED_SUB: "from the decision log, not the chain",
  CARD_RESERVED: "Reserved for maintainers",
  CARD_RESERVED_SUB: "for {count} packages without a wallet",

  PACKAGES: "The packages behind your sessions",
  PACKAGES_EMPTY: "No package has been paid or reserved yet.",
  COL_PACKAGE: "Package",
  COL_SESSIONS: "Sessions",
  COL_PAID: "Paid",
  COL_RESERVED: "Reserved",
  COL_LAST: "Last decision",

  RECENT: "Recent escrow events",
  RECENT_EMPTY: "No escrow events yet.",
  COL_EVENT: "Event",
  COL_SUBJECT: "Subject",
  COL_AMOUNT: "Amount",
  COL_BLOCK: "Block",
  COL_TX: "Tx",
  COL_TIME: "Time",

  FOOTER_SOURCE: "Data: MultiBaas event queries",
  FOOTER_ESCROW: "Escrow",
  FOOTER_PAYER: "Payer",
  FOOTER_GENERATED: "Generated",
  SESSIONS_SETTLED: "{count} sessions settled on chain.",

  JUST_NOW: "just now",
  SECONDS_AGO: "{n} s ago",
  MINUTES_AGO: "{n} min ago",
  HOURS_AGO: "{n} h ago",
  DAYS_AGO: "{n} d ago",
  NO_VALUE: "—",
} as const;

export function fill(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    if (!(name in vars)) throw new Error(`Missing copy var: ${name}`);
    return String(vars[name]);
  });
}
