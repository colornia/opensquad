// A conversation may be abandoned without touching the game adapter.
export async function interruptible<T>(
  work: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    void work.catch(() => {});
    signal.throwIfAborted();
  }
  let interrupt: () => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    interrupt = () => reject(signal.reason ?? new Error("Canceled"));
    signal.addEventListener("abort", interrupt, { once: true });
  });
  try {
    return await Promise.race([work, interrupted]);
  } finally {
    signal.removeEventListener("abort", interrupt);
  }
}
