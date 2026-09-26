// Fetch for a maintainer's own x402 endpoint (decisions.md "Agent-to-agent x402"). The URL comes from
// a FUNDING.json anyone can write, so the worker treats it as hostile: https only, every resolved
// address public (checked at connect time, so a DNS answer cannot change between check and use),
// no redirects, 8 s for the whole exchange, 64 KB of body at most.
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import { request as httpsRequest } from "node:https";
import type { IncomingMessage, RequestOptions } from "node:http";
import { BlockList, isIP } from "node:net";
import type { EndpointReason } from "../messages";

export const ENDPOINT_TIMEOUT_MS = 8_000;
export const ENDPOINT_MAX_BYTES = 64 * 1024;

export class EndpointRefused extends Error {
  constructor(
    readonly reason: EndpointReason,
    readonly host: string,
  ) {
    super(`endpoint ${host} refused: ${reason}`);
    this.name = "EndpointRefused";
  }
}

// IPv4: everything not globally routable. IPv6: only global unicast (2000::/3) minus the ranges
// that embed an IPv4 address (6to4, Teredo) and documentation, so ::1, fc00::/7 (fd00:ec2::254),
// fe80::/10, ::ffff:0:0/96 and 64:ff9b::/96 are all out.
const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];
const V6_RESERVED: [string, number][] = [
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
];

const v4Blocked = new BlockList();
for (const [net, prefix] of V4_BLOCKED) v4Blocked.addSubnet(net, prefix, "ipv4");
const v6Global = new BlockList();
v6Global.addSubnet("2000::", 3, "ipv6");
const v6Reserved = new BlockList();
for (const [net, prefix] of V6_RESERVED) v6Reserved.addSubnet(net, prefix, "ipv6");

/** True for any address the worker must never connect to. Non-IP input counts as blocked. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return v4Blocked.check(address, "ipv4");
  if (family === 6) return !v6Global.check(address, "ipv6") || v6Reserved.check(address, "ipv6");
  return true;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;
type LookupFn = (hostname: string, options: LookupOptions, callback: LookupCallback) => void;

type Transport = {
  protocol: string;
  request: (options: RequestOptions, callback: (res: IncomingMessage) => void) => ReturnType<typeof httpsRequest>;
};

export type EndpointFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  /** Tests only: a fake resolver. */
  lookup?: LookupFn;
  /** Tests only: plain http against a local server. */
  transport?: Transport;
  /** Tests only: allow the local server's loopback address. */
  isBlocked?: (address: string) => boolean;
};

const defaultLookup: LookupFn = (hostname, options, callback) =>
  dnsLookup(hostname, { ...options, all: true }, callback as never);

function guardedLookup(host: string, base: LookupFn, isBlocked: (a: string) => boolean): LookupFn {
  return (hostname, options, callback) =>
    base(hostname, { ...options, all: true }, (err, result) => {
      if (err) return callback(new EndpointRefused("UNRESOLVED", host), []);
      const list = Array.isArray(result) ? result : [{ address: result, family: isIP(result) }];
      if (list.length === 0) return callback(new EndpointRefused("UNRESOLVED", host), []);
      if (list.some((a) => isBlocked(a.address))) {
        return callback(new EndpointRefused("PRIVATE_ADDRESS", host), []);
      }
      if (options.all) callback(null, list);
      else callback(null, list[0].address, list[0].family);
    });
}

/** A fetch for `wrapFetchWithPayment`: one guarded request, the body buffered under the cap. */
export function endpointFetch(opts: EndpointFetchOptions = {}): typeof globalThis.fetch {
  const timeoutMs = opts.timeoutMs ?? ENDPOINT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? ENDPOINT_MAX_BYTES;
  const transport = opts.transport ?? { protocol: "https:", request: httpsRequest };
  const isBlocked = opts.isBlocked ?? isBlockedAddress;

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const host = url.host;
    if (url.protocol !== transport.protocol) throw new EndpointRefused("NOT_HTTPS", host);
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    // An IP literal never reaches the resolver, so it is checked here.
    if (isIP(hostname) && isBlocked(hostname)) throw new EndpointRefused("PRIVATE_ADDRESS", host);
    const body = req.method === "GET" || req.method === "HEAD" ? null : Buffer.from(await req.arrayBuffer());
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => (headers[key] = value));

    return new Promise<Response>((resolve, reject) => {
      let settled = false;
      const fail = (err: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        outgoing.destroy();
        reject(err instanceof EndpointRefused ? err : new EndpointRefused("UNREACHABLE", host));
      };
      const outgoing = transport.request(
        {
          protocol: transport.protocol,
          hostname,
          port: url.port || undefined,
          path: `${url.pathname}${url.search}`,
          method: req.method,
          headers,
          lookup: guardedLookup(host, opts.lookup ?? defaultLookup, isBlocked) as RequestOptions["lookup"],
        },
        (res) => {
          const status = res.statusCode ?? 0;
          if (status >= 300 && status < 400) return fail(new EndpointRefused("REDIRECT", host));
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxBytes) return fail(new EndpointRefused("TOO_LARGE", host));
            chunks.push(chunk);
          });
          res.on("error", fail);
          res.on("end", () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            const out = new Headers();
            for (const [key, value] of Object.entries(res.headers)) {
              if (value !== undefined) out.set(key, Array.isArray(value) ? value.join(", ") : value);
            }
            const empty = status === 204 || status === 304 || size === 0;
            resolve(new Response(empty ? null : Buffer.concat(chunks), { status, headers: out }));
          });
        },
      );
      const timer = setTimeout(() => fail(new EndpointRefused("TIMEOUT", host)), timeoutMs);
      outgoing.on("error", fail);
      if (body) outgoing.write(body);
      outgoing.end();
    });
  };
}
