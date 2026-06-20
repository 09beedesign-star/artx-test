#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceDir = path.join(root, "server/skills");
const outputDir = path.join(root, "dist/skills");

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

const files = fs.readdirSync(sourceDir).filter((file) => file.endsWith(".md")).sort();

for (const file of files) {
  fs.copyFileSync(path.join(sourceDir, file), path.join(outputDir, file));
}

console.log(`Copied ${files.length} skill MD files to dist/skills.`);
