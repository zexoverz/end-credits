import { describe, expect, it } from "vitest";
import { startLoop } from "./loop";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("startLoop", () => {
  it("runs the tick repeatedly and keeps going after a tick throws", async () => {
    let n = 0;
    const lines: string[] = [];
    const loop = startLoop(
      "t",
      5,
      async () => {
        n++;
        if (n === 1) throw new TypeError("boom");
      },
      (l) => lines.push(l),
    );
    await sleep(60);
    await loop.stop();
    expect(n).toBeGreaterThan(2);
    expect(lines).toContain("t: tick failed: TypeError");
  });

  it("stop waits for the tick in flight and starts no new one", async () => {
    let running = false;
    let started = 0;
    const loop = startLoop("t", 1, async () => {
      started++;
      running = true;
      await sleep(30);
      running = false;
    });
    await sleep(5);
    await loop.stop();
    expect(running).toBe(false);
    const after = started;
    await sleep(20);
    expect(started).toBe(after);
  });
});
