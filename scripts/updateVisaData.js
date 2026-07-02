#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UN_MEMBER_STATE_PASSPORTS } from "./unMemberStates.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const passportDir = path.join(projectRoot, "data", "passports");
const REQUEST_DELAY_MS = Number(process.env.WIKI_DELAY_MS || 850);
const MAX_FETCH_ATTEMPTS = Number(process.env.WIKI_FETCH_ATTEMPTS || 5);

const PASSPORT_CONFIG = UN_MEMBER_STATE_PASSPORTS.map((config) => ({
  ...config,
  slug: config.slug || slugify(config.passport),
}));

const BOOSTERS = {
  us: {
    label: "US visa",
    patterns: [/\bvalid\s+(?:multiple[-\s]entry\s+)?(?:u\.s\.|us|united states)\s+visa\b/i, /\b(?:u\.s\.|us|united states)\s+visa\b/i],
  },
  schengen: {
    label: "Schengen visa",
    patterns: [/\bschengen\s+(?:area\s+)?visa\b/i, /\bschengen\s+(?:member\s+state|countries|area)\b/i],
  },
  uk: {
    label: "UK visa",
    patterns: [/\bvalid\s+(?:multiple[-\s]entry\s+)?(?:uk|united kingdom|british)\s+visa\b/i, /\b(?:uk|united kingdom)\s+visa\b/i],
  },
  canada: {
    label: "Canada visa",
    patterns: [/\bvalid\s+(?:multiple[-\s]entry\s+)?canad(?:a|ian)\s+visa\b/i, /\bcanada\s+visa\b/i, /\bcanadian\s+visa\b/i],
  },
};

const NAMED_ENTITIES = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  ndash: "-",
  mdash: "-",
  quot: '"',
};

const ACCESS_LANGUAGE =
  /\b(?:visa exempt|visa-free|visa free|visa not required|visa on arrival|may obtain|can obtain|substitut(?:e|ed)|waiver|eligible|allow(?:ed)?|enter|entry|exempt(?:ed)?|without (?:a )?visa)\b/i;

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const flags = new Set(process.argv.slice(2).filter((item) => item.startsWith("--")));
  const resume = flags.has("--resume");
  const requested = process.argv
    .slice(2)
    .filter((item) => !item.startsWith("--"))
    .map((item) => item.toLowerCase());
  const selected =
    requested.length > 0
      ? PASSPORT_CONFIG.filter((item) => {
          return (
            requested.includes(item.slug) ||
            requested.includes(item.passport.toLowerCase()) ||
            requested.includes(item.nationality.toLowerCase())
          );
        })
      : PASSPORT_CONFIG;

  if (selected.length === 0) {
    throw new Error("No matching passports. Use one of: " + PASSPORT_CONFIG.map((item) => item.slug).join(", "));
  }

  await fs.mkdir(passportDir, { recursive: true });
  const generated = [];
  const failures = [];

  for (const config of selected) {
    const outFile = path.join(passportDir, `${config.slug}.json`);

    try {
      if (resume) {
        const existing = await readExistingPassportData(outFile, config);
        if (existing) {
          generated.push(existing);
          console.log(`Using existing ${path.relative(projectRoot, outFile)} (${existing.countryCount} countries)`);
          continue;
        }
      }

      console.log(`Fetching ${config.passport}`);
      const wikipediaPage = await fetchVisaPageForConfig(config);
      const passportData = parseVisaPage(
        {
          ...config,
          pageTitle: wikipediaPage.title,
        },
        wikipediaPage.html,
      );
      await fs.writeFile(outFile, JSON.stringify(passportData, null, 2) + "\n", "utf8");
      generated.push({
        slug: config.slug,
        passport: config.passport,
        nationality: config.nationality,
        source: "Wikipedia",
        sourceUrl: passportData.sourceUrl,
        countryCount: Object.keys(passportData.countries).length,
      });
      console.log(`Wrote ${path.relative(projectRoot, outFile)} (${generated.at(-1).countryCount} countries)`);
    } catch (error) {
      failures.push({ config, message: error.message });
      console.warn(`Skipped ${config.passport}: ${error.message}`);
    }
  }

  if (failures.length > 0) {
    const message = failures.map((failure) => `${failure.config.passport}: ${failure.message}`).join("\n");
    throw new Error(`Could not generate ${failures.length} passport file(s):\n${message}`);
  }

  const index = {
    app: "AI Travel Agent",
    source: "Wikipedia",
    lastUpdated: today(),
    passports: generated,
  };

  await fs.writeFile(path.join(passportDir, "index.json"), JSON.stringify(index, null, 2) + "\n", "utf8");
  console.log(`Wrote ${path.relative(projectRoot, path.join(passportDir, "index.json"))}`);
}

async function readExistingPassportData(outFile, config) {
  try {
    const data = JSON.parse(await fs.readFile(outFile, "utf8"));
    if (!data?.countries || data.slug !== config.slug) {
      return null;
    }

    return {
      slug: config.slug,
      passport: config.passport,
      nationality: config.nationality,
      source: data.source || "Wikipedia",
      sourceUrl: data.sourceUrl,
      countryCount: Object.keys(data.countries).length,
    };
  } catch {
    return null;
  }
}

async function fetchVisaPageForConfig(config) {
  const tried = new Set();
  const candidates = pageTitleCandidates(config);

  for (const pageTitle of candidates) {
    tried.add(pageTitle);
    const result = await fetchWikipediaHtml(pageTitle, { allowMissing: true });
    if (result) {
      return result;
    }
  }

  const searchTitles = await searchWikipediaTitles(config);
  for (const pageTitle of searchTitles) {
    if (tried.has(pageTitle) || !isPlausibleVisaRequirementsTitle(pageTitle, config)) {
      continue;
    }
    tried.add(pageTitle);
    const result = await fetchWikipediaHtml(pageTitle, { allowMissing: true });
    if (result) {
      return result;
    }
  }

  throw new Error(`No Wikipedia visa requirements page found. Tried ${[...tried].join("; ")}`);
}

function pageTitleCandidates(config) {
  const names = unique([config.nationality, ...(config.aliases || []), config.passport]);
  return unique([config.pageTitle, ...names.map((name) => `Visa requirements for ${name} citizens`)]).filter(Boolean);
}

async function searchWikipediaTitles(config) {
  const titles = [];
  const names = unique([config.nationality, ...(config.aliases || []), config.passport]);

  for (const name of names) {
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("list", "search");
    url.searchParams.set("srsearch", `"Visa requirements for" "${name}" citizens`);
    url.searchParams.set("srlimit", "5");
    url.searchParams.set("format", "json");
    url.searchParams.set("origin", "*");

    const response = await fetchWithRetry(url, {
      headers: {
        "user-agent": "AI Travel Agent data updater (local project; Wikipedia-sourced visa data)",
      },
    }, `search for ${name}`);
    if (!response.ok) {
      continue;
    }

    const payload = await response.json();
    for (const result of payload.query?.search || []) {
      if (/^Visa requirements for .+ citizens$/i.test(result.title)) {
        titles.push(result.title);
      }
    }
  }

  return unique(titles);
}

async function fetchWikipediaHtml(pageTitle, options = {}) {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "parse");
  url.searchParams.set("page", pageTitle);
  url.searchParams.set("prop", "text");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  url.searchParams.set("redirects", "1");

  const response = await fetchWithRetry(url, {
    headers: {
      "user-agent": "AI Travel Agent data updater (local project; Wikipedia-sourced visa data)",
    },
  }, pageTitle);

  if (!response.ok) {
    throw new Error(`Wikipedia returned ${response.status} for ${pageTitle}`);
  }

  const payload = await response.json();
  if (payload.error) {
    if (options.allowMissing) {
      return null;
    }
    throw new Error(`${pageTitle}: ${payload.error.info}`);
  }

  const html = payload.parse?.text?.["*"];
  if (!html) {
    throw new Error(`No HTML returned for ${pageTitle}`);
  }
  return {
    title: payload.parse?.title || pageTitle,
    html,
  };
}

async function fetchWithRetry(url, options, label) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    if (REQUEST_DELAY_MS > 0) {
      await delay(REQUEST_DELAY_MS);
    }

    try {
      const response = await fetch(url, options);
      if (response.status !== 429) {
        return response;
      }

      const retryAfter = Number(response.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(60000, 5000 * attempt * attempt);
      console.warn(`Wikipedia rate-limited ${label}; waiting ${Math.round(waitMs / 1000)}s before retry ${attempt}/${MAX_FETCH_ATTEMPTS}.`);
      await delay(waitMs);
      lastError = new Error(`Wikipedia returned 429 for ${label}`);
    } catch (error) {
      lastError = error;
      if (attempt === MAX_FETCH_ATTEMPTS) {
        break;
      }
      await delay(Math.min(30000, 1500 * attempt * attempt));
    }
  }

  throw lastError || new Error(`Fetch failed for ${label}`);
}

function parseVisaPage(config, html) {
  const countries = {};
  const visaEnhancements = Object.fromEntries(
    Object.entries(BOOSTERS).map(([key, booster]) => [
      key,
      {
        label: booster.label,
        countries: {},
      },
    ]),
  );

  const tables = [...html.matchAll(/<table\b[\s\S]*?<\/table>/gi)]
    .map((match) => match[0])
    .filter((table) => /visa requirement/i.test(table) && /(country|territory|destination)/i.test(table));

  for (const table of tables) {
    const rows = [...table.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((match) => match[0]);
    for (const row of rows) {
      const cells = extractCells(row);
      if (cells.length < 2 || isHeaderRow(cells)) {
        continue;
      }

      const country = normalizeCountryName(cells[0]);
      const requirement = normalizeOneChinaText(normalizeRequirement(cells[1]));
      const stay = normalizeOneChinaText(cleanPlainText(cells[2] || ""));
      const notes = normalizeOneChinaText(cleanPlainText(cells.slice(3).join(" ")));
      if (!isCountryRow(country, requirement)) {
        continue;
      }

      const status = classifyRequirement(requirement);
      const entry = {
        status,
        requirement,
        stay,
        notes,
      };

      if (!countries[country]) {
        countries[country] = entry;
      }

      const enhancementMatches = extractVisaEnhancements(requirement, notes);
      for (const key of enhancementMatches) {
        visaEnhancements[key].countries[country] = {
          status: classifyEnhancement(requirement, notes),
          requirement,
          stay,
          notes,
        };
      }
    }
  }

  return {
    passport: config.passport,
    nationality: config.nationality,
    slug: config.slug,
    source: "Wikipedia",
    sourcePage: config.pageTitle,
    sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(config.pageTitle.replaceAll(" ", "_"))}`,
    lastUpdated: today(),
    countries,
    visaEnhancements,
  };
}

function extractCells(row) {
  return [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => cleanHtmlCell(match[1]));
}

function cleanHtmlCell(html) {
  return decodeEntities(
    html
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<sup\b[^>]*class="[^"]*\breference\b[^"]*"[\s\S]*?<\/sup>/gi, " ")
      .replace(/<span\b[^>]*class="[^"]*\bsortkey\b[^"]*"[\s\S]*?<\/span>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/li>/gi, ". ")
      .replace(/<[^>]+>/g, " "),
  );
}

function cleanPlainText(text) {
  return decodeEntities(String(text || ""))
    .replace(/\[\d+]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function decodeEntities(text) {
  return cleanPlainTextWithoutDecode(
    String(text || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity) => {
      if (entity.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      }
      if (entity.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? `&${entity};`;
    }),
  );
}

function cleanPlainTextWithoutDecode(text) {
  return String(text || "")
    .replace(/\[\d+]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function isHeaderRow(cells) {
  return /^(country|territory|destination)$/i.test(cells[0]) || /visa requirement/i.test(cells[0]);
}

function isCountryRow(country, requirement) {
  if (!country || !requirement) {
    return false;
  }

  if (/^(country|territory|destination|dependent|unrecognized|partially recognized|visa requirements)/i.test(country)) {
    return false;
  }

  return /(visa|permit|permission|freedom of movement|electronic|eta|travel restricted|admission refused|required|not required)/i.test(requirement);
}

function normalizeCountryName(name) {
  const clean = cleanPlainText(name)
    .replace(/^flag of\s+/i, "")
    .replace(/\s+\(.*?passport.*?\)$/i, "")
    .trim();

  if (/^hong kong\b/i.test(clean) || /^hong kong sar\b/i.test(clean)) {
    return "Hong Kong SAR, China";
  }
  if (/^macau\b/i.test(clean) || /^macao\b/i.test(clean)) {
    return "Macau SAR, China";
  }
  if (/^taiwan\b/i.test(clean)) {
    return "Taiwan (Province of China)";
  }
  return clean;
}

function normalizeOneChinaText(text) {
  return String(text || "")
    .replace(/\bHong Kong SAR(?:,?\s*China)?\b|\bHong Kong\b/g, "Hong Kong SAR, China")
    .replace(/\bMacau SAR(?:,?\s*China)?\b|\bMacao SAR(?:,?\s*China)?\b|\bMacau\b|\bMacao\b/g, "Macau SAR, China")
    .replace(/\bTaiwan(?:\s*\(Province of China\))?\b/g, "Taiwan (Province of China)");
}

function normalizeRequirement(value) {
  return cleanPlainText(value).replace(/^data-sort-value="\d+"\s*/i, "");
}

function classifyRequirement(requirement) {
  const text = requirement.toLowerCase();

  if (/visa not required|freedom of movement|right to enter|visa-free|visa free/.test(text)) {
    return "visa-free";
  }
  if (/\be[-\s]?visa\b|online visa|electronic visa|electronic travel authori[sz]ation|\beta\b|electronic border system/.test(text)) {
    return "evisa";
  }
  if (/visa on arrival|visitor permit on arrival|tourist card on arrival/.test(text)) {
    return "visa-on-arrival";
  }
  if (/visa required|permit required|permission required|special permit|required|admission refused|travel restricted/.test(text)) {
    return "visa-required";
  }

  return "unknown";
}

function classifyEnhancement(requirement, notes) {
  const text = `${requirement} ${notes}`.toLowerCase();
  if (/\be[-\s]?visa\b|online visa|electronic visa/.test(text)) {
    return "evisa";
  }
  if (/visa on arrival|may obtain (?:a )?visa/.test(text)) {
    return "visa-on-arrival";
  }
  return "visa-free";
}

function extractVisaEnhancements(requirement, notes) {
  const text = `${requirement} ${notes}`;
  if (!ACCESS_LANGUAGE.test(text)) {
    return [];
  }

  return Object.entries(BOOSTERS)
    .filter(([, booster]) => booster.patterns.some((pattern) => pattern.test(text)))
    .map(([key]) => key);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function slugify(value) {
  return normalizeForMatching(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isPlausibleVisaRequirementsTitle(title, config) {
  if (!/^Visa requirements for .+ citizens$/i.test(title)) {
    return false;
  }

  const titleSubject = title.replace(/^Visa requirements for\s+/i, "").replace(/\s+citizens$/i, "");
  const titleKey = normalizeForMatching(titleSubject);
  const candidates = unique([config.nationality, ...(config.aliases || []), config.passport]).map(normalizeForMatching);

  return candidates.some((candidate) => {
    return titleKey === candidate || titleKey.includes(candidate) || candidate.includes(titleKey);
  });
}

function normalizeForMatching(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
