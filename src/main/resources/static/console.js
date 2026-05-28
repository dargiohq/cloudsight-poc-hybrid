const API_BASE = window.location.protocol === "file:" ? "https://poc.cloudsight.dargio.in" : "";
const DEMO_VISIBLE_PROVIDERS = ["AWS", "GCP", "AZURE"];
const VIEW_IDS = [
  "overview",
  "live-test",
  "captured-rows",
  "raw-json",
  "audit-trail",
  "providers",
  "api-explorer",
  "docs",
  "environment",
  "help"
];

const EXPLORER_ENDPOINTS = [
  {
    id: "overview",
    label: "GET /demo/overview",
    method: "GET",
    url: "/demo/overview",
    description: "Returns the live demo snapshot, collector setup, and CloudSight workspace summary."
  },
  {
    id: "captured-rows",
    label: "GET /demo/captured-rows",
    method: "GET",
    url: "/demo/captured-rows",
    description: "Returns the latest CloudSight usage rows available to the playground."
  },
  {
    id: "scenarios",
    label: "GET /demo/scenarios",
    method: "GET",
    url: "/demo/scenarios",
    description: "Lists all modeled scenarios and live proofs."
  },
  {
    id: "live-setup",
    label: "GET /demo/live/setup",
    method: "GET",
    url: "/demo/live/setup",
    description: "Shows live credential readiness for each provider."
  },
  {
    id: "catalogs",
    label: "GET /demo/catalogs",
    method: "GET",
    url: "/demo/catalogs",
    description: "Shows modeled service-family coverage across the providers."
  },
  {
    id: "audit",
    label: "GET /demo/audit",
    method: "GET",
    url: "/demo/audit",
    description: "Returns the recent end-to-end audit events recorded by the demo."
  },
  {
    id: "contract",
    label: "GET /demo/contract",
    method: "GET",
    url: "/demo/contract",
    description: "Shows the collector-first contract, guardrails, and workflow."
  }
];

const heroStats = document.getElementById("heroStats");
const providerTabs = document.getElementById("providerTabs");
const selectedProviderTitle = document.getElementById("selectedProviderTitle");
const selectedProviderStatus = document.getElementById("selectedProviderStatus");
const selectedProviderSummary = document.getElementById("selectedProviderSummary");
const selectedProviderMeta = document.getElementById("selectedProviderMeta");
const scenarioList = document.getElementById("scenarioList");
const selectedScenarioTitle = document.getElementById("selectedScenarioTitle");
const selectedScenarioSummary = document.getElementById("selectedScenarioSummary");
const selectedScenarioBadges = document.getElementById("selectedScenarioBadges");
const flowSteps = document.getElementById("flowSteps");
const runSelectedScenario = document.getElementById("runSelectedScenario");
const runRealtime = document.getElementById("runRealtime");
const runStatusBanner = document.getElementById("runStatusBanner");
const resultSummary = document.getElementById("resultSummary");
const resultNarrative = document.getElementById("resultNarrative");
const latestRowState = document.getElementById("latestRowState");
const latestRowDetail = document.getElementById("latestRowDetail");
const liveAuditTimeline = document.getElementById("liveAuditTimeline");
const capturedProviderFilter = document.getElementById("capturedProviderFilter");
const capturedServiceFilter = document.getElementById("capturedServiceFilter");
const capturedSearchInput = document.getElementById("capturedSearchInput");
const refreshCapturedRows = document.getElementById("refreshCapturedRows");
const capturedRowsMeta = document.getElementById("capturedRowsMeta");
const capturedRowsTableBody = document.getElementById("capturedRowsTableBody");
const resultPanel = document.getElementById("resultPanel");
const auditMatchSummary = document.getElementById("auditMatchSummary");
const auditPanel = document.getElementById("auditPanel");
const refreshAudit = document.getElementById("refreshAudit");
const providersCollectorCards = document.getElementById("providersCollectorCards");
const providersCoverageMatrix = document.getElementById("providersCoverageMatrix");
const explorerMethod = document.getElementById("explorerMethod");
const explorerEndpointSelect = document.getElementById("explorerEndpointSelect");
const explorerRequestHelp = document.getElementById("explorerRequestHelp");
const explorerResponsePanel = document.getElementById("explorerResponsePanel");
const runApiExplorer = document.getElementById("runApiExplorer");
const docsWorkflow = document.getElementById("docsWorkflow");
const docsProviders = document.getElementById("docsProviders");
const environmentOverview = document.getElementById("environmentOverview");
const environmentSetupCards = document.getElementById("environmentSetupCards");
const overviewPopularTests = document.getElementById("overviewPopularTests");
const overviewRowsPreview = document.getElementById("overviewRowsPreview");
const overviewAuditPreview = document.getElementById("overviewAuditPreview");
const sidebarEnvironmentName = document.getElementById("sidebarEnvironmentName");
const sidebarRegion = document.getElementById("sidebarRegion");
const regionSelect = document.getElementById("regionSelect");

const state = {
  contract: null,
  overview: null,
  scenarios: [],
  liveSetup: [],
  catalogs: [],
  models: [],
  selectedProvider: null,
  selectedScenarioId: null,
  loadingScenarioId: null,
  runningAll: false,
  lastRun: null,
  audit: [],
  capturedRows: [],
  capturedRowsSource: "UNAVAILABLE",
  capturedRowsMessage: "",
  activeView: initialView(),
  explorerEndpointId: "overview",
  explorerResponse: null
};

runRealtime.addEventListener("click", () => runDemoSet());
runSelectedScenario.addEventListener("click", () => runSelectedScenarioFlow());
document.getElementById("refreshOverview").addEventListener("click", () => loadAll());
refreshCapturedRows.addEventListener("click", () => loadCapturedRows());
refreshAudit.addEventListener("click", () => loadAudit());
runApiExplorer.addEventListener("click", () => runExplorer());
explorerEndpointSelect.addEventListener("change", (event) => {
  state.explorerEndpointId = event.target.value;
  renderExplorer();
});
capturedProviderFilter.addEventListener("change", renderCapturedRowsPage);
capturedServiceFilter.addEventListener("change", renderCapturedRowsPage);
capturedSearchInput.addEventListener("input", renderCapturedRowsPage);

window.addEventListener("hashchange", () => {
  state.activeView = initialView();
  syncViewState();
});

document.addEventListener("click", (event) => {
  const viewTrigger = event.target.closest("[data-view-target], [data-view-link]");
  if (viewTrigger) {
    const nextView = viewTrigger.dataset.viewTarget || viewTrigger.dataset.viewLink;
    if (nextView) {
      activateView(nextView);
    }
  }

  const providerTrigger = event.target.closest("[data-provider-tab]");
  if (providerTrigger) {
    state.selectedProvider = providerTrigger.dataset.providerTab;
    const model = getSelectedModel();
    state.selectedScenarioId = model?.liveScenario?.id || model?.serviceScenarios?.[0]?.id || null;
    renderAll();
  }

  const scenarioTrigger = event.target.closest("[data-scenario-select], [data-scenario-jump]");
  if (scenarioTrigger) {
    const scenarioId = scenarioTrigger.dataset.scenarioSelect || scenarioTrigger.dataset.scenarioJump;
    selectScenarioById(scenarioId);
    activateView("live-test");
  }
});

function initialView() {
  const hash = window.location.hash.replace("#", "");
  return VIEW_IDS.includes(hash) ? hash : "overview";
}

function activateView(viewId) {
  if (!VIEW_IDS.includes(viewId)) {
    return;
  }
  state.activeView = viewId;
  history.replaceState(null, "", `#${viewId}`);
  syncViewState();
}

function syncViewState() {
  document.querySelectorAll("[data-view-page]").forEach((page) => {
    const active = page.dataset.viewPage === state.activeView;
    page.hidden = !active;
    page.classList.toggle("is-active", active);
  });
  document.querySelectorAll(".nav-item").forEach((item) => {
    const active = item.dataset.viewTarget === state.activeView;
    item.classList.toggle("is-active", active);
  });
}

async function json(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}${url}`, {
      ...options,
      signal: controller.signal
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${response.status} ${text || response.statusText}`);
    }
    return response.json();
  } finally {
    window.clearTimeout(timer);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatCount(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toLocaleString() : String(value ?? "-");
}

function formatMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value ?? "-");
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: numeric < 1 ? 4 : 2,
    maximumFractionDigits: numeric < 1 ? 4 : 2
  }).format(numeric);
}

function shortUrl(value) {
  try {
    const parsed = new URL(String(value));
    return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch (error) {
    return String(value ?? "-");
  }
}

function providerCode(provider) {
  return provider === "AZURE" ? "Azure" : provider;
}

function statusClass(status) {
  if (/SUCCESS|READY|LIVE|STORED|CONNECTED/i.test(status || "")) {
    return "pill-ok";
  }
  if (/WARN|PENDING|DEFERRED|SKIPPED|RATE/i.test(status || "")) {
    return "pill-warn";
  }
  if (/ERROR|FAIL/i.test(status || "")) {
    return "pill-error";
  }
  return "";
}

function buildModels({ overview, scenarios, liveSetup, catalogs }) {
  return DEMO_VISIBLE_PROVIDERS.map((provider) => {
    const providerScenarios = scenarios.filter((scenario) => scenario.provider === provider);
    if (!providerScenarios.length) {
      return null;
    }

    const liveScenario = providerScenarios.find((scenario) => scenario.executionMode === "live-provider-call") || null;
    const serviceScenarios = providerScenarios.filter((scenario) => scenario.executionMode !== "live-provider-call");
    const collectorInfo = (overview?.collectors || []).find((collector) => collector.provider === provider) || {};
    const setup = liveSetup.find((item) => item.provider === provider) || {};
    const catalog = catalogs.find((item) => item.provider === provider) || { serviceFamilies: [] };
    const collectorUrl = liveScenario?.collectorUrl || serviceScenarios[0]?.collectorUrl || collectorInfo.collectorUrl || "";

    return {
      provider,
      collectorUrl,
      collectorInfo,
      setup,
      catalog,
      liveScenario,
      serviceScenarios,
      allScenarios: [liveScenario, ...serviceScenarios].filter(Boolean)
    };
  }).filter(Boolean);
}

function getSelectedModel() {
  return state.models.find((model) => model.provider === state.selectedProvider) || null;
}

function getSelectedScenario() {
  const model = getSelectedModel();
  if (!model) {
    return null;
  }
  return model.allScenarios.find((scenario) => scenario.id === state.selectedScenarioId) || model.liveScenario || model.allScenarios[0] || null;
}

function selectScenarioById(scenarioId) {
  const match = state.models.flatMap((model) => model.allScenarios.map((scenario) => ({ model, scenario })))
    .find((item) => item.scenario.id === scenarioId);
  if (!match) {
    return;
  }
  state.selectedProvider = match.model.provider;
  state.selectedScenarioId = match.scenario.id;
  renderAll();
}

function summaryCards() {
  const modeledTests = state.models.reduce((sum, model) => sum + model.allScenarios.length, 0);
  const healthyCollectors = state.models.filter((model) => model.collectorUrl).length;
  const liveReadyClouds = state.models.filter((model) => model.setup.configured).length;
  return [
    ["Demo clouds", state.models.length, state.models.map((model) => providerCode(model.provider)).join(", ")],
    ["Demo tests", modeledTests, "ready to run"],
    ["Healthy collectors", healthyCollectors, "live and ready"],
    ["Live-ready clouds", liveReadyClouds, "ready for proof"]
  ];
}

function renderHeroStats() {
  heroStats.innerHTML = summaryCards().map(([label, value, hint]) => `
    <section class="surface-card">
      <div class="section-head compact-head">
        <div>
          <div class="eyebrow">${escapeHtml(label)}</div>
          <h2>${escapeHtml(formatCount(value))}</h2>
          <p class="section-copy">${escapeHtml(hint)}</p>
        </div>
      </div>
    </section>
  `).join("");
}

function renderProviderTabs() {
  providerTabs.innerHTML = state.models.map((model) => `
    <button class="provider-tab ${model.provider === state.selectedProvider ? "is-active" : ""}" data-provider-tab="${model.provider}" type="button">
      ${escapeHtml(providerCode(model.provider))}
    </button>
  `).join("");
}

function renderSelectedProviderCard() {
  const model = getSelectedModel();
  if (!model) {
    selectedProviderTitle.textContent = "Provider";
    selectedProviderStatus.textContent = "-";
    selectedProviderSummary.textContent = "No provider is available.";
    selectedProviderMeta.innerHTML = "";
    return;
  }

  selectedProviderTitle.textContent = providerCode(model.provider);
  selectedProviderStatus.textContent = model.setup.configured ? `Live ready: ${model.setup.selectedService}` : "Collector-ready";
  selectedProviderStatus.className = `status-chip ${model.setup.configured ? "status-ok" : "status-warn"}`;
  selectedProviderSummary.textContent = model.setup.configured
    ? "This cloud is ready for a real provider proof that ends in a stored CloudSight row."
    : "Collector replay is ready now. Add live credentials later if you want a real provider call.";

  selectedProviderMeta.innerHTML = `
    <div class="provider-meta-item">
      <div class="provider-meta-item-label">Live proof</div>
      <div class="provider-meta-item-value">${escapeHtml(model.setup.selectedService || "Not configured")}</div>
    </div>
    <div class="provider-meta-item">
      <div class="provider-meta-item-label">Modeled families</div>
      <div class="provider-meta-item-value">${escapeHtml(String((model.catalog.serviceFamilies || []).length))}</div>
    </div>
    <div class="provider-meta-item">
      <div class="provider-meta-item-label">Collector endpoint</div>
      <a class="provider-meta-item-value is-link" href="${escapeHtml(model.collectorUrl)}" target="_blank" rel="noreferrer">${escapeHtml(shortUrl(model.collectorUrl))}</a>
    </div>
  `;
}

function renderScenarioList() {
  const model = getSelectedModel();
  if (!model) {
    scenarioList.innerHTML = "";
    return;
  }

  scenarioList.innerHTML = model.allScenarios.map((scenario) => {
    const active = scenario.id === state.selectedScenarioId;
    const running = scenario.id === state.loadingScenarioId;
    const modeLabel = running ? "running" : scenario.executionMode === "live-provider-call" ? "live" : "collector";
    return `
      <button class="scenario-card ${active ? "is-active" : ""}" data-scenario-select="${scenario.id}" type="button">
        <div class="scenario-card-title">
          <strong>${escapeHtml(scenario.title)}</strong>
          <span class="pill ${running ? "pill-warn" : scenario.executionMode === "live-provider-call" ? "pill-ok" : ""}">${escapeHtml(modeLabel)}</span>
        </div>
        <p>${escapeHtml(scenario.realCloudNote || scenario.signalType)}</p>
      </button>
    `;
  }).join("");
}

function buildFlowItems(scenario, result) {
  const isLive = scenario?.executionMode === "live-provider-call";
  const provider = scenario?.provider || "Cloud";
  const liveCall = result?.liveCall;
  const dispatch = result?.dispatch;
  const verification = result?.verification;
  const latestRow = selectLatestRunRow(result, scenario);

  const items = [
    {
      title: "Trigger",
      body: isLive
        ? `${providerCode(provider)} made a real provider call for ${scenario.serviceFamily}.`
        : `${providerCode(provider)} generated a safe provider-native collector payload for ${scenario.serviceFamily}.`
    },
    {
      title: "Collector",
      body: dispatch?.status === "SUCCESS"
        ? `The ${providerCode(provider)} collector received the signal and normalized it for CloudSight.`
        : `The ${providerCode(provider)} collector will receive the signal and normalize it for CloudSight.`
    },
    {
      title: "CloudSight ingestion",
      body: dispatch?.status === "SUCCESS"
        ? `CloudSight accepted the normalized payload and stored the matching usage row.`
        : `CloudSight will store the matching usage row once the collector dispatch completes.`
    },
    {
      title: "Verify",
      body: verification?.status === "SUCCESS"
        ? "CloudSight confirmation found the stored row for the current run."
        : latestRow
          ? "This page is showing the stored row returned by the collector while product readback catches up."
          : "The verification step confirms the stored row and current-run audit trail."
    }
  ];

  if (liveCall?.resource) {
    items[0].body += ` Resource proof: ${Object.entries(liveCall.resource).map(([key, value]) => `${key}=${value}`).join(", ")}.`;
  }
  return items;
}

function renderFlowExplanation(result = null) {
  const scenario = getSelectedScenario();
  if (!scenario) {
    flowSteps.innerHTML = "";
    return;
  }
  flowSteps.innerHTML = buildFlowItems(scenario, result).map((item) => `
    <li>
      <strong>${escapeHtml(item.title)}</strong>
      ${escapeHtml(item.body)}
    </li>
  `).join("");
}

function renderSelectedScenarioCard() {
  const scenario = getSelectedScenario();
  if (!scenario) {
    selectedScenarioTitle.textContent = "Select a scenario";
    selectedScenarioSummary.textContent = "Pick a proof on the left.";
    selectedScenarioBadges.innerHTML = "";
    runSelectedScenario.disabled = true;
    return;
  }

  const model = getSelectedModel();
  const running = scenario.id === state.loadingScenarioId;
  selectedScenarioTitle.textContent = scenario.title;
  selectedScenarioSummary.textContent = scenario.realCloudNote || `Runs the ${scenario.serviceFamily} scenario through the ${providerCode(model.provider)} collector.`;
  selectedScenarioBadges.innerHTML = `
    <span class="pill">${escapeHtml(providerCode(scenario.provider))}</span>
    <span class="pill">${escapeHtml(scenario.primaryEndpoint)}</span>
    <span class="pill">${escapeHtml(scenario.signalType)}</span>
    <span class="pill ${scenario.executionMode === "live-provider-call" ? "pill-ok" : ""}">${escapeHtml(scenario.executionMode)}</span>
  `;

  const liveUnavailable = scenario.executionMode === "live-provider-call" && !model.setup.configured;
  runSelectedScenario.disabled = running || liveUnavailable;
  runSelectedScenario.textContent = running
    ? (scenario.executionMode === "live-provider-call" ? "Running live..." : "Running collector...")
    : liveUnavailable
      ? "Configure live credentials"
      : scenario.executionMode === "live-provider-call"
        ? "Run live + verify"
        : "Run collector test";
}

function renderOverviewPopularTests() {
  const featured = state.models.flatMap((model) => {
    const picks = [];
    if (model.liveScenario) {
      picks.push(model.liveScenario);
    }
    if (model.serviceScenarios.length) {
      picks.push(model.serviceScenarios[0]);
    }
    return picks;
  }).slice(0, 6);

  overviewPopularTests.innerHTML = featured.map((scenario, index) => `
    <button class="quick-test-button ${index === 0 ? "is-featured" : ""}" data-scenario-jump="${scenario.id}" type="button">
      <div class="quick-test-top">
        <strong>${escapeHtml(scenario.title)}</strong>
        <span class="pill ${scenario.executionMode === "live-provider-call" ? "pill-ok" : ""}">
          ${escapeHtml(scenario.executionMode === "live-provider-call" ? "Live ready" : "Collector")}
        </span>
      </div>
      <p>${escapeHtml(providerCode(scenario.provider))}</p>
    </button>
  `).join("");
}

function normalizeUsageRow(row, fallback = {}) {
  const primaryUnits = Number(row.inputUnits ?? row.primaryUnits ?? 0);
  const secondaryUnits = Number(row.outputUnits ?? row.secondaryUnits ?? 0);
  const sourceParts = [
    row.sourceReference,
    row.bucket,
    row.object,
    row.bucketName,
    row.resourceName,
    row.collectorName,
    row.deploymentEnvironment
  ].filter(Boolean);
  return {
    key: [
      row.timestamp || row.createdAt || row.recordedAt || "",
      row.provider || row.service || fallback.provider || "",
      row.inputEndpoint || row.primaryEndpoint || fallback.primaryEndpoint || "",
      sourceParts.join(" ")
    ].join("|"),
    timestamp: row.timestamp || row.createdAt || row.recordedAt || "-",
    provider: row.provider || fallback.provider || inferProvider(row.service || "", row.inputEndpoint || row.primaryEndpoint || ""),
    service: row.serviceFamily || row.service || fallback.service || fallback.provider || "-",
    inputEndpoint: row.inputEndpoint || row.primaryEndpoint || fallback.primaryEndpoint || "-",
    outputEndpoint: row.outputEndpoint || row.secondaryEndpoint || fallback.secondaryEndpoint || "-",
    units: `${formatCount(primaryUnits)} / ${formatCount(secondaryUnits)}`,
    inputUnits: primaryUnits,
    outputUnits: secondaryUnits,
    cost: row.calculatedCost ?? row.estimatedCost ?? row.totalCost ?? "-",
    source: sourceParts[0] || row.regionCode || row.sourceType || "-",
    status: row.status || "Stored",
    raw: row
  };
}

function inferProvider(service, endpoint) {
  const value = `${service} ${endpoint}`.toLowerCase();
  if (value.includes("azure") || value.includes("blob")) {
    return "AZURE";
  }
  if (value.includes("gcp") || value.includes("cloud-storage") || value.includes("bigquery") || value.includes("pubsub")) {
    return "GCP";
  }
  if (value.includes("aws") || value.includes("s3") || value.includes("lambda") || value.includes("dynamodb")) {
    return "AWS";
  }
  return service || "-";
}

function rowsFromDispatch(result, scenario) {
  const rows = result?.dispatch?.result?.response?.results;
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map((row) => normalizeUsageRow(row, {
    provider: scenario?.provider,
    service: scenario?.serviceFamily,
    primaryEndpoint: scenario?.primaryEndpoint,
    secondaryEndpoint: scenario?.secondaryEndpoint
  }));
}

function rowsFromVerification(result, scenario) {
  const matched = result?.verification?.matchedLogs;
  if (Array.isArray(matched) && matched.length) {
    return matched.map((row) => normalizeUsageRow(row, {
      provider: scenario?.provider,
      service: scenario?.serviceFamily,
      primaryEndpoint: scenario?.primaryEndpoint,
      secondaryEndpoint: scenario?.secondaryEndpoint
    }));
  }
  return [];
}

function currentRunRows() {
  const scenario = getSelectedScenario();
  if (!state.lastRun || !scenario) {
    return [];
  }
  const verificationRows = rowsFromVerification(state.lastRun, scenario);
  return verificationRows.length ? verificationRows : rowsFromDispatch(state.lastRun, scenario);
}

function selectLatestRunRow(result = state.lastRun, scenario = getSelectedScenario()) {
  const verificationRows = rowsFromVerification(result, scenario);
  if (verificationRows.length) {
    return verificationRows[0];
  }
  const dispatchRows = rowsFromDispatch(result, scenario);
  return dispatchRows[0] || null;
}

function highlightKeys() {
  return new Set(currentRunRows().map((row) => row.key));
}

function renderLatestRowCard() {
  const scenario = getSelectedScenario();
  const latest = selectLatestRunRow();
  if (!scenario || !latest) {
    latestRowState.textContent = "Run a test to show the latest stored row details.";
    latestRowDetail.innerHTML = `
      <div class="detail-item">
        <div class="detail-label">Status</div>
        <div class="detail-value muted">Waiting for a completed proof.</div>
      </div>
    `;
    return;
  }

  latestRowState.textContent = "Showing the latest stored row for the selected proof.";
  latestRowDetail.innerHTML = [
    ["Time", latest.timestamp],
    ["Cloud", providerCode(latest.provider)],
    ["Service", latest.service],
    ["Endpoint", `${latest.inputEndpoint} / ${latest.outputEndpoint}`],
    ["Source / Object", latest.source],
    ["Units", latest.units],
    ["Cost (est.)", formatMoney(latest.cost)],
    ["Status", latest.status]
  ].map(([label, value]) => `
    <div class="detail-item">
      <div class="detail-label">${escapeHtml(label)}</div>
      <div class="detail-value">${escapeHtml(String(value))}</div>
    </div>
  `).join("");
}

function renderResultSummary(result) {
  const scenario = getSelectedScenario();
  if (!scenario) {
    resultSummary.innerHTML = "";
    resultNarrative.innerHTML = "";
    return;
  }

  if (!result) {
    resultSummary.innerHTML = `
      <span class="pill">${escapeHtml(providerCode(scenario.provider))}</span>
      <span class="pill">${escapeHtml(scenario.serviceFamily)}</span>
      <span class="pill">${escapeHtml(scenario.executionMode)}</span>
    `;
    resultNarrative.innerHTML = `
      <div class="narrative-card">
        <strong>Ready to run</strong>
        <p>Use the button above to send the selected ${escapeHtml(scenario.serviceFamily)} proof through the ${escapeHtml(providerCode(scenario.provider))} collector flow.</p>
      </div>
    `;
    return;
  }

  const dispatchStatus = result.dispatch?.status || result.status || "UNKNOWN";
  const verificationStatus = result.verification?.status || "SKIPPED";
  const liveStatus = result.liveCall?.status || "SKIPPED";
  const storedCount = result.dispatch?.result?.response?.stored || 0;
  const summaryChips = [
    providerCode(scenario.provider),
    scenario.serviceFamily,
    dispatchStatus,
    verificationStatus
  ];
  if (result.liveCall?.status) {
    summaryChips.push(`live:${liveStatus}`);
  }
  if (storedCount) {
    summaryChips.push(`stored:${storedCount}`);
  }

  resultSummary.innerHTML = summaryChips.map((chip, index) => `
    <span class="pill ${index >= 2 ? statusClass(chip) : ""}">${escapeHtml(chip)}</span>
  `).join("");

  let message = "The run completed.";
  if (dispatchStatus === "SUCCESS" && verificationStatus === "SUCCESS") {
    message = "The run completed successfully.";
  } else if (liveStatus === "SUCCESS" && dispatchStatus === "SUCCESS") {
    message = "The provider call and collector dispatch succeeded.";
  } else if (dispatchStatus === "RATE_LIMITED") {
    message = "The provider call worked, but CloudSight throttled the collector dispatch.";
  } else if (dispatchStatus === "ERROR") {
    message = "The provider call finished, but the collector could not store the row in CloudSight.";
  }

  const verificationSource = result.verification?.fallback
    ? "Confirmation is using collector-backed row evidence while workspace readback catches up."
    : "Product verification matched the latest stored row.";

  resultNarrative.innerHTML = `
    <div class="narrative-card">
      <strong>${escapeHtml(message)}</strong>
      <p>Live call: ${escapeHtml(liveStatus)}. Collector: ${escapeHtml(dispatchStatus)}. Verification: ${escapeHtml(verificationStatus)}. ${escapeHtml(verificationSource)}</p>
    </div>
  `;
}

function setBanner(text, tone = "idle") {
  runStatusBanner.className = `status-banner status-banner-${tone}`;
  runStatusBanner.textContent = text;
}

function renderLiveAuditTimeline() {
  const currentRunId = state.lastRun?.runId;
  const events = currentRunId
    ? state.audit.filter((event) => event.runId === currentRunId)
    : state.audit.slice(0, 5);

  if (!events.length) {
    liveAuditTimeline.innerHTML = `
      <div class="timeline-item">
        <div class="timeline-icon">i</div>
        <div class="timeline-copy">Run a proof to show the current-run audit timeline.</div>
      </div>
    `;
    return;
  }

  liveAuditTimeline.innerHTML = events.slice(0, 6).map((event) => `
    <div class="timeline-item">
      <div class="timeline-icon">${event.responseStatus >= 400 ? "!" : "o"}</div>
      <div class="timeline-time">${escapeHtml(shortTime(event.recordedAt))}</div>
      <div class="timeline-stage">${escapeHtml(auditStage(event))}</div>
      <div class="timeline-copy">${escapeHtml(auditMessage(event))}</div>
    </div>
  `).join("");
}

function shortTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function auditStage(event) {
  if ((event.integrationOption || "").includes("collector")) {
    return "Collector";
  }
  if ((event.url || "").includes("/auth/login")) {
    return "Workspace auth";
  }
  if ((event.url || "").includes("/api/collector/events")) {
    return "Stored";
  }
  if ((event.url || "").includes("/api/collector/readback")) {
    return "Verified";
  }
  if ((event.url || "").includes("googleapis.com") || (event.url || "").includes("amazonaws.com") || (event.url || "").includes("blob.core.windows.net")) {
    return "Provider call";
  }
  if ((event.url || "").includes("/api/usage")) {
    return "Usage";
  }
  return "API call";
}

function auditMessage(event) {
  const stage = auditStage(event);
  if (stage === "Provider call") {
    return `Called ${shortUrl(event.url || "")} successfully.`;
  }
  if (stage === "Collector") {
    return `Signal was received and normalized by ${event.provider || "the"} collector.`;
  }
  if (stage === "Stored") {
    return "Row was stored in CloudSight.";
  }
  if (stage === "Verified") {
    return "Verification query confirmed the stored row.";
  }
  return shortUrl(event.url || "");
}

function renderCapturedRowsPage() {
  const rows = filteredCapturedRows();
  const highlight = highlightKeys();
  const sourceLabel = state.capturedRowsSource === "LIVE" ? "live CloudSight readback" : state.capturedRowsSource === "CACHED" ? "cached CloudSight readback" : "collector-backed preview";

  populateCapturedFilters();

  if (!rows.length) {
    capturedRowsMeta.textContent = state.capturedRowsMessage || "No captured usage rows are available yet.";
    capturedRowsTableBody.innerHTML = `
      <tr>
        <td colspan="8">Run a test and CloudSight rows will appear here.</td>
      </tr>
    `;
    return;
  }

  capturedRowsMeta.textContent = `Showing ${rows.length} row${rows.length === 1 ? "" : "s"} from ${sourceLabel}. Rows from the current run are highlighted.`;
  capturedRowsTableBody.innerHTML = rows.map((row) => `
    <tr class="${highlight.has(row.key) ? "row-highlight" : ""}">
      <td>${escapeHtml(row.timestamp)}</td>
      <td>${escapeHtml(providerCode(row.provider))}</td>
      <td>${escapeHtml(row.service)}</td>
      <td><strong>${escapeHtml(row.inputEndpoint)}</strong><br><span class="brand-caption">${escapeHtml(row.outputEndpoint)}</span></td>
      <td>${escapeHtml(row.source)}</td>
      <td>${escapeHtml(row.units)}</td>
      <td><span class="row-status"><span class="status-dot"></span>${escapeHtml(row.status)}</span></td>
      <td>${escapeHtml(formatMoney(row.cost))}</td>
    </tr>
  `).join("");
}

function populateCapturedFilters() {
  const currentProvider = capturedProviderFilter.value;
  const currentService = capturedServiceFilter.value;
  const providers = Array.from(new Set(state.capturedRows.map((row) => providerCode(row.provider)))).sort();
  const services = Array.from(new Set(state.capturedRows.map((row) => row.service))).sort();

  capturedProviderFilter.innerHTML = `<option value="">All clouds</option>${providers.map((provider) => `<option value="${escapeHtml(provider)}">${escapeHtml(provider)}</option>`).join("")}`;
  capturedServiceFilter.innerHTML = `<option value="">All services</option>${services.map((service) => `<option value="${escapeHtml(service)}">${escapeHtml(service)}</option>`).join("")}`;

  capturedProviderFilter.value = providers.includes(currentProvider) ? currentProvider : "";
  capturedServiceFilter.value = services.includes(currentService) ? currentService : "";
}

function filteredCapturedRows() {
  const provider = capturedProviderFilter.value.trim().toLowerCase();
  const service = capturedServiceFilter.value.trim().toLowerCase();
  const search = capturedSearchInput.value.trim().toLowerCase();
  return state.capturedRows.filter((row) => {
    if (provider && providerCode(row.provider).toLowerCase() !== provider) {
      return false;
    }
    if (service && row.service.toLowerCase() !== service) {
      return false;
    }
    if (search) {
      const haystack = [
        row.timestamp,
        row.provider,
        row.service,
        row.inputEndpoint,
        row.outputEndpoint,
        row.source
      ].join(" ").toLowerCase();
      if (!haystack.includes(search)) {
        return false;
      }
    }
    return true;
  });
}

function renderAuditPage() {
  const currentRunId = state.lastRun?.runId;
  const matched = currentRunId ? state.audit.filter((event) => event.runId === currentRunId) : [];
  const ordered = currentRunId
    ? [...matched, ...state.audit.filter((event) => event.runId !== currentRunId)]
    : state.audit;

  auditMatchSummary.textContent = currentRunId
    ? `${matched.length} audit event${matched.length === 1 ? "" : "s"} from the current run are highlighted below.`
    : "Recent calls will appear here. Matching events from the current run are highlighted.";

  auditPanel.innerHTML = ordered.slice(0, 48).map((event) => `
    <article class="audit-item ${currentRunId && event.runId === currentRunId ? "audit-item-match" : ""}">
      <div class="audit-top">
        <div>
          <span class="audit-method">${escapeHtml(event.method || "CALL")}</span>
          <span class="pill ${statusClass(String(event.responseStatus || 0))}">${escapeHtml(auditStage(event))}</span>
          ${currentRunId && event.runId === currentRunId ? '<span class="pill pill-ok">Current run</span>' : ""}
        </div>
        <div class="brand-caption">${escapeHtml(event.recordedAt || "")}</div>
      </div>
      <div class="audit-tags">
        <span class="status-chip ${statusClass(String(event.responseStatus || ""))}">${escapeHtml(String(event.responseStatus || "-"))}</span>
        ${event.provider ? `<span class="pill">${escapeHtml(providerCode(event.provider))}</span>` : ""}
        ${event.serviceFamily ? `<span class="pill">${escapeHtml(event.serviceFamily)}</span>` : ""}
        ${event.primaryEndpoint ? `<span class="pill">${escapeHtml(event.primaryEndpoint)}</span>` : ""}
      </div>
      <div class="audit-url">${escapeHtml(event.url || "")}</div>
    </article>
  `).join("");
}

function renderProvidersPage() {
  providersCollectorCards.innerHTML = state.models.map((model) => `
    <section class="provider-card">
      <div class="provider-card-head">
        <div>
          <div class="eyebrow">${escapeHtml(providerCode(model.provider))}</div>
          <h2>${escapeHtml(model.setup.selectedService || "Collector proof")}</h2>
        </div>
        <span class="pill ${model.setup.configured ? "pill-ok" : "pill-warn"}">${escapeHtml(model.setup.configured ? "Live" : "Collector only")}</span>
      </div>
      <p>${escapeHtml(model.setup.configured ? "Real provider call is configured and routed through the collector." : "Collector replay is available. Live provider credentials are not fully configured.")}</p>
      <div class="detail-grid">
        <div class="detail-item">
          <div class="detail-label">Collector</div>
          <div class="detail-value">${escapeHtml(shortUrl(model.collectorUrl))}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Modeled families</div>
          <div class="detail-value">${escapeHtml(String(model.allScenarios.length))}</div>
        </div>
      </div>
    </section>
  `).join("");

  providersCoverageMatrix.innerHTML = state.models.map((model) => `
    <section class="coverage-card">
      <div class="section-head compact-head">
        <div>
          <div class="eyebrow">${escapeHtml(providerCode(model.provider))}</div>
          <h3>Service family coverage</h3>
        </div>
      </div>
      <div class="coverage-list">
        ${(model.catalog.serviceFamilies || []).map((family) => `
          <span class="coverage-pill ${family.selectedLiveCall ? "is-live" : family.status === "catalog-expanded" ? "is-expanded" : ""}">
            ${escapeHtml(family.name)}
          </span>
        `).join("")}
      </div>
    </section>
  `).join("");
}

function renderExplorer() {
  explorerEndpointSelect.innerHTML = EXPLORER_ENDPOINTS.map((endpoint) => `
    <option value="${endpoint.id}" ${endpoint.id === state.explorerEndpointId ? "selected" : ""}>${escapeHtml(endpoint.label)}</option>
  `).join("");
  const endpoint = EXPLORER_ENDPOINTS.find((item) => item.id === state.explorerEndpointId) || EXPLORER_ENDPOINTS[0];
  explorerMethod.textContent = endpoint.method;
  explorerRequestHelp.textContent = endpoint.description;
  explorerResponsePanel.textContent = state.explorerResponse
    ? JSON.stringify(state.explorerResponse, null, 2)
    : "Select an endpoint and press Send.";
}

function renderDocsPage() {
  docsWorkflow.innerHTML = `
    <section class="docs-item">
      <strong>Collector-first workflow</strong>
      <ol class="docs-list">
        ${(state.contract?.workflow || []).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
      </ol>
    </section>
    <section class="docs-item">
      <strong>No-PII guidance</strong>
      <ul class="docs-list">
        ${(state.contract?.noPiiGuidance || []).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
      </ul>
    </section>
  `;

  docsProviders.innerHTML = state.liveSetup.map((setup) => `
    <section class="docs-item">
      <strong>${escapeHtml(providerCode(setup.provider))}: ${escapeHtml(setup.selectedService || "Live proof")}</strong>
      <ul class="docs-list">
        ${(setup.steps || []).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
      </ul>
    </section>
  `).join("");
}

function renderEnvironmentPage() {
  const currentMode = state.overview?.mode || "hybrid-premium-console";
  const workspace = state.overview?.cloudSightWorkspace || "workspace";
  const collectors = state.models.map((model) => shortUrl(model.collectorUrl)).join(", ");
  environmentOverview.innerHTML = `
    <div class="detail-item">
      <div class="detail-label">Application</div>
      <div class="detail-value">${escapeHtml(state.overview?.application || "cloudsight-poc-hybrid")}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Mode</div>
      <div class="detail-value">${escapeHtml(currentMode)}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Workspace</div>
      <div class="detail-value">${escapeHtml(workspace)}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Collectors</div>
      <div class="detail-value">${escapeHtml(collectors || "-")}</div>
    </div>
  `;

  environmentSetupCards.innerHTML = state.liveSetup.map((setup) => `
    <section class="docs-item">
      <strong>${escapeHtml(providerCode(setup.provider))}</strong>
      <div class="badge-row">
        <span class="pill ${setup.configured ? "pill-ok" : "pill-warn"}">${escapeHtml(setup.configured ? "Configured" : "Missing credentials")}</span>
        <span class="pill">${escapeHtml(setup.selectedService || "Live proof")}</span>
      </div>
      <ul class="docs-list">
        ${(setup.requirements || []).map((item) => `<li>${escapeHtml(item.description)}: ${escapeHtml(item.configured ? "configured" : "missing")}</li>`).join("")}
      </ul>
    </section>
  `).join("");
}

function renderOverviewPreviews() {
  const previewRows = filteredCapturedRows().slice(0, 4);
  overviewRowsPreview.innerHTML = previewRows.length
    ? previewRows.map((row) => `
      <div class="preview-row">
        <strong>${escapeHtml(row.service)}</strong>
        <p>${escapeHtml(providerCode(row.provider))} - ${escapeHtml(row.inputEndpoint)} - ${escapeHtml(formatMoney(row.cost))}</p>
      </div>
    `).join("")
    : `<div class="preview-row"><p>Run a proof to show recent stored rows.</p></div>`;

  overviewAuditPreview.innerHTML = state.audit.slice(0, 4).map((event) => `
    <div class="preview-row">
      <strong>${escapeHtml(auditStage(event))}</strong>
      <p>${escapeHtml(auditMessage(event))}</p>
    </div>
  `).join("") || `<div class="preview-row"><p>Audit events will appear here after the first run.</p></div>`;
}

function renderRawJsonPage() {
  resultPanel.textContent = state.lastRun
    ? JSON.stringify(state.lastRun, null, 2)
    : "Select a service on the left and run it.";
}

function renderAll() {
  syncViewState();
  renderHeroStats();
  renderProviderTabs();
  renderSelectedProviderCard();
  renderScenarioList();
  renderSelectedScenarioCard();
  renderFlowExplanation(state.lastRun);
  renderResultSummary(state.lastRun);
  renderLatestRowCard();
  renderLiveAuditTimeline();
  renderCapturedRowsPage();
  renderAuditPage();
  renderProvidersPage();
  renderExplorer();
  renderDocsPage();
  renderEnvironmentPage();
  renderOverviewPopularTests();
  renderOverviewPreviews();
  renderRawJsonPage();
}

async function loadAudit() {
  try {
    state.audit = await json("/demo/audit", {}, 15000);
  } catch (error) {
    state.audit = [];
  }
  renderAuditPage();
  renderLiveAuditTimeline();
  renderOverviewPreviews();
}

async function loadCapturedRows() {
  try {
    const payload = await json("/demo/captured-rows", {}, 18000);
    state.capturedRowsSource = payload.source || "LIVE";
    state.capturedRowsMessage = payload.message || "";
    state.capturedRows = Array.isArray(payload.rows)
      ? payload.rows.map((row) => normalizeUsageRow(row))
      : [];
  } catch (error) {
    state.capturedRowsSource = "UNAVAILABLE";
    state.capturedRowsMessage = error.message;
    state.capturedRows = currentRunRows();
  }
  renderCapturedRowsPage();
  renderOverviewPreviews();
}

async function runExplorer() {
  const endpoint = EXPLORER_ENDPOINTS.find((item) => item.id === state.explorerEndpointId) || EXPLORER_ENDPOINTS[0];
  explorerResponsePanel.textContent = "Loading...";
  try {
    state.explorerResponse = await json(endpoint.url, {}, 20000);
  } catch (error) {
    state.explorerResponse = { status: "ERROR", message: error.message };
  }
  renderExplorer();
}

async function runSelectedScenarioFlow() {
  const scenario = getSelectedScenario();
  if (!scenario) {
    return;
  }

  state.loadingScenarioId = scenario.id;
  activateView("live-test");
  renderSelectedScenarioCard();
  renderScenarioList();
  renderResultSummary(null);
  renderLatestRowCard();
  setBanner(
    scenario.executionMode === "live-provider-call"
      ? `Running a real ${providerCode(scenario.provider)} provider call and forwarding the collector payload...`
      : `Running the ${providerCode(scenario.provider)} collector replay for ${scenario.serviceFamily}...`,
    "running"
  );

  try {
    const result = scenario.executionMode === "live-provider-call"
      ? await json(`/demo/live/providers/${scenario.provider}/run?verify=true`, { method: "POST" }, 120000)
      : await json(`/demo/scenarios/${scenario.id}/run?verify=true`, { method: "POST" }, 120000);

    state.lastRun = result;
    const dispatchStatus = result.dispatch?.status || result.status || "UNKNOWN";
    setBanner(
      dispatchStatus === "SUCCESS"
        ? `${scenario.serviceFamily} completed successfully.`
        : dispatchStatus === "RATE_LIMITED"
          ? `${scenario.serviceFamily} ran, but CloudSight throttled the collector dispatch.`
          : `${scenario.serviceFamily} completed with an error. Review the CloudSight output panel for details.`,
      dispatchStatus === "SUCCESS" ? "success" : dispatchStatus === "RATE_LIMITED" ? "warn" : "error"
    );

    await Promise.all([loadAudit(), loadCapturedRows()]);
  } catch (error) {
    state.lastRun = {
      status: "ERROR",
      message: error.message
    };
    setBanner(`The ${scenario.serviceFamily} run failed before CloudSight could confirm it.`, "error");
    resultPanel.textContent = error.stack || String(error);
  } finally {
    state.loadingScenarioId = null;
    renderAll();
  }
}

async function runDemoSet() {
  state.runningAll = true;
  runRealtime.disabled = true;
  runRealtime.textContent = "Running demo set...";
  activateView("overview");
  setBanner("Running the AWS, GCP, and Azure live collector proofs one by one.", "running");

  try {
    const providers = state.models
      .filter((model) => model.setup.configured && model.liveScenario)
      .map((model) => model.provider);
    const results = [];

    for (const provider of providers) {
      const result = await json(`/demo/live/providers/${provider}/run?verify=true`, { method: "POST" }, 120000);
      results.push({
        provider,
        liveCall: result.liveCall?.status || "UNKNOWN",
        dispatch: result.dispatch?.status || result.status || "UNKNOWN",
        stored: result.dispatch?.result?.response?.stored || 0,
        verification: result.verification?.status || "UNKNOWN"
      });
      state.lastRun = result;
    }

    const success = results.every((item) => item.liveCall === "SUCCESS" && item.dispatch === "SUCCESS" && item.stored >= 1);
    state.lastRun = {
      status: success ? "SUCCESS" : "PARTIAL",
      dispatch: { status: success ? "SUCCESS" : "PARTIAL" },
      verification: { status: success ? "SUCCESS" : "WARN" },
      liveCall: { status: success ? "SUCCESS" : "PARTIAL" },
      results
    };

    setBanner(
      success
        ? "AWS, GCP, and Azure all stored rows in CloudSight successfully."
        : "The demo set finished, but one or more providers need another retry.",
      success ? "success" : "warn"
    );

    await Promise.all([loadAudit(), loadCapturedRows()]);
  } catch (error) {
    state.lastRun = {
      status: "ERROR",
      message: error.message
    };
    setBanner("Running the AWS, GCP, and Azure demo set failed. Please retry.", "error");
  } finally {
    state.runningAll = false;
    runRealtime.disabled = false;
    runRealtime.textContent = "Run demo set";
    renderAll();
  }
}

async function loadAll() {
  try {
    const [contract, scenarios, liveSetup, catalogs] = await Promise.all([
      json("/demo/contract", {}, 15000),
      json("/demo/scenarios", {}, 15000),
      json("/demo/live/setup", {}, 15000),
      json("/demo/catalogs", {}, 15000)
    ]);

    state.contract = contract;
    state.scenarios = scenarios.filter((scenario) => DEMO_VISIBLE_PROVIDERS.includes(scenario.provider));
    state.liveSetup = liveSetup.filter((item) => DEMO_VISIBLE_PROVIDERS.includes(item.provider));
    state.catalogs = catalogs.filter((item) => DEMO_VISIBLE_PROVIDERS.includes(item.provider));

    try {
      state.overview = await json("/demo/overview", {}, 12000);
    } catch (error) {
      state.overview = {
        application: "cloudsight-poc-hybrid",
        mode: "hybrid-premium-console",
        cloudSightWorkspace: "workspace readback deferred",
        collectors: state.scenarios.reduce((accumulator, scenario) => {
          if (!accumulator.some((collector) => collector.provider === scenario.provider)) {
            accumulator.push({
              provider: scenario.provider,
              collectorUrl: scenario.collectorUrl
            });
          }
          return accumulator;
        }, [])
      };
    }

    state.models = buildModels({
      overview: state.overview,
      scenarios: state.scenarios,
      liveSetup: state.liveSetup,
      catalogs: state.catalogs
    });

    if (!state.selectedProvider || !state.models.some((model) => model.provider === state.selectedProvider)) {
      state.selectedProvider = state.models[0]?.provider || null;
    }

    const selectedModel = getSelectedModel();
    if (selectedModel && !selectedModel.allScenarios.some((scenario) => scenario.id === state.selectedScenarioId)) {
      state.selectedScenarioId = selectedModel.liveScenario?.id || selectedModel.allScenarios[0]?.id || null;
    }

    sidebarEnvironmentName.textContent = "POC";
    sidebarRegion.textContent = regionSelect.value;

    await Promise.all([loadAudit(), loadCapturedRows()]);
    renderAll();
  } catch (error) {
    resultPanel.textContent = error.stack || String(error);
    setBanner("The playground could not load the required demo data.", "error");
  }
}

loadAll().then(() => {
  renderAll();
});
