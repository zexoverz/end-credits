export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkEnv, WEB_BOOT } = await import("./lib/env");
  checkEnv(WEB_BOOT);
}
