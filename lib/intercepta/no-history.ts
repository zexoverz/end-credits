// Intercepta answers quick-scan for an address it has never seen on mainnet with HTTP 404 and this
// body (live probe, 26 Sep; decisions.md). That is a result, not an outage: the address has no
// history to judge. Only this exact case counts; every other 404 stays an error and holds.

export const NO_HISTORY_BODY = {
  status: 404,
  response: { statusCode: 404, message: "Not Found" },
  errors: [{ message: "An Externally Owned Account with this address doesn't exist." }],
};

const EOA = /externally owned account/i;
const MISSING = /doesn['’]t exist/i;

export function isNoHistory(status: number, body: unknown): boolean {
  if (status !== 404 || typeof body !== "object" || body === null) return false;
  const errors = (body as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return false;
  return errors.some((e) => {
    const m = (e as { message?: unknown } | null)?.message;
    return typeof m === "string" && EOA.test(m) && MISSING.test(m);
  });
}
