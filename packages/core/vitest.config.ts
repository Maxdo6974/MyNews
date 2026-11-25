import { defineConfig } from "vitest/config";

// Les tests d'intégration réinitialisent la même base de test : on les exécute l'un après l'autre.
export default defineConfig({ test: { fileParallelism: false, testTimeout: 30_000 } });
