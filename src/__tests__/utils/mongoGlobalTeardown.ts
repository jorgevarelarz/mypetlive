export default async function globalTeardown(): Promise<void> {
  const servers = (globalThis as any).__MONGO_TESTS__;
  if (!servers) return;
  await Promise.all([servers.standalone.stop(), servers.replSet.stop()]);
}
