import { createJiti } from "jiti";
import * as url from "url";
import * as path from "path";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const jiti = createJiti(import.meta.url);

const extPath = path.resolve(__dirname, "./index.ts");

const runtime = {
  pendingProviderRegistrations: [],
  registerProvider(name, config, extPath) {
    this.pendingProviderRegistrations.push({ name, config, extPath });
  },
  unregisterProvider() {},
  assertActive() {},
  sendMessage() {},
  sendUserMessage() {},
  appendEntry() {},
  setSessionName() {},
  getSessionName() {},
  setLabel() {},
  getActiveTools() {},
  getAllTools() {},
  setActiveTools() {},
  refreshTools() {},
  getCommands() {},
  setModel() {},
  getThinkingLevel() {},
  setThinkingLevel() {},
  flagValues: new Map(),
  invalidate() {},
};

const api = {
  on(event, handler) {
    if (event === "session_start") {
      // simulate session start
      handler({}, {});
    }
  },
  events: { on() {}, emit() {} },
  registerTool() {},
  registerCommand() {},
  registerShortcut() {},
  registerFlag() {},
  registerMessageRenderer() {},
  getFlag() {},
  sendMessage() {},
  sendUserMessage() {},
  appendEntry() {},
  setSessionName() {},
  getSessionName() {},
  setLabel() {},
  exec() {},
  getActiveTools() {},
  getAllTools() {},
  setActiveTools() {},
  getCommands() {},
  setModel() {},
  getThinkingLevel() {},
  setThinkingLevel() {},
  registerProvider: runtime.registerProvider.bind(runtime),
  unregisterProvider: runtime.unregisterProvider.bind(runtime),
};

try {
  const factory = await jiti.import(extPath, { default: true });
  if (typeof factory !== "function") {
    console.error("Factory is not a function");
    process.exit(1);
  }
  await factory(api);
  console.log("Extension loaded successfully");
  console.log("Pending registrations:", runtime.pendingProviderRegistrations.length);
  for (const reg of runtime.pendingProviderRegistrations) {
    console.log("  Provider:", reg.name, "models:", reg.config.models?.length ?? 0);
  }
} catch (err) {
  console.error("LOAD ERROR:", err.message);
  console.error(err.stack);
}
