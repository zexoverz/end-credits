// A polling loop: run `tick`, wait `intervalMs`, repeat. One tick at a time; a failed tick is logged
// by error name only and the loop goes on. `stop()` resolves once the tick in flight has finished.
export type Loop = { stop(): Promise<void> };

export function startLoop(
  name: string,
  intervalMs: number,
  tick: () => Promise<unknown>,
  log: (line: string) => void = console.error,
): Loop {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> = Promise.resolve();

  const run = () => {
    inFlight = (async () => {
      try {
        await tick();
      } catch (err) {
        log(`${name}: tick failed: ${err instanceof Error ? err.name : "error"}`);
      }
    })();
    void inFlight.then(() => {
      if (!stopped) timer = setTimeout(run, intervalMs);
    });
  };
  run();

  return {
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await inFlight;
    },
  };
}
