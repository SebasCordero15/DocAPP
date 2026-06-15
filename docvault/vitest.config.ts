import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Load .env before any test module so DATABASE_URL is available when the
    // Prisma client singleton is first imported.
    setupFiles: ["dotenv/config"],
    // Run tests serially — tests share a database and setup/teardown must not race.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error singleFork is a valid Vitest 4 runtime option; types lag
    singleFork: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
