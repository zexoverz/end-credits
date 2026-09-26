import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { endpointFetch, EndpointRefused, isBlockedAddress } from "./endpoint";

async function refusal(p: Promise<unknown>): Promise<EndpointRefused> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(EndpointRefused);
  return err as EndpointRefused;
}

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fd00:ec2::254", // AWS metadata over IPv6
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
    "64:ff9b::a9fe:a9fe",
    "2002:7f00:1::", // 6to4 of 127.0.0.1
    "2001:db8::1",
    "not-an-ip",
  ])("blocks %s", (a) => expect(isBlockedAddress(a)).toBe(true));

  it.each(["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111", "2a05:d014::1"])("allows %s", (a) =>
    expect(isBlockedAddress(a)).toBe(false),
  );
});

describe("endpointFetch guards before connecting", () => {
  it("refuses plain http", async () => {
    const err = await refusal(endpointFetch()("http://tips.example.com/tip"));
    expect(err.reason).toBe("NOT_HTTPS");
    expect(err.host).toBe("tips.example.com");
  });

  it.each(["https://127.0.0.1/tip", "https://169.254.169.254/latest", "https://[::1]/tip", "https://10.0.0.8:8443/"])(
    "refuses the IP literal %s",
    async (url) => {
      expect((await refusal(endpointFetch()(url))).reason).toBe("PRIVATE_ADDRESS");
    },
  );

  it("refuses a name that resolves to a private address, at connect time", async () => {
    const lookup = (_h: string, _o: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) =>
      cb(null, [{ address: "10.0.0.5", family: 4 }]);
    const err = await refusal(endpointFetch({ lookup: lookup as never })("https://tips.example.com/tip"));
    expect(err.reason).toBe("PRIVATE_ADDRESS");
  });

  it("refuses when any one of the resolved addresses is private", async () => {
    const lookup = (_h: string, _o: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) =>
      cb(null, [
        { address: "93.184.216.34", family: 4 },
        { address: "::1", family: 6 },
      ]);
    const err = await refusal(endpointFetch({ lookup: lookup as never })("https://tips.example.com/tip"));
    expect(err.reason).toBe("PRIVATE_ADDRESS");
  });

  it("a name that does not resolve is UNRESOLVED", async () => {
    const lookup = (_h: string, _o: unknown, cb: (e: Error) => void) =>
      cb(Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }));
    const err = await refusal(endpointFetch({ lookup: lookup as never })("https://nope.example.com/"));
    expect(err.reason).toBe("UNRESOLVED");
  });
});

// A local plain-http server stands in for the maintainer; the guards under test are the ones after
// the connection (redirect, body cap, timeout), so loopback is allowed here and only here.
describe("endpointFetch guards on the answer", () => {
  let server: Server;
  let base: string;
  const local = {
    transport: { protocol: "http:", request: httpRequest },
    isBlocked: () => false,
  };

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/redirect") {
        res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" });
        return res.end();
      }
      if (req.url === "/big") {
        res.writeHead(402, { "content-type": "application/json" });
        return res.end("x".repeat(64 * 1024 + 1));
      }
      if (req.url === "/hang") return; // never answers
      res.writeHead(402, { "PAYMENT-REQUIRED": "e30=", "content-type": "application/json" });
      res.end(JSON.stringify({ seen: req.headers["payment-signature"] ?? null }));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.closeAllConnections();
    server.close();
  });

  it("passes status, headers and body through, and sends the request headers", async () => {
    const res = await endpointFetch(local)(`${base}/tip`, { headers: { "PAYMENT-SIGNATURE": "abc" } });
    expect(res.status).toBe(402);
    expect(res.headers.get("PAYMENT-REQUIRED")).toBe("e30=");
    expect(await res.json()).toEqual({ seen: "abc" });
  });

  it("refuses a redirect instead of following it", async () => {
    expect((await refusal(endpointFetch(local)(`${base}/redirect`))).reason).toBe("REDIRECT");
  });

  it("refuses a body over 64 KB", async () => {
    expect((await refusal(endpointFetch(local)(`${base}/big`))).reason).toBe("TOO_LARGE");
  });

  it("gives up after the timeout", async () => {
    const started = Date.now();
    expect((await refusal(endpointFetch({ ...local, timeoutMs: 150 })(`${base}/hang`))).reason).toBe("TIMEOUT");
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("a refused connection is UNREACHABLE", async () => {
    const closed = createServer();
    await new Promise<void>((r) => closed.listen(0, "127.0.0.1", r));
    const port = (closed.address() as AddressInfo).port;
    closed.close();
    expect((await refusal(endpointFetch(local)(`http://127.0.0.1:${port}/`))).reason).toBe("UNREACHABLE");
  });
});
