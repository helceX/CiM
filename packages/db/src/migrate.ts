import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client";

async function main() {
  const db = createDb();
  await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
  console.log("Migrations applied.");
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
