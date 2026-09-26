import { describe, expect, it } from "vitest";
import { sessionDestination } from "@/components/product/session-link";
import { STUDIO as S } from "@/lib/copy/studio";
const id = "b0000000-0000-4000-8000-000000000001";
describe("opening session receipts", () => {
  it("accepts a bare UUID and both legacy and app session links", () => {
    for (const value of [
      id,
      ` ${id} `,
      `https://end-credits.up.railway.app/credits/${id}`,
      `https://end-credits.up.railway.app/app/credits/${id}?source=cli`,
    ]) {
      expect(sessionDestination(value)).toEqual({ href: `/app/credits/${id}` });
    }
  });
  it.each([
    "",
    "../owner",
    "javascript:alert(1)",
    "invalid-session",
    "https://example.com/owner",
    `https://example.com/credits/${id}/extra`,
  ])(
    "rejects invalid input with the visible validation message: %s",
    (value) => {
      expect(sessionDestination(value)).toEqual({ error: S.sessionInvalid });
    },
  );
  it("only opens a local receipt even when the link contains an external host", () => {
    expect(sessionDestination(`https://example.com/credits/${id}`)).toEqual({
      href: `/app/credits/${id}`,
    });
  });
});
