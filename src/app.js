import { flagImageUrl, stripFlag } from "./countryFlags.js";

document.querySelector("#bootNotice")?.setAttribute("hidden", "");

const STATUS_META = {
  "visa-free": {
    label: "Visa-free",
    color: "var(--visa-free)",
  },
  evisa: {
    label: "eVisa",
    color: "var(--evisa)",
  },
  "visa-on-arrival": {
    label: "Visa on arrival",
    color: "var(--arrival)",
  },
  "visa-required": {
    label: "Visa required / unknown",
    color: "var(--required)",
  },
  unknown: {
    label: "Visa required / unknown",
    color: "var(--unknown)",
  },
};

const BOOSTERS = {
  us: "US visa",
  schengen: "Schengen visa",
  uk: "UK visa",
  canada: "Canada visa",
};

const BOOSTER_DIRECT_ACCESS = {
  us: {
    countries: ["United States", "United States of America"],
    requirement: "Additional access with a valid US visa",
  },
  schengen: {
    countries: [
      "Austria",
      "Belgium",
      "Bulgaria",
      "Croatia",
      "Czech Republic",
      "Denmark",
      "Estonia",
      "Finland",
      "France",
      "Germany",
      "Greece",
      "Hungary",
      "Iceland",
      "Italy",
      "Latvia",
      "Liechtenstein",
      "Lithuania",
      "Luxembourg",
      "Malta",
      "Netherlands",
      "Norway",
      "Poland",
      "Portugal",
      "Romania",
      "Slovakia",
      "Slovenia",
      "Spain",
      "Sweden",
      "Switzerland",
    ],
    requirement: "Additional access with a valid Schengen visa",
  },
  uk: {
    countries: ["United Kingdom"],
    requirement: "Additional access with a valid UK visa",
  },
  canada: {
    countries: ["Canada"],
    requirement: "Additional access with a valid Canada visa",
  },
};

const MAP_WIDTH = 960;
const MAP_HEIGHT = 500;
const OVERVIEW_PADDING_LEFT = 6;
const OVERVIEW_PADDING_RIGHT = 82;
const OVERVIEW_PADDING_TOP = 14;
const OVERVIEW_PADDING_BOTTOM = 42;
const MIN_ZOOM = 1;
const MAX_ZOOM = 9;
const DATA_REFRESH_ENDPOINT = window.AI_TRAVEL_AGENT_REFRESH_ENDPOINT || "";

const COUNTRY_ALIASES = {
  "United States of America": ["United States"],
  Australia: ["Australia", "Australia and territories"],
  "Democratic Republic of the Congo": ["DR Congo", "Democratic Republic of the Congo"],
  "Republic of Congo": ["Republic of the Congo", "Congo"],
  Congo: ["Republic of the Congo"],
  "Czech Republic": ["Czechia"],
  "Dominican Rep.": ["Dominican Republic"],
  "Central African Rep.": ["Central African Republic"],
  "Eq. Guinea": ["Equatorial Guinea"],
  "Solomon Is.": ["Solomon Islands"],
  "S. Sudan": ["South Sudan"],
  "Bosnia and Herz.": ["Bosnia and Herzegovina"],
  "North Macedonia": ["North Macedonia", "Macedonia"],
  Macedonia: ["North Macedonia"],
  "Cote d'Ivoire": ["Ivory Coast", "Cote d'Ivoire", "Côte d'Ivoire"],
  "Ivory Coast": ["Côte d'Ivoire", "Ivory Coast"],
  Tanzania: ["Tanzania", "United Republic of Tanzania"],
  "United Republic of Tanzania": ["Tanzania"],
  "The Bahamas": ["Bahamas"],
  Bahamas: ["The Bahamas", "Bahamas"],
  Gambia: ["The Gambia", "Gambia"],
  "The Gambia": ["Gambia"],
  Swaziland: ["Eswatini", "Swaziland"],
  Eswatini: ["Swaziland", "Eswatini"],
  "East Timor": ["Timor-Leste", "East Timor"],
  "Timor-Leste": ["East Timor", "Timor-Leste"],
  Russia: ["Russia", "Russian Federation"],
  "Russian Federation": ["Russia"],
  Syria: ["Syria", "Syrian Arab Republic"],
  "Syrian Arab Republic": ["Syria"],
  Laos: ["Laos", "Lao People's Democratic Republic"],
  "Lao People's Democratic Republic": ["Laos"],
  Moldova: ["Moldova", "Republic of Moldova"],
  "Republic of Moldova": ["Moldova"],
  "South Korea": ["South Korea", "Korea, South"],
  "North Korea": ["North Korea", "Korea, North"],
  "Palestine": ["Palestine", "State of Palestine"],
  "State of Palestine": ["Palestine"],
  Iran: ["Iran", "Iran, Islamic Republic of"],
  "Republic of Serbia": ["Serbia"],
  Serbia: ["Republic of Serbia", "Serbia"],
  "Taiwan": ["Taiwan (Province of China)"],
  "United Kingdom": ["United Kingdom", "United Kingdom and Crown dependencies"],
  "Vatican": ["Vatican City", "Holy See"],
};

const state = {
  index: null,
  geojson: null,
  passportData: null,
  selectedSlug: "",
  selectedCountry: null,
  activeBoosters: new Set(),
  dataLookup: new Map(),
  selectedPath: null,
  selectedFeature: null,
  hoverOutline: null,
  selectionOutline: null,
  centerX: MAP_WIDTH / 2,
  centerY: MAP_HEIGHT / 2,
  zoom: 1,
  renderCenterX: MAP_WIDTH / 2,
  renderCenterY: MAP_HEIGHT / 2,
  renderZoom: 1,
  zoomAnimation: null,
  drag: null,
  passportMatches: [],
  activePassportIndex: -1,
  mapFeatureByName: new Map(),
  mapBounds: null,
};

const els = {
  passportCombobox: document.querySelector("#passportCombobox"),
  passportFlag: document.querySelector("#passportFlag"),
  passportInput: document.querySelector("#passportInput"),
  passportOptions: document.querySelector("#passportOptions"),
  passportApply: document.querySelector("#passportApply"),
  boosterOptions: document.querySelector("#boosterOptions"),
  worldMap: document.querySelector("#worldMap"),
  mapFrame: document.querySelector("#mapFrame"),
  tooltip: document.querySelector("#tooltip"),
  legend: document.querySelector("#legend"),
  sourceChip: document.querySelector("#sourceChip"),
  refreshData: document.querySelector("#refreshData"),
  refreshMessage: document.querySelector("#refreshMessage"),
  summaryTitle: document.querySelector("#summaryTitle"),
  summaryCopy: document.querySelector("#summaryCopy"),
  statsGrid: document.querySelector("#statsGrid"),
  countryName: document.querySelector("#countryName"),
  countryStatus: document.querySelector("#countryStatus"),
  countryStay: document.querySelector("#countryStay"),
  countryRequirement: document.querySelector("#countryRequirement"),
  countryNotes: document.querySelector("#countryNotes"),
  zoomOut: document.querySelector("#zoomOut"),
  zoomReset: document.querySelector("#zoomReset"),
  zoomIn: document.querySelector("#zoomIn"),
};

init().catch((error) => {
  console.error(error);
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div class="app-error">AI Travel Agent could not load its local data files. ${escapeHtml(error.message)}</div>`,
  );
});

async function init() {
  renderLegend();
  renderBoosters();
  bindEvents();

  const [index, geojson] = await Promise.all([
    fetchJson("data/passports/index.json"),
    fetchJson("data/world/countries.geojson"),
  ]);

  state.index = index;
  state.geojson = geojson;

  populatePassportOptions(index.passports);
  const defaultPassport = index.passports.find((passport) => passport.slug === "united-kingdom") || index.passports[0];
  await loadPassport(defaultPassport.slug);
  renderMap();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.json();
}

function bindEvents() {
  els.passportApply.addEventListener("click", applyPassportInput);
  els.passportInput.addEventListener("focus", () => {
    els.passportInput.select();
    renderPassportMenu({ showAll: true });
    openPassportMenu();
  });
  els.passportInput.addEventListener("input", () => {
    els.passportInput.setCustomValidity("");
    updatePassportFlag(els.passportInput.value);
    renderPassportMenu();
    openPassportMenu();
  });
  els.passportInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      movePassportSelection(event.key === "ArrowDown" ? 1 : -1);
      return;
    }

    if (event.key === "Escape") {
      closePassportMenu();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (!els.passportOptions.hidden && state.passportMatches[state.activePassportIndex]) {
        choosePassport(state.passportMatches[state.activePassportIndex].slug);
      } else {
        applyPassportInput();
      }
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!els.passportCombobox.contains(event.target)) {
      closePassportMenu();
    }
  });

  els.zoomIn.addEventListener("click", () => zoomBy(1.35));
  els.zoomOut.addEventListener("click", () => zoomBy(1 / 1.35));
  els.zoomReset.addEventListener("click", resetZoom);
  els.refreshData.addEventListener("click", requestDataRefresh);

  els.mapFrame.addEventListener("wheel", onWheel, { passive: false });
  els.mapFrame.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("resize", onMapResize);
}

function populatePassportOptions(passports) {
  state.passportMatches = passports;
  renderPassportMenu();
}

function renderPassportMenu(options = {}) {
  if (!state.index) {
    return;
  }

  const matches = options.showAll ? state.index.passports : filteredPassports();
  state.passportMatches = matches;
  state.activePassportIndex = matches.length ? clamp(state.activePassportIndex, 0, matches.length - 1) : -1;

  els.passportOptions.innerHTML = matches.length
    ? matches
        .map((passport, index) => {
          const active = index === state.activePassportIndex ? "is-active" : "";
          return `
            <button
              class="passport-option ${active}"
              type="button"
              role="option"
              aria-selected="${index === state.activePassportIndex}"
              data-slug="${escapeHtml(passport.slug)}"
            >
              ${flagMarkup(passport.passport)}
              <span>${escapeHtml(passport.passport)}</span>
            </button>
          `;
        })
        .join("")
    : `<div class="passport-empty">No matching passport in the current dataset.</div>`;

  els.passportOptions.querySelectorAll(".passport-option").forEach((option, index) => {
    option.addEventListener("pointerenter", () => setActivePassportIndex(index));
    option.addEventListener("click", () => choosePassport(option.dataset.slug));
  });
}

function filteredPassports() {
  const query = normalizeText(stripFlag(els.passportInput.value));
  const passports = state.index?.passports || [];
  if (!query) {
    return passports;
  }

  const startsWith = [];
  const contains = [];
  passports.forEach((passport) => {
    const passportName = normalizeText(passport.passport);
    const nationality = normalizeText(passport.nationality || "");
    if (passportName.startsWith(query) || nationality.startsWith(query)) {
      startsWith.push(passport);
    } else if (passportName.includes(query) || nationality.includes(query)) {
      contains.push(passport);
    }
  });

  return [...startsWith, ...contains];
}

function findPassportByInput(value) {
  const normalized = normalizeText(stripFlag(value));
  return state.index?.passports.find((item) => {
    return normalizeText(item.passport) === normalized || normalizeText(item.nationality || "") === normalized;
  });
}

function openPassportMenu() {
  els.passportOptions.hidden = false;
  els.passportInput.setAttribute("aria-expanded", "true");
}

function closePassportMenu() {
  els.passportOptions.hidden = true;
  els.passportInput.setAttribute("aria-expanded", "false");
  state.activePassportIndex = 0;
}

function movePassportSelection(direction) {
  if (els.passportOptions.hidden) {
    renderPassportMenu();
    openPassportMenu();
  }

  if (!state.passportMatches.length) {
    return;
  }

  const nextIndex = (state.activePassportIndex + direction + state.passportMatches.length) % state.passportMatches.length;
  setActivePassportIndex(nextIndex);
}

function setActivePassportIndex(index) {
  state.activePassportIndex = index;
  els.passportOptions.querySelectorAll(".passport-option").forEach((option, optionIndex) => {
    const active = optionIndex === index;
    option.classList.toggle("is-active", active);
    option.setAttribute("aria-selected", String(active));
    if (active) {
      option.scrollIntoView({ block: "nearest" });
    }
  });
}

function updatePassportFlag(countryName) {
  els.passportFlag.innerHTML = flagMarkup(countryName, "flag-icon input-flag-image");
}

function flagMarkup(countryName, className = "flag-icon") {
  const src = flagImageUrl(countryName);
  if (!src) {
    return `<span class="${className} flag-placeholder" aria-hidden="true"></span>`;
  }

  return `<img class="${className}" src="${escapeHtml(src)}" alt="" loading="lazy" decoding="async">`;
}

function countryTitleMarkup(countryName, suffix = "", displayText = countryName) {
  return `<span class="title-with-flag">${flagMarkup(countryName)}<span>${escapeHtml(displayText)}${escapeHtml(suffix)}</span></span>`;
}

async function applyPassportInput() {
  const passport = findPassportByInput(els.passportInput.value) || state.passportMatches[0];

  if (!passport) {
    els.passportInput.setCustomValidity("Choose a passport from the available data.");
    els.passportInput.reportValidity();
    return;
  }

  els.passportInput.setCustomValidity("");
  await choosePassport(passport.slug);
}

async function choosePassport(slug) {
  await loadPassport(slug);
  renderMap();
  closePassportMenu();
}

async function loadPassport(slug) {
  const passportMeta = state.index.passports.find((item) => item.slug === slug);
  if (!passportMeta) {
    throw new Error(`Unknown passport slug: ${slug}`);
  }

  const data = await fetchJson(`data/passports/${slug}.json`);
  state.selectedSlug = slug;
  state.passportData = data;
  state.selectedCountry = null;
  state.selectedPath = null;
  state.selectedFeature = null;
  updateSelectionOutline();
  state.activeBoosters.clear();
  state.dataLookup = buildDataLookup(data.countries);

  els.passportInput.value = passportMeta.passport;
  updatePassportFlag(passportMeta.passport);
  renderBoosters();
  renderSummary();
  renderCountryDetails();
}

function buildDataLookup(countries) {
  const lookup = new Map();
  Object.entries(countries || {}).forEach(([name, entry]) => {
    lookup.set(normalizeCountryKey(name), { name, entry: normalizeEntry(entry) });
  });
  return lookup;
}

function renderLegend() {
  const items = [
    ["visa-free", STATUS_META["visa-free"].label],
    ["evisa", STATUS_META.evisa.label],
    ["visa-on-arrival", STATUS_META["visa-on-arrival"].label],
    ["visa-required", "Visa required / unknown"],
  ];

  els.legend.innerHTML = items
    .map(
      ([status, label]) =>
        `<span class="legend-item"><span class="swatch" style="background:${STATUS_META[status].color}"></span>${label}</span>`,
    )
    .join("");

  els.legend.insertAdjacentHTML(
    "beforeend",
    `<span class="legend-item"><span class="swatch boost"></span>Additional access</span>
    <span class="legend-item"><span class="swatch origin"></span>Passport country/region</span>`,
  );
}

function renderBoosters() {
  const enhancementData = state.passportData?.visaEnhancements || {};
  els.boosterOptions.innerHTML = Object.entries(BOOSTERS)
    .map(([key, label]) => {
      const count = countBoosterCountries(key, enhancementData[key]?.countries || {});
      const disabled = state.passportData && count === 0 ? "disabled" : "";
      const countLabel = count > 0 ? ` (${count})` : "";
      return `
        <label class="booster-toggle">
          <input type="checkbox" value="${key}" ${disabled}>
          <span>${label}${countLabel}</span>
        </label>
      `;
    })
    .join("");

  els.boosterOptions.querySelectorAll("input").forEach((input) => {
    input.checked = state.activeBoosters.has(input.value);
    input.addEventListener("change", () => {
      if (input.checked) {
        state.activeBoosters.add(input.value);
      } else {
        state.activeBoosters.delete(input.value);
      }
      updateCountryStyles();
      renderSummary();
      if (state.selectedCountry) {
        state.selectedCountry = getAccessForMapName(state.selectedFeature?.properties?.name || state.selectedCountry.dataName);
        renderCountryDetails(state.selectedCountry);
      }
    });
  });
}

function countBoosterCountries(key, enhancementCountries) {
  const countries = new Set(Object.keys(enhancementCountries).map(normalizeCountryKey));
  (BOOSTER_DIRECT_ACCESS[key]?.countries || []).forEach((countryName) => {
    countries.add(normalizeCountryKey(countryName));
  });
  return countries.size;
}

function renderMap() {
  const mapLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  mapLayer.setAttribute("id", "mapLayer");

  const fragment = document.createDocumentFragment();
  const features = state.geojson.features.filter((feature) => {
    return feature.properties?.name !== "Antarctica";
  });
  state.mapFeatureByName = new Map();
  state.mapBounds = calculateFeatureBounds(features);

  features.forEach((feature) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const mapName = feature.properties?.name || "Unknown";
    state.mapFeatureByName.set(mapName, feature);
    path.setAttribute("d", featureToPath(feature));
    path.setAttribute("tabindex", "0");
    path.setAttribute("role", "button");
    path.dataset.mapName = mapName;
    path.setAttribute("aria-label", formatCountryName(mapName));
    path.classList.add("country");

    path.addEventListener("pointerenter", (event) => showTooltip(event, feature));
    path.addEventListener("mouseenter", (event) => showTooltip(event, feature));
    path.addEventListener("pointermove", (event) => moveTooltip(event));
    path.addEventListener("mousemove", (event) => moveTooltip(event));
    path.addEventListener("pointerleave", hideTooltip);
    path.addEventListener("mouseleave", hideTooltip);
    path.addEventListener("focus", () => updateHoverOutline(feature));
    path.addEventListener("blur", () => updateHoverOutline(null));
    path.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectCountry(feature, path);
      }
    });

    fragment.append(path);
  });

  mapLayer.append(fragment);
  const hoverOutline = document.createElementNS("http://www.w3.org/2000/svg", "path");
  hoverOutline.setAttribute("class", "hover-outline");
  hoverOutline.setAttribute("aria-hidden", "true");
  hoverOutline.setAttribute("display", "none");
  state.hoverOutline = hoverOutline;

  const outline = document.createElementNS("http://www.w3.org/2000/svg", "path");
  outline.setAttribute("class", "selection-outline");
  outline.setAttribute("aria-hidden", "true");
  outline.setAttribute("display", "none");
  state.selectionOutline = outline;

  els.worldMap.replaceChildren(mapLayer, hoverOutline, outline);
  resetZoom({ animate: false });
  updateCountryStyles();
}

function updateCountryStyles() {
  els.worldMap.querySelectorAll(".country").forEach((path) => {
    const access = getDisplayAccessForMapName(path.dataset.mapName);
    const status = access.displayEntry.status || "unknown";
    path.className.baseVal = `country ${status}`;
    if (access.isBoosted) {
      path.classList.add("is-boosted");
    }
    if (isPassportOrigin(path.dataset.mapName)) {
      path.classList.add("is-passport-origin");
    }
    if (path === state.selectedPath) {
      path.classList.add("is-selected");
    }
  });
}

function selectCountry(feature, path) {
  if (state.selectedPath === path) {
    state.selectedPath.classList.remove("is-selected");
    state.selectedPath = null;
    state.selectedFeature = null;
    state.selectedCountry = null;
    updateSelectionOutline(null);
    renderCountryDetails();
    return;
  }

  if (state.selectedPath) {
    state.selectedPath.classList.remove("is-selected");
  }
  state.selectedPath = path;
  state.selectedFeature = feature;
  state.selectedPath.classList.add("is-selected");
  state.selectedCountry = getAccessForMapName(feature.properties?.name || "");
  updateSelectionOutline(feature);
  renderCountryDetails(state.selectedCountry);
}

function showTooltip(event, feature) {
  const access = getDisplayAccessForMapName(feature.properties?.name || "");
  const label = access.isBoosted
    ? `${statusLabel(access.displayEntry.status)} with ${BOOSTERS[access.booster]}`
    : statusLabel(access.displayEntry.status);

  els.tooltip.innerHTML = `
    <strong>${escapeHtml(access.displayName)}</strong>
    <span>${escapeHtml(label)}</span>
  `;
  els.tooltip.hidden = false;
  updateHoverOutline(feature);
  moveTooltip(event);
}

function moveTooltip(event) {
  const frameRect = els.mapFrame.getBoundingClientRect();
  const x = Math.min(event.clientX - frameRect.left + 14, frameRect.width - 270);
  const y = Math.min(event.clientY - frameRect.top + 14, frameRect.height - 80);
  els.tooltip.style.left = `${Math.max(10, x)}px`;
  els.tooltip.style.top = `${Math.max(10, y)}px`;
}

function hideTooltip() {
  els.tooltip.hidden = true;
  updateHoverOutline(null);
}

function renderSummary() {
  const passport = state.passportData;
  if (!passport) {
    return;
  }

  const stats = calculateDisplayedStats();
  const boostedCount = countActiveBoostedCountries();
  const totalAccessible = stats["visa-free"] + stats.evisa + stats["visa-on-arrival"];
  const passportMeta = state.index?.passports.find((item) => item.slug === state.selectedSlug);
  const passportLabel = passportMeta?.nationality || passport.passport;

  els.sourceChip.textContent = `${passport.source} data refreshed ${passport.lastUpdated}`;
  els.summaryTitle.innerHTML = countryTitleMarkup(passport.passport, " Passport", passportLabel);
  els.summaryCopy.textContent =
    boostedCount > 0
      ? `${totalAccessible} mapped destinations have direct access categories, with ${boostedCount} additional conditional entries highlighted from selected visas.`
      : `${totalAccessible} mapped destinations have visa-free, eVisa, or visa-on-arrival access in the current dataset.`;

  const statItems = [
    ["visa-free", stats["visa-free"], STATUS_META["visa-free"].label],
    ["evisa", stats.evisa, STATUS_META.evisa.label],
    ["visa-on-arrival", stats["visa-on-arrival"], STATUS_META["visa-on-arrival"].label],
    ["visa-required", stats["visa-required"] + stats.unknown, "Required / unknown"],
  ];

  els.statsGrid.innerHTML = statItems
    .map(
      ([status, value, label]) => `
        <div class="stat-card">
          <p class="stat-value" style="color:${STATUS_META[status].color}">${value}</p>
          <p class="stat-label">${label}</p>
        </div>
      `,
    )
    .join("");
}

async function requestDataRefresh() {
  if (!DATA_REFRESH_ENDPOINT) {
    if (!els.refreshMessage.hidden) {
      hideRefreshMessage();
      return;
    }

    showRefreshMessage(
      "Demo mode: this button shows how a live AI-assisted refresh could work. In production, it could start a protected job that reads the latest Wikipedia tables, checks the results, updates the JSON data, and redeploys the site. For this static demo, the owner refreshes data with npm run update:data -- --resume, then validates and redeploys.",
      "info",
    );
    return;
  }

  els.refreshData.disabled = true;
  els.refreshData.setAttribute("aria-busy", "true");
  showRefreshMessage("Requesting a full Wikipedia data refresh...", "pending");

  try {
    const response = await fetch(DATA_REFRESH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: "all-passports",
        requestedAt: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Refresh endpoint returned ${response.status}`);
    }

    showRefreshMessage(
      "Refresh request sent. Updated visa data will appear after the data job finishes and the static site redeploys.",
      "success",
    );
  } catch (error) {
    console.error(error);
    showRefreshMessage(
      "Refresh request could not be sent. Run npm run update:data -- --resume locally, then validate and redeploy.",
      "error",
    );
  } finally {
    els.refreshData.disabled = false;
    els.refreshData.removeAttribute("aria-busy");
  }
}

function showRefreshMessage(message, tone) {
  els.refreshMessage.textContent = message;
  els.refreshMessage.dataset.tone = tone;
  els.refreshMessage.hidden = false;
}

function hideRefreshMessage() {
  els.refreshMessage.textContent = "";
  els.refreshMessage.removeAttribute("data-tone");
  els.refreshMessage.hidden = true;
}

function renderCountryDetails(access = null) {
  if (!access) {
    els.countryName.innerHTML = "No country selected";
    els.countryStatus.textContent = "Pick a country on the map";
    els.countryStatus.className = "status-pill";
    els.countryStay.textContent = "-";
    els.countryRequirement.textContent = "-";
    els.countryNotes.textContent = "Click any country to view the mapped entry condition.";
    return;
  }

  const displayAccess = withDisplayAccess(access);
  const displayEntry = displayAccess.displayEntry;

  els.countryName.innerHTML = countryTitleMarkup(access.displayName);
  els.countryStatus.textContent = displayAccess.isBoosted
    ? `${statusLabel(displayEntry.status)} with ${BOOSTERS[displayAccess.booster]}`
    : statusLabel(displayEntry.status);
  els.countryStatus.className = `status-pill ${displayEntry.status || "unknown"}`;
  els.countryStay.textContent = displayEntry.stay || "Not specified";
  els.countryRequirement.textContent = displayEntry.requirement || statusLabel(displayEntry.status);
  els.countryNotes.textContent = displayEntry.notes || "Verify current entry rules with official sources before booking.";
}

function calculateStats(countries) {
  const stats = {
    "visa-free": 0,
    evisa: 0,
    "visa-on-arrival": 0,
    "visa-required": 0,
    unknown: 0,
  };

  Object.values(countries || {}).forEach((entry) => {
    const status = normalizeEntry(entry).status;
    stats[stats[status] === undefined ? "unknown" : status] += 1;
  });

  return stats;
}

function calculateDisplayedStats() {
  const stats = {
    "visa-free": 0,
    evisa: 0,
    "visa-on-arrival": 0,
    "visa-required": 0,
    unknown: 0,
  };

  const features = state.geojson?.features || [];
  features
    .filter((feature) => feature.properties?.name !== "Antarctica")
    .forEach((feature) => {
      const access = getDisplayAccessForMapName(feature.properties?.name || "");
      const status = access.displayEntry.status || "unknown";
      stats[stats[status] === undefined ? "unknown" : status] += 1;
    });

  return stats;
}

function countActiveBoostedCountries() {
  const features = state.geojson?.features || [];
  return features
    .filter((feature) => feature.properties?.name !== "Antarctica")
    .filter((feature) => getDisplayAccessForMapName(feature.properties?.name || "").isBoosted).length;
}

function getAccessForMapName(mapName) {
  const candidates = [mapName, formatCountryName(mapName), ...(COUNTRY_ALIASES[mapName] || [])];
  for (const candidate of candidates) {
    const match = state.dataLookup.get(normalizeCountryKey(candidate));
    if (match) {
      return {
        dataName: match.name,
        displayName: formatCountryRegionName(match.name),
        entry: match.entry,
      };
    }
  }

  return {
    dataName: formatCountryName(mapName),
    displayName: formatCountryRegionName(mapName),
    entry: { status: "unknown", requirement: "Visa required / unknown", stay: "", notes: "" },
  };
}

function getDisplayAccessForMapName(mapName) {
  return withDisplayAccess(getAccessForMapName(mapName));
}

function isPassportOrigin(mapName) {
  const passportName = state.passportData?.passport;
  if (!passportName) {
    return false;
  }

  return countryNamesMatch(mapName, passportName);
}

function countryNamesMatch(leftName, rightName) {
  const leftKeys = expandedCountryKeys(leftName);
  const rightKeys = expandedCountryKeys(rightName);
  return [...leftKeys].some((key) => rightKeys.has(key));
}

function expandedCountryKeys(name) {
  const normalized = normalizeCountryKey(name);
  const candidates = new Set([name, formatCountryName(name), ...(COUNTRY_ALIASES[name] || [])]);
  const formattedAliases = COUNTRY_ALIASES[formatCountryName(name)] || [];
  formattedAliases.forEach((alias) => candidates.add(alias));

  Object.entries(COUNTRY_ALIASES).forEach(([canonical, aliases]) => {
    const group = [canonical, ...aliases];
    if (group.some((candidate) => normalizeCountryKey(candidate) === normalized)) {
      group.forEach((candidate) => candidates.add(candidate));
    }
  });

  return new Set([...candidates].map(normalizeCountryKey).filter(Boolean));
}

function withDisplayAccess(access) {
  const booster = getActiveBooster(access.dataName);
  const boosterEntry = booster ? getBoosterEntry(booster, access.dataName) : null;
  const boostedDisplayEntry = boosterEntry
    ? {
        ...boosterEntry,
        status: "visa-free",
        requirement: boosterEntry.requirement || `Additional access with ${BOOSTERS[booster]}`,
      }
    : null;

  return {
    ...access,
    booster,
    displayEntry: boostedDisplayEntry || access.entry,
    isBoosted: Boolean(boosterEntry),
  };
}

function getActiveBooster(countryName) {
  for (const key of state.activeBoosters) {
    if (getBoosterEntry(key, countryName)) {
      return key;
    }
  }
  return null;
}

function getBoosterEntry(key, countryName) {
  const directAccess = getBoosterDirectAccess(key, countryName);
  if (directAccess) {
    return directAccess;
  }

  const countries = state.passportData?.visaEnhancements?.[key]?.countries || {};
  const exact = countries[countryName];
  if (exact) {
    return normalizeEntry(exact);
  }

  const normalized = normalizeCountryKey(countryName);
  const match = Object.entries(countries).find(([name]) => normalizeCountryKey(name) === normalized);
  return match ? normalizeEntry(match[1]) : null;
}

function getBoosterDirectAccess(key, countryName) {
  const booster = BOOSTER_DIRECT_ACCESS[key];
  if (!booster) {
    return null;
  }

  const match = booster.countries.some((candidate) => countryNamesMatch(candidate, countryName));
  if (!match) {
    return null;
  }

  return {
    status: "visa-free",
    requirement: booster.requirement,
    stay: "",
    notes: "Highlighted because this additional visa is selected.",
  };
}

function isBoosted(countryName) {
  return Boolean(getActiveBooster(countryName));
}

function normalizeEntry(entry) {
  if (typeof entry === "string") {
    return { status: entry, requirement: statusLabel(entry), stay: "", notes: "" };
  }

  return {
    status: STATUS_META[entry?.status] ? entry.status : "unknown",
    requirement: entry?.requirement || "",
    stay: entry?.stay || "",
    notes: entry?.notes || "",
  };
}

function statusLabel(status) {
  return STATUS_META[status]?.label || STATUS_META.unknown.label;
}

function formatCountryName(name) {
  const clean = String(name || "").trim();
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

function formatCountryRegionName(name) {
  const formatted = formatCountryName(name);
  return normalizeCountryKey(formatted) === "china" ? "China (Mainland)" : formatted;
}

function normalizeCountryKey(name) {
  return normalizeText(formatCountryName(name))
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeText(value) {
  return String(value || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function calculateFeatureBounds(features) {
  const bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };

  features.forEach((feature) => {
    walkCoordinates(feature.geometry?.coordinates, ([lon, lat]) => {
      const [x, y] = project(lon, lat);
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    });
  });

  if (!Number.isFinite(bounds.minX)) {
    return { x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT };
  }

  return {
    x: bounds.minX,
    y: bounds.minY,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
  };
}

function walkCoordinates(coordinates, visitor) {
  if (!Array.isArray(coordinates)) {
    return;
  }

  if (typeof coordinates[0] === "number") {
    visitor(coordinates);
    return;
  }

  coordinates.forEach((item) => walkCoordinates(item, visitor));
}

function featureToPath(feature) {
  const geometry = feature.geometry;
  if (!geometry) {
    return "";
  }

  if (geometry.type === "Polygon") {
    return polygonToPath(geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.map(polygonToPath).join(" ");
  }

  return "";
}

function polygonToPath(polygon) {
  return polygon
    .map((ring) => {
      return ring
        .map(([lon, lat], index) => {
          const [x, y] = project(lon, lat);
          return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" ")
        .concat(" Z");
    })
    .join(" ");
}

function project(lon, lat) {
  const x = ((lon + 180) / 360) * MAP_WIDTH;
  const y = ((90 - lat) / 180) * MAP_HEIGHT;
  return [x, y];
}

function zoomBy(factor, anchorEvent = null) {
  const previousBox = targetViewBox();
  const nextZoom = clamp(state.zoom * factor, MIN_ZOOM, MAX_ZOOM);

  if (anchorEvent) {
    const overview = overviewViewBox();
    const frameRect = els.mapFrame.getBoundingClientRect();
    const ratioX = clamp((anchorEvent.clientX - frameRect.left) / frameRect.width, 0, 1);
    const ratioY = clamp((anchorEvent.clientY - frameRect.top) / frameRect.height, 0, 1);
    const anchorX = previousBox.x + ratioX * previousBox.width;
    const anchorY = previousBox.y + ratioY * previousBox.height;
    const nextWidth = overview.width / nextZoom;
    const nextHeight = overview.height / nextZoom;
    state.centerX = anchorX + (0.5 - ratioX) * nextWidth;
    state.centerY = anchorY + (0.5 - ratioY) * nextHeight;
  }

  state.zoom = nextZoom;
  constrainView();
  animateViewBox();
}

function resetZoom(options = {}) {
  const { animate = true } = options;
  const overview = overviewViewBox();
  if (state.zoomAnimation) {
    cancelAnimationFrame(state.zoomAnimation);
    state.zoomAnimation = null;
  }
  state.zoom = 1;
  state.centerX = overview.x + overview.width / 2;
  state.centerY = overview.y + overview.height / 2;
  state.renderZoom = 1;
  state.renderCenterX = state.centerX;
  state.renderCenterY = state.centerY;
  applyViewBox(true);
  if (animate) {
    animateViewBox();
  }
}

function onWheel(event) {
  event.preventDefault();
  const factor = Math.exp(-event.deltaY * 0.0018);
  zoomBy(factor, event);
}

function onMapResize() {
  if (!state.geojson) {
    return;
  }

  if (state.zoom === 1) {
    resetZoom({ animate: false });
    return;
  }

  constrainView();
  applyViewBox(true);
}

function onPointerDown(event) {
  if (event.target.closest("button")) {
    return;
  }
  const targetPath = event.target.closest?.(".country") || null;
  els.mapFrame.setPointerCapture?.(event.pointerId);
  const box = targetViewBox();
  state.drag = {
    startX: event.clientX,
    startY: event.clientY,
    centerX: state.centerX,
    centerY: state.centerY,
    width: box.width,
    height: box.height,
    moved: false,
    targetPath,
    targetFeature: targetPath ? state.mapFeatureByName.get(targetPath.dataset.mapName) : null,
  };
}

function onPointerMove(event) {
  if (!state.drag) {
    return;
  }
  const dx = event.clientX - state.drag.startX;
  const dy = event.clientY - state.drag.startY;
  if (Math.abs(dx) + Math.abs(dy) > 3) {
    state.drag.moved = true;
  }
  state.centerX = state.drag.centerX - dx * (state.drag.width / els.mapFrame.clientWidth);
  state.centerY = state.drag.centerY - dy * (state.drag.height / els.mapFrame.clientHeight);
  constrainView();
  applyViewBox(true);
}

function onPointerUp() {
  if (state.drag && !state.drag.moved && state.drag.targetFeature && state.drag.targetPath) {
    selectCountry(state.drag.targetFeature, state.drag.targetPath);
  }
  state.drag = null;
}

function constrainView() {
  const overview = overviewViewBox();
  const width = overview.width / state.zoom;
  const height = overview.height / state.zoom;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const minX = overview.x;
  const maxX = overview.x + overview.width;
  const minY = overview.y;
  const maxY = overview.y + overview.height;
  const overviewCenterX = overview.x + overview.width / 2;
  const overviewCenterY = overview.y + overview.height / 2;

  if (width >= maxX - minX) {
    state.centerX = overviewCenterX;
  } else {
    state.centerX = clamp(state.centerX, minX + halfWidth, maxX - halfWidth);
  }

  if (height >= maxY - minY) {
    state.centerY = overviewCenterY;
  } else {
    state.centerY = clamp(state.centerY, minY + halfHeight, maxY - halfHeight);
  }
}

function animateViewBox() {
  if (state.zoomAnimation) {
    return;
  }
  const step = () => {
    const zoomDelta = state.zoom - state.renderZoom;
    const xDelta = state.centerX - state.renderCenterX;
    const yDelta = state.centerY - state.renderCenterY;

    state.renderZoom += zoomDelta * 0.24;
    state.renderCenterX += xDelta * 0.24;
    state.renderCenterY += yDelta * 0.24;

    if (Math.abs(zoomDelta) < 0.002 && Math.abs(xDelta) < 0.08 && Math.abs(yDelta) < 0.08) {
      state.renderZoom = state.zoom;
      state.renderCenterX = state.centerX;
      state.renderCenterY = state.centerY;
      state.zoomAnimation = null;
      applyViewBox(false);
      return;
    }

    applyViewBox(false);
    state.zoomAnimation = requestAnimationFrame(step);
  };
  state.zoomAnimation = requestAnimationFrame(step);
}

function applyViewBox(useTarget = false) {
  const box = useTarget ? targetViewBox() : renderViewBox();
  els.worldMap.setAttribute("viewBox", `${box.x.toFixed(3)} ${box.y.toFixed(3)} ${box.width.toFixed(3)} ${box.height.toFixed(3)}`);
}

function targetViewBox() {
  return viewBoxFor(state.zoom, state.centerX, state.centerY);
}

function renderViewBox() {
  return viewBoxFor(state.renderZoom, state.renderCenterX, state.renderCenterY);
}

function viewBoxFor(zoom, centerX, centerY) {
  const overview = overviewViewBox();
  const width = overview.width / zoom;
  const height = overview.height / zoom;
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}

function overviewViewBox() {
  const bounds = state.mapBounds || { x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT };
  const padded = {
    x: bounds.x - OVERVIEW_PADDING_LEFT,
    y: bounds.y - OVERVIEW_PADDING_TOP,
    width: bounds.width + OVERVIEW_PADDING_LEFT + OVERVIEW_PADDING_RIGHT,
    height: bounds.height + OVERVIEW_PADDING_TOP + OVERVIEW_PADDING_BOTTOM,
  };
  const frameAspect = els.mapFrame.clientWidth > 0 && els.mapFrame.clientHeight > 0
    ? els.mapFrame.clientWidth / els.mapFrame.clientHeight
    : MAP_WIDTH / MAP_HEIGHT;
  const paddedAspect = padded.width / padded.height;
  let width = padded.width;
  let height = padded.height;

  if (paddedAspect > frameAspect) {
    height = width / frameAspect;
  } else {
    width = height * frameAspect;
  }

  const centerX = padded.x + padded.width / 2;
  const centerY = padded.y + padded.height / 2;
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}

function updateHoverOutline(feature) {
  if (!state.hoverOutline) {
    return;
  }

  if (!feature) {
    state.hoverOutline.setAttribute("display", "none");
    state.hoverOutline.removeAttribute("d");
    return;
  }

  state.hoverOutline.setAttribute("d", featureToPath(feature));
  state.hoverOutline.removeAttribute("display");
}

function updateSelectionOutline(feature = state.selectedFeature) {
  if (!state.selectionOutline) {
    return;
  }

  if (!feature) {
    state.selectionOutline.setAttribute("display", "none");
    state.selectionOutline.removeAttribute("d");
    return;
  }

  state.selectionOutline.setAttribute("d", featureToPath(feature));
  state.selectionOutline.removeAttribute("display");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
