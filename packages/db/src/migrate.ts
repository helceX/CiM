import { applyMigrations } from "./migrate-runner";

applyMigrations()
  .then(() => {
    console.log("Migrations applied.");
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
