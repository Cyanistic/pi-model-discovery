import { readFileSync } from "node:fs";

const files = ["package.json", "config.schema.json", "config/config.example.json"];
for (const file of files) {
  JSON.parse(readFileSync(file, "utf-8"));
}
