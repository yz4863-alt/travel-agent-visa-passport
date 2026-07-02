#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UN_MEMBER_STATE_PASSPORTS } from "./unMemberStates.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const allowedStatuses = new Set(["visa-free", "evisa", "visa-on-arrival", "visa-required", "unknown"]);
const expectedSlugs = new Set(UN_MEMBER_STATE_PASSPORTS.map((passport) => slugify(passport.passport)));

const requiredFiles = [
  "index.html",
  "src/app.js",
  "src/styles.css",
  "data/world/countries.geojson",
  "data/passports/index.json",
  "README.md",
];

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

async function main() {
  await Promise.all(requiredFiles.map(assertFile));

  const index = await readJson("data/passports/index.json");
  if (!Array.isArray(index.passports) || index.passports.length !== expectedSlugs.size) {
    throw new Error(`data/passports/index.json must list all ${expectedSlugs.size} UN member-state passports.`);
  }

  for (const slug of expectedSlugs) {
    if (!index.passports.some((passport) => passport.slug === slug)) {
      throw new Error(`data/passports/index.json is missing ${slug}.`);
    }
  }

  const geojson = await readJson("data/world/countries.geojson");
  if (geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features) || geojson.features.length < 100) {
    throw new Error("data/world/countries.geojson must be a full FeatureCollection.");
  }

  for (const passport of index.passports) {
    const data = await readJson(`data/passports/${passport.slug}.json`);
    const countries = Object.entries(data.countries || {});
    if (countries.length < 50) {
      throw new Error(`${passport.slug}.json has too few country records.`);
    }

    for (const [name, entry] of countries) {
      if (!allowedStatuses.has(entry.status)) {
        throw new Error(`${passport.slug}.json has invalid status "${entry.status}" for ${name}.`);
      }
      if (name === "Hong Kong" || name === "Macau" || name === "Macao" || name === "Taiwan") {
        throw new Error(`${passport.slug}.json must use the approved display name for ${name}.`);
      }

      const text = JSON.stringify(entry);
      if (/\bHong Kong\b(?! SAR, China)|\bMacau\b(?! SAR, China)|\bMacao\b|\bTaiwan\b(?! \(Province of China\))/i.test(text)) {
        throw new Error(`${passport.slug}.json has non-normalized one-China text in ${name}.`);
      }
    }
  }

  console.log(`Static site validation passed for ${index.passports.length} passports and ${geojson.features.length} map features.`);
}

async function assertFile(relativePath) {
  const fullPath = path.join(root, relativePath);
  const stat = await fs.stat(fullPath);
  if (!stat.isFile()) {
    throw new Error(`${relativePath} is not a file.`);
  }
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(root, relativePath), "utf8"));
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
