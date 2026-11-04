const { cleanupFromManifest } = await import("./household-security.test.ts");

export {};

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error("Usage: npm run test:security:cleanup -- supabase/tests/.runs/<run>.json");
await cleanupFromManifest(manifestPath);
