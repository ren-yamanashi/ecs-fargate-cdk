import { defineConfig } from "vitest/config";

export default defineConfig({
  root: ".",
  test: {
    root: ".",
    globals: true,
    silent: false,
    environment: "node",
    include: ["**/__test__/**/*.{spec,test}.ts"],
  },
});
