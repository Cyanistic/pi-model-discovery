import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["src", "test"];
const forbidden = /\bconsole\s*\.|\bprocess\s*\.\s*(stdout|stderr)\s*\./;
const matches = [];

function scan(path) {
  const stat = statSync(path);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) scan(join(path, entry));
    return;
  }
  if (!/\.[cm]?tsx?$/.test(path)) return;
  const content = readFileSync(path, "utf-8");
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (forbidden.test(line)) matches.push(`${path}:${index + 1}`);
  });
}

for (const root of roots) scan(root);

if (matches.length > 0) {
  throw new Error(`Terminal output APIs are forbidden in extension source/tests: ${matches.join(", ")}`);
}
