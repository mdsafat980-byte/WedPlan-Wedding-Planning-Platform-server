import { createApp } from "./app.js";
import { assertProductionEnv, env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./db.js";
import { seedDatabase } from "./seed.js";
import { User } from "./models/User.js";

async function main() {
  assertProductionEnv();
  await connectDatabase();

  const userCount = await User.estimatedDocumentCount();
  if (userCount === 0 && env.autoSeed) {
    console.log("[seed] empty database detected - creating demo data");
    await seedDatabase({ reset: false, silent: false });
  } else if (env.adminEmail && env.adminPassword) {
    // Make sure the configured admin can always sign in after a deploy.
    await seedDatabase({ reset: false, silent: true, adminOnly: true });
  }

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[api] WedPlan API listening on ${env.authUrl} (port ${env.port})`);
  });

  const shutdown = async (signal) => {
    console.log(`[api] received ${signal}, shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("[api] fatal startup error:", error);
  process.exit(1);
});
