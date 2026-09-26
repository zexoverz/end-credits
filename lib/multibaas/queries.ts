// Saved event queries for the dashboard (DESIGN §15), in the MultiBaas `EventQuery` shape
// (SDK 1.1.1 types). Constraints this follows, see docs/plan/decisions.md "E9":
// - no `count` or distinct aggregator: counts are taken from rows in code;
// - with any aggregator, all fields but one are aggregated and that one is the groupBy;
// - no nested filters (unverified): one flat filter per event, anything else is checked in code;
// - one alias set per query, lowercase snake case, so a union of events lines up column by column.
import { getAddress } from "viem";

export type Aggregator = "add" | "subtract" | "last" | "first" | "min" | "max";
export type FieldType =
  | "input"
  | "contract_label"
  | "contract_name"
  | "contract_address"
  | "contract_address_alias"
  | "block_number"
  | "triggered_at"
  | "event_signature"
  | "block_hash"
  | "tx_hash"
  | "tx_from";

export interface EventQueryField {
  type: FieldType;
  inputIndex?: number;
  alias: string;
  aggregator?: Aggregator;
}

export interface EventQueryFilter {
  fieldType: FieldType;
  inputIndex?: number;
  operator: "equal" | "notequal" | "lessthan" | "greaterthan" | "lessthanorequal" | "greaterthanorequal";
  value: string;
  rule?: "and" | "or";
  children?: EventQueryFilter[];
}

export interface EventQueryEvent {
  eventName: string;
  select: EventQueryField[];
  filter?: EventQueryFilter;
}

export interface EventQuery {
  events: EventQueryEvent[];
  groupBy?: string;
  orderBy?: string;
  order?: "ASC" | "DESC";
}

export const ESCROW_ALIAS = "escrow";
export const USDC_ALIAS = "usdc";

export const QUERY_LABELS = {
  paid: "paid_totals",
  held: "held_status",
  reserved: "reserved_by_package",
  reservedSessions: "reserved_sessions",
  sessions: "sessions",
  recent: "recent",
} as const;

const input = (inputIndex: number, alias: string, aggregator?: Aggregator): EventQueryField =>
  aggregator ? { type: "input", inputIndex, alias, aggregator } : { type: "input", inputIndex, alias };
const meta = (type: FieldType, alias: string): EventQueryField => ({ type, alias });

const onEscrow: EventQueryFilter = {
  fieldType: "contract_address_alias",
  operator: "equal",
  value: ESCROW_ALIAS,
};

const where = (block: string, tx: string, at?: string) => [
  meta("block_number", block),
  meta("tx_hash", tx),
  ...(at ? [meta("triggered_at", at)] : []),
];

// Escrow event input indexes (contracts/src/EndCreditsEscrow.sol):
// Held(tipId, packageKey, payer, payee, amount, reason, expiresAt)
// Released(tipId, payee, amount, approvalRef)   Refunded(tipId, payer, amount, expired)
// Reserved(packageKey, payer, amount, sessionId) Claimed(packageKey, payee, amount)
// SessionSettled(sessionId, ownerHash, budget, paid, held, reservedAmount, refused, manifestHash)

/** USDC Transfer rows from the payer. Rows, not sums: the count is needed and there is no count
 *  aggregator. The contract alias is selected so rows from any other linked token are dropped in
 *  code rather than with a nested AND filter. */
function paidTotals(payer: string): EventQuery {
  return {
    events: [
      {
        eventName: "Transfer",
        select: [
          meta("contract_address_alias", "contract"),
          input(0, "sender"),
          input(1, "recipient"),
          input(2, "amount"),
          ...where("block", "tx", "at"),
        ],
        filter: { fieldType: "input", inputIndex: 0, operator: "equal", value: getAddress(payer).toLowerCase() },
      },
    ],
    orderBy: "block",
    order: "DESC",
  };
}

/** Held, Released, Refunded rows. `detail` is expiresAt / approvalRef / expired respectively;
 *  only Refunded's (denied vs expired) is read. Status per tip is worked out in code. */
const heldStatus: EventQuery = {
  events: [
    ["Held", 4, 6],
    ["Released", 2, 3],
    ["Refunded", 2, 3],
  ].map(([eventName, amount, detail]) => ({
    eventName: eventName as string,
    select: [
      meta("event_signature", "event"),
      input(0, "tip_id"),
      input(amount as number, "amount"),
      input(detail as number, "detail"),
      ...where("block", "tx"),
    ],
    filter: onEscrow,
  })),
  orderBy: "block",
  order: "ASC",
};

/** Reserved minus Claimed per package: the add/subtract balance pattern. */
const reservedByPackage: EventQuery = {
  events: [
    { eventName: "Reserved", select: [input(0, "package_key"), input(2, "amount", "add")], filter: onEscrow },
    { eventName: "Claimed", select: [input(0, "package_key"), input(2, "amount", "subtract")], filter: onEscrow },
  ],
  groupBy: "package_key",
  orderBy: "amount",
  order: "DESC",
};

/** Reserved rows, for the distinct session count per package (no distinct aggregator). */
const reservedSessions: EventQuery = {
  events: [
    {
      eventName: "Reserved",
      select: [input(0, "package_key"), input(3, "session_id"), input(2, "amount"), ...where("block", "tx")],
      filter: onEscrow,
    },
  ],
};

const sessions: EventQuery = {
  events: [
    {
      eventName: "SessionSettled",
      select: [
        input(0, "session_id"),
        input(2, "budget"),
        input(3, "paid"),
        input(4, "held"),
        input(5, "reserved"),
        input(6, "refused"),
        ...where("block", "tx", "at"),
      ],
      filter: onEscrow,
    },
  ],
  orderBy: "block",
  order: "DESC",
};

/** Escrow events newest first. ClaimSet has no amount and is left out so every event fills the
 *  same columns; `subject` is the tip, package or session the event is about. */
const recent: EventQuery = {
  events: (
    [
      ["Held", 0, 4],
      ["Released", 0, 2],
      ["Refunded", 0, 2],
      ["Reserved", 0, 2],
      ["Claimed", 0, 2],
      ["SessionSettled", 0, 3],
    ] as const
  ).map(([eventName, subject, amount]) => ({
    eventName,
    select: [
      meta("event_signature", "event"),
      input(subject, "subject"),
      input(amount, "amount"),
      ...where("block", "tx", "at"),
    ],
    filter: onEscrow,
  })),
  orderBy: "block",
  order: "DESC",
};

export function savedQueries(payer: string): Record<(typeof QUERY_LABELS)[keyof typeof QUERY_LABELS], EventQuery> {
  return {
    paid_totals: paidTotals(payer),
    held_status: heldStatus,
    reserved_by_package: reservedByPackage,
    reserved_sessions: reservedSessions,
    sessions,
    recent,
  };
}
