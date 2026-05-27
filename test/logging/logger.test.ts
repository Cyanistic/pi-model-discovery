import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { DebugLogger, redactSecrets } from "../../src/logging/logger.js";

test("debug logger redacts nested secret fields before writing file logs", async () => {
  const extensionRoot = mkdtempSync(join(tmpdir(), "pi-model-discovery-logger-"));
  const logger = new DebugLogger({ extensionRoot, debug: true });

  logger.debug("secret_event", {
    apiKey: "sk-test-secret",
    nested: [{ authorization: "Bearer secret" }, { token: "token-secret", safe: "visible" }],
  });
  await logger.flush();

  const log = readFileSync(join(extensionRoot, "debug", "debug.log"), "utf-8");
  assert.match(log, /secret_event/);
  assert.match(log, /\[REDACTED\]/);
  assert.match(log, /visible/);
  assert.doesNotMatch(log, /sk-test-secret|Bearer secret|token-secret/);
});

test("debug logger does not create debug files when disabled", () => {
  const extensionRoot = mkdtempSync(join(tmpdir(), "pi-model-discovery-logger-disabled-"));
  const logger = new DebugLogger({ extensionRoot, debug: false });

  logger.warn("disabled_event", { apiKey: "sk-test-secret" });

  assert.equal(existsSync(join(extensionRoot, "debug")), false);
});

test("redactSecrets preserves non-secret values while redacting recognized secret keys", () => {
  assert.deepEqual(redactSecrets({ password: "pw", nested: { api_key: "key", model: "gpt" } }), {
    password: "[REDACTED]",
    nested: { api_key: "[REDACTED]", model: "gpt" },
  });
});
