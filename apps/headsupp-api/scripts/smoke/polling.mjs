export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollUntil({
  label,
  check,
  isReady,
  attempts = 30,
  intervalMs = 3000,
}) {
  let latest = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    latest = await check();
    if (isReady(latest)) return latest;
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}. Latest: ${JSON.stringify(latest)}`);
}
