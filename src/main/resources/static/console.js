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
const runSelectedScenario = document.getElementById("runSelectedScenario");
const flowSteps = document.getElementById("flowSteps");
const resultSummary = document.getElementById("resultSummary");
const resultNarrative = document.getElementById("resultNarrative");
const resultPanel = document.getElementById("resultPanel");
const responseTabBar = document.getElementById("responseTabBar");
const overviewGrid = document.getElementById("overviewGrid");
const readbackNote = document.getElementById("readbackNote");
const auditPanel = document.getElementById("auditPanel");
const auditMatchSummary = document.getElementById("auditMatchSummary");
const usageTableMeta = document.getElementById("usageTableMeta");
const usageTableBody = document.getElementById("usageTableBody");
const runStatusBanner = document.getElementById("runStatusBanner");
const providerDirectoryOverview = document.getElementById("providerDirectoryOverview");
const providerDirectoryPage = document.getElementById("providerDirectoryPage");
const overviewPopularTests = document.getElementById("overviewPopularTests");
const apiExplorerRequest = document.getElementById("apiExplorerRequest");
const apiExplorerResponse = document.getElementById("apiExplorerResponse");
const apiExplorerStatus = document.getElementById("apiExplorerStatus");
const apiExplorerLatency = document.getElementById("apiExplorerLatency");
const quickRunDemoSet = document.getElementById("quickRunDemoSet");
const quickRunDemoSetSecondary = document.getElementById("quickRunDemoSetSecondary");
const overviewRunDemoSet = document.getElementById("overviewRunDemoSet");
const pageSections = Array.from(document.querySelectorAll(".workspace-page"));
const navPageLinks = Array.from(document.querySelectorAll("[data-nav-page]"));
const IS_LOCAL_PREVIEW =
  window.location.protocol === "file:" ||
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";
const API_BASE = IS_LOCAL_PREVIEW ? "https://poc.cloudsight.dargio.in" : "";
const DEMO_VISIBLE_PROVIDERS = ["AWS", "GCP", "AZURE"];
const DETAIL_PAGES = [
  { id: "captured", label: "Captured rows" },
  { id: "audit", label: "Audit trail" },
  { id: "raw", label: "Raw JSON" }
];
const PAGE_IDS = new Set(pageSections.map((section) => section.dataset.page));
const DETAIL_PAGE_MAP = {
  captured: "captured-rows",
  audit: "audit-trail",
  raw: "raw-json"
};

const state = {
  models: [],
  selectedProvider: null,
  selectedScenarioId: null,
  lastRun: null,
  auditEvents: [],
  loadingScenarioId: null,
  runningAll: false,
  activePage: PAGE_IDS.has(window.location.hash.replace("#", "")) ? window.location.hash.replace("#", "") : "overview"
};

if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

const LOCAL_PREVIEW_DATA = {
  overview: {
    collectors: [
      {
        provider: "AWS",
        collectorUrl: "https://collector-aws.cloudsight.dargio.in",
        serviceFamilies: ["S3", "Lambda", "EC2 + EBS", "RDS", "API Gateway", "CloudFront", "DynamoDB", "SQS + SNS"],
        liveProviderReady: true,
        liveProviderCalls: "Selected live provider call is configured for this collector.",
        executionMode: "collector-replay + optional live-provider-call"
      },
      {
        provider: "GCP",
        collectorUrl: "https://collector-gcp.cloudsight.dargio.in",
        serviceFamilies: ["Cloud Storage", "Gemini", "Vision", "Cloud Run", "GKE runtime", "BigQuery", "Pub/Sub"],
        liveProviderReady: true,
        liveProviderCalls: "Selected live provider call is configured for this collector.",
        executionMode: "collector-replay + optional live-provider-call"
      },
      {
        provider: "AZURE",
        collectorUrl: "https://collector-azure.cloudsight.dargio.in",
        serviceFamilies: ["Blob Storage", "VM", "Functions", "Azure OpenAI", "Azure SQL", "Cosmos DB"],
        liveProviderReady: true,
        liveProviderCalls: "Selected live provider call is configured for this collector.",
        executionMode: "collector-replay + optional live-provider-call"
      }
    ],
    coverage: {
      liveProviderScenarioCount: 3,
      modeledScenarioCount: 24,
      catalogFamilyCount: 33,
      providerCount: 3
    },
    cloudSight: {
      auth: "CONNECTED",
      readbackMode: "LIVE",
      connections: {
        summary: {
          readinessScore: 93,
          providersConnected: 3,
          activeConnections: 3,
          totalConnections: 3,
          validatedConnections: 3
        },
        collectorSummary: {
          totalCollectors: 4,
          collectorsWithIssuedCredentials: 4,
          eventsReceived: 1363,
          healthyCollectors: 4,
          providersWithCollectors: 3,
          batchesReceived: 151,
          staleCollectors: 0,
          automaticCoverage: 100,
          optionalApiFallback: true,
          collectorsNeedingSetup: 0
        }
      },
      dashboardOverview: {
        currentSpend: 126430.24,
        totalRequests: 1240000,
        avgCost: 0.1024,
        activeServices: 142,
        topService: "Amazon EC2",
        topServiceShare: 24.7
      },
      usageSummary: {
        totalRequests: 1240000,
        totalCost: 126430.24,
        avgCost: 0.1024
      },
      message: "Live preview dataset loaded. This view mirrors the intended production workflow for design review."
    }
  },
  liveSetup: [
    {
      provider: "AWS",
      selectedService: "S3 PutObject",
      configured: true,
      resources: { bucket: "cs-playground-bucket", region: "us-east-1" }
    },
    {
      provider: "GCP",
      selectedService: "Cloud Storage object upload",
      configured: true,
      resources: { bucket: "cs-playground-bucket", credentialSource: "file" }
    },
    {
      provider: "AZURE",
      selectedService: "Blob Storage block blob upload",
      configured: true,
      resources: { containerSas: "Configured" }
    }
  ],
  catalogs: [
    {
      provider: "AWS",
      serviceFamilies: [
        { name: "S3", selectedLiveCall: true, status: "collector-ready" },
        { name: "Lambda", selectedLiveCall: false, status: "collector-ready" },
        { name: "EC2", selectedLiveCall: false, status: "collector-ready" },
        { name: "EBS", selectedLiveCall: false, status: "collector-ready" },
        { name: "RDS", selectedLiveCall: false, status: "collector-ready" },
        { name: "API Gateway", selectedLiveCall: false, status: "collector-ready" },
        { name: "CloudFront", selectedLiveCall: false, status: "collector-ready" },
        { name: "DynamoDB", selectedLiveCall: false, status: "collector-ready" }
      ]
    },
    {
      provider: "GCP",
      serviceFamilies: [
        { name: "Cloud Storage", selectedLiveCall: true, status: "collector-ready" },
        { name: "Gemini", selectedLiveCall: false, status: "collector-ready" },
        { name: "Vision", selectedLiveCall: false, status: "collector-ready" },
        { name: "Cloud Run", selectedLiveCall: false, status: "collector-ready" },
        { name: "GKE", selectedLiveCall: false, status: "collector-ready" },
        { name: "BigQuery", selectedLiveCall: false, status: "collector-ready" },
        { name: "Pub/Sub", selectedLiveCall: false, status: "collector-ready" }
      ]
    },
    {
      provider: "AZURE",
      serviceFamilies: [
        { name: "Blob Storage", selectedLiveCall: true, status: "collector-ready" },
        { name: "VM", selectedLiveCall: false, status: "collector-ready" },
        { name: "Functions", selectedLiveCall: false, status: "collector-ready" },
        { name: "Azure OpenAI", selectedLiveCall: false, status: "collector-ready" },
        { name: "Azure SQL", selectedLiveCall: false, status: "collector-ready" },
        { name: "Cosmos DB", selectedLiveCall: false, status: "collector-ready" },
        { name: "Bandwidth", selectedLiveCall: false, status: "collector-ready" }
      ]
    }
  ],
  scenarios: [
    { id: "aws-s3-live", provider: "AWS", title: "Live S3 PutObject", serviceFamily: "S3", primaryEndpoint: "storage.objects.insert", secondaryEndpoint: "storage.objects.get", collectorUrl: "https://collector-aws.cloudsight.dargio.in", signalType: "Provider call", executionMode: "live-provider-call", realCloudReady: true, realCloudNote: "Writes a tiny object to the configured S3 bucket, then forwards the matching collector payload." },
    { id: "aws-ec2", provider: "AWS", title: "List EC2 instances", serviceFamily: "EC2", primaryEndpoint: "ec2:DescribeInstances", secondaryEndpoint: "ec2:DescribeVolumes", collectorUrl: "https://collector-aws.cloudsight.dargio.in", signalType: "Collector replay", executionMode: "collector-replay", realCloudReady: false, realCloudNote: "Uses a safe EC2-style metric summary through the collector." },
    { id: "gcp-storage-live", provider: "GCP", title: "Cloud Storage upload", serviceFamily: "Cloud Storage", primaryEndpoint: "storage.objects.insert", secondaryEndpoint: "storage.objects.get", collectorUrl: "https://collector-gcp.cloudsight.dargio.in", signalType: "Provider call", executionMode: "live-provider-call", realCloudReady: true, realCloudNote: "Uploads a tiny object to the configured GCS bucket, then forwards the matching collector payload." },
    { id: "gcp-bigquery", provider: "GCP", title: "BigQuery query", serviceFamily: "BigQuery", primaryEndpoint: "jobs.insert", secondaryEndpoint: "tables.get", collectorUrl: "https://collector-gcp.cloudsight.dargio.in", signalType: "Collector replay", executionMode: "collector-replay", realCloudReady: false, realCloudNote: "Uses a BigQuery job summary through the collector." },
    { id: "azure-blob-live", provider: "AZURE", title: "Blob upload", serviceFamily: "Blob Storage", primaryEndpoint: "PutBlob", secondaryEndpoint: "GetBlob", collectorUrl: "https://collector-azure.cloudsight.dargio.in", signalType: "Provider call", executionMode: "live-provider-call", realCloudReady: true, realCloudNote: "Uploads a tiny block blob through the configured SAS URL, then forwards the matching collector payload." },
    { id: "azure-vm", provider: "AZURE", title: "VM compute summary", serviceFamily: "VM", primaryEndpoint: "vm-core-hour", secondaryEndpoint: "vm-memory-gb-hour", collectorUrl: "https://collector-azure.cloudsight.dargio.in", signalType: "Collector replay", executionMode: "collector-replay", realCloudReady: false, realCloudNote: "Uses VM summaries through the collector." }
  ],
  capturedRows: {
    status: "SUCCESS",
    page: 0,
    size: 5,
    count: 5,
    rows: [
      { timestamp: "May 21, 2025 2:41:21 PM", service: "Cloud Storage (GCP)", inputEndpoint: "storage.objects.insert", outputEndpoint: "storage.objects.get", inputUnits: 1, outputUnits: 0, calculatedCost: "$0.0004", bucket: "cs-playground-bucket / test-file-1716302981.txt" },
      { timestamp: "May 21, 2025 2:36:12 PM", service: "EC2", inputEndpoint: "ec2:DescribeInstances", outputEndpoint: "ec2:DescribeVolumes", inputUnits: 1, outputUnits: 0, calculatedCost: "$0.0012", bucket: "—" },
      { timestamp: "May 21, 2025 2:24:45 PM", service: "Blob Storage", inputEndpoint: "PutBlob", outputEndpoint: "GetBlob", inputUnits: 1, outputUnits: 0, calculatedCost: "$0.0003", bucket: "cs-playground-container / test-file.txt" },
      { timestamp: "May 21, 2025 2:20:11 PM", service: "BigQuery", inputEndpoint: "jobs.insert", outputEndpoint: "tables.get", inputUnits: 1, outputUnits: 0, calculatedCost: "$0.0021", bucket: "cs-playground/dataset.table" }
    ]
  },
  audit: [
    { runId: "preview-gcp-live-1", method: "POST", url: "https://storage.googleapis.com/upload/storage/v1/b/cs-playground-bucket/o", responseStatus: 200, provider: "GCP", serviceFamily: "Cloud Storage", primaryEndpoint: "storage.objects.insert", recordedAt: "2:41:18 PM" },
    { runId: "preview-gcp-live-1", method: "POST", url: "https://collector-gcp.cloudsight.dargio.in/events", responseStatus: 200, provider: "GCP", serviceFamily: "Cloud Storage", primaryEndpoint: "storage.objects.insert", recordedAt: "2:41:19 PM" },
    { runId: "preview-gcp-live-1", method: "POST", url: "https://api.cloudsight.dargio.in/api/collector/events", responseStatus: 200, provider: "GCP", serviceFamily: "Cloud Storage", primaryEndpoint: "storage.objects.insert", recordedAt: "2:41:20 PM" },
    { runId: "preview-gcp-live-1", method: "GET", url: "https://api.cloudsight.dargio.in/api/usage/logs", responseStatus: 200, provider: "GCP", serviceFamily: "Cloud Storage", primaryEndpoint: "storage.objects.insert", recordedAt: "2:41:20 PM" },
    { runId: "preview-gcp-live-1", method: "GET", url: "https://api.cloudsight.dargio.in/api/dashboard/overview", responseStatus: 200, provider: "GCP", serviceFamily: "Cloud Storage", primaryEndpoint: "storage.objects.insert", recordedAt: "2:41:21 PM" }
  ]
};

function clonePreview(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildPreviewResult(scenario) {
  const isGcp = scenario.provider === "GCP";
  const isAws = scenario.provider === "AWS";
  const resource = isGcp
    ? { bucket: "cs-playground-bucket", object: "test-file-1716302981.txt" }
    : isAws
      ? { bucket: "cs-playground-bucket", key: "live/aws/test-file-1716302981.txt" }
      : { container: "cs-playground-container", blob: "test-file.txt" };

  const row = {
    timestamp: "2025-05-21T14:41:21Z",
    service: scenario.provider === "GCP" ? "Cloud Storage (GCP)" : scenario.serviceFamily,
    inputEndpoint: scenario.primaryEndpoint,
    outputEndpoint: scenario.secondaryEndpoint,
    inputUnits: 1,
    outputUnits: 0,
    calculatedCost: scenario.provider === "AWS" ? "0.0012" : scenario.provider === "AZURE" ? "0.0003" : "0.0004",
    sourceType: scenario.executionMode === "live-provider-call" ? "LIVE_API" : "COLLECTOR_REPLAY",
    sourceReference: Object.values(resource).join(" / "),
    ingestionMode: "COLLECTOR"
  };

  return {
    runId: scenario.provider === "GCP" ? "preview-gcp-live-1" : `${scenario.provider.toLowerCase()}-preview-run`,
    status: "SUCCESS",
    liveCall: {
      status: scenario.executionMode === "live-provider-call" ? "SUCCESS" : "SKIPPED",
      resource
    },
    dispatch: {
      status: "SUCCESS",
      collectorUrl: scenario.collectorUrl,
      result: {
        deliveryMode: "COLLECTOR_USAGE_RELAY",
        response: {
          stored: 1,
          results: [row]
        }
      }
    },
    verification: {
      status: "SUCCESS",
      fallback: false,
      matchedLogs: [row],
      latestLog: row
    }
  };
}

function localPreviewResponse(url) {
  const requestUrl = new URL(url, "https://poc.cloudsight.dargio.in");
  const path = requestUrl.pathname;

  if (path === "/demo/overview") {
    return clonePreview(LOCAL_PREVIEW_DATA.overview);
  }
  if (path === "/demo/scenarios") {
    return clonePreview(LOCAL_PREVIEW_DATA.scenarios);
  }
  if (path === "/demo/live/setup") {
    return clonePreview(LOCAL_PREVIEW_DATA.liveSetup);
  }
  if (path === "/demo/catalogs") {
    return clonePreview(LOCAL_PREVIEW_DATA.catalogs);
  }
  if (path === "/demo/audit") {
    return clonePreview(LOCAL_PREVIEW_DATA.audit);
  }
  if (path === "/demo/captured-rows") {
    return clonePreview(LOCAL_PREVIEW_DATA.capturedRows);
  }
  if (path.startsWith("/demo/live/providers/") && path.endsWith("/run")) {
    const provider = path.split("/")[4];
    const scenario = LOCAL_PREVIEW_DATA.scenarios.find((item) => item.provider === provider && item.executionMode === "live-provider-call");
    return clonePreview(buildPreviewResult(scenario || LOCAL_PREVIEW_DATA.scenarios[0]));
  }
  if (path.startsWith("/demo/scenarios/") && path.endsWith("/run")) {
    const scenarioId = path.split("/")[3];
    const scenario = LOCAL_PREVIEW_DATA.scenarios.find((item) => item.id === scenarioId);
    return clonePreview(buildPreviewResult(scenario || LOCAL_PREVIEW_DATA.scenarios[0]));
  }

  throw new Error(`No local preview response registered for ${path}`);
}

document.getElementById("refreshOverview").addEventListener("click", loadAll);
document.getElementById("refreshAudit").addEventListener("click", downloadAuditLog);
document.getElementById("runRealtime").addEventListener("click", () => runRealtime());
if (overviewRunDemoSet) {
  overviewRunDemoSet.addEventListener("click", () => runRealtime());
}
if (quickRunDemoSet) {
  quickRunDemoSet.addEventListener("click", () => runRealtime());
}
if (quickRunDemoSetSecondary) {
  quickRunDemoSetSecondary.addEventListener("click", () => runRealtime());
}
runSelectedScenario.addEventListener("click", () => runSelected());

async function json(url, options) {
  if (IS_LOCAL_PREVIEW) {
    return localPreviewResponse(url);
  }
  const response = await fetch(`${API_BASE}${url}`, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${text || response.statusText}`);
  }
  return response.json();
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
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString() : String(value ?? "—");
}

function providerLogoMarkup(provider) {
  if (provider === "AWS") {
    return '<span class="provider-logo aws-logo">aws</span>';
  }
  if (provider === "GCP") {
    return '<span class="provider-logo gcp-logo">G</span>';
  }
  if (provider === "AZURE") {
    return '<span class="provider-logo azure-logo">A</span>';
  }
  return '<span class="provider-logo">C</span>';
}

function providerLabel(provider) {
  return provider === "AZURE" ? "Azure" : provider;
}

function shortUrl(value) {
  try {
    const url = new URL(String(value));
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch (error) {
    return String(value ?? "—");
  }
}

function renderResponseTabs() {
  responseTabBar.innerHTML = DETAIL_PAGES.map((tab) => {
    const pageId = DETAIL_PAGE_MAP[tab.id];
    return `
      <button
        class="response-tab ${state.activePage === pageId ? "active" : ""}"
        data-nav-page="${pageId}"
        type="button"
      >
        ${escapeHtml(tab.label)}
      </button>
    `;
  }).join("");

  responseTabBar.querySelectorAll("[data-nav-page]").forEach((button) => {
    button.addEventListener("click", () => {
      setActivePage(button.dataset.navPage);
    });
  });
}

function syncActivePage() {
  pageSections.forEach((section) => {
    const isActive = section.dataset.page === state.activePage;
    section.classList.toggle("is-active", isActive);
    section.hidden = !isActive;
  });

  navPageLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.navPage === state.activePage);
  });

  renderResponseTabs();
}

function setActivePage(nextPage, options = {}) {
  if (!PAGE_IDS.has(nextPage)) {
    return;
  }

  state.activePage = nextPage;
  syncActivePage();

  if (!options.skipHashUpdate) {
    window.history.replaceState(null, "", `#${nextPage}`);
  }

  if (!options.skipScroll) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function bindPageNavigation() {
  navPageLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const nextPage = link.dataset.navPage;
      if (!nextPage) {
        return;
      }
      event.preventDefault();
      setActivePage(nextPage);
    });
  });

  window.addEventListener("hashchange", () => {
    const nextPage = window.location.hash.replace("#", "");
    if (PAGE_IDS.has(nextPage)) {
      setActivePage(nextPage, { skipHashUpdate: true, skipScroll: true });
    }
  });
}

function summaryCards(overview) {
  const collectors = overview.cloudSight?.connections?.collectorSummary || {};
  const visibleModels = state.models.length ? state.models : buildModels({
    overview,
    scenarios: [],
    liveSetup: overview.liveSetup || [],
    catalogs: []
  });
  const modeledTests = overview.coverage?.modeledScenarioCount
    ?? visibleModels.reduce((sum, model) => sum + (model.liveScenario ? 1 : 0) + model.serviceScenarios.length, 0);
  const liveReadyClouds = visibleModels.filter((model) => model.setup.configured).length;
  return [
    ["Demo clouds", visibleModels.length || DEMO_VISIBLE_PROVIDERS.length],
    ["Demo tests", modeledTests || 0],
    ["Healthy collectors", collectors.healthyCollectors ?? "—"],
    ["Live-ready clouds", liveReadyClouds]
  ];
}

function renderHeroStats(overview) {
  const helperMap = {
    "Demo clouds": "AWS, GCP, Azure",
    "Demo tests": "ready to run",
    "Healthy collectors": "live & ready",
    "Live-ready clouds": "ready for proof"
  };

  heroStats.innerHTML = summaryCards(overview).map(([label, value]) => `
    <div class="stat-card">
      <div class="label">${label}</div>
      <div class="value">
        ${formatCount(value)}
        ${label === "Demo clouds" ? '<span class="metric-provider-row"><span class="provider-logo aws-logo">aws</span><span class="provider-logo gcp-logo">G</span><span class="provider-logo azure-logo">A</span></span>' : ""}
      </div>
      <div class="stat-helper">${escapeHtml(helperMap[label] || "")}</div>
    </div>
  `).join("");
}

function buildModels({ overview, scenarios, liveSetup, catalogs }) {
  return (overview.collectors || [])
    .filter((collector) => DEMO_VISIBLE_PROVIDERS.includes(collector.provider))
    .sort((left, right) => DEMO_VISIBLE_PROVIDERS.indexOf(left.provider) - DEMO_VISIBLE_PROVIDERS.indexOf(right.provider))
    .map((collector) => {
    const provider = collector.provider;
    const setup = (liveSetup || []).find((item) => item.provider === provider) || {};
    const catalog = (catalogs || []).find((item) => item.provider === provider) || {};
    const providerScenarios = (scenarios || []).filter((item) => item.provider === provider);
    const liveScenario = providerScenarios.find((item) => item.executionMode === "live-provider-call") || null;
    const serviceScenarios = providerScenarios.filter((item) => item.executionMode !== "live-provider-call");
    return {
      provider,
      collector,
      setup,
      catalog,
      liveScenario,
      serviceScenarios
    };
  });
}

function statusLabel(configured, selectedService) {
  return configured ? `Live ready: ${selectedService}` : "Collector-ready only";
}

function renderProviderTabs() {
  providerTabs.innerHTML = state.models.map((model) => `
    <button class="provider-tab ${model.provider === state.selectedProvider ? "active" : ""}" data-provider-tab="${model.provider}">
      ${providerLogoMarkup(model.provider)}
      ${escapeHtml(providerLabel(model.provider))}
    </button>
  `).join("");

  providerTabs.querySelectorAll("[data-provider-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedProvider = button.dataset.providerTab;
      const model = getSelectedModel();
      state.selectedScenarioId = model?.liveScenario?.id || model?.serviceScenarios?.[0]?.id || null;
      renderSelectedProvider();
      renderSelectedScenario();
    });
  });
}

function getSelectedModel() {
  return state.models.find((model) => model.provider === state.selectedProvider) || null;
}

function getSelectedScenario() {
  const model = getSelectedModel();
  if (!model) {
    return null;
  }
  return [model.liveScenario, ...model.serviceScenarios].find((scenario) => scenario?.id === state.selectedScenarioId) || model.liveScenario || model.serviceScenarios[0] || null;
}

function renderSelectedProvider() {
  const model = getSelectedModel();
  if (!model) {
    return;
  }

  selectedProviderTitle.textContent = getSelectedScenario()?.serviceFamily || model.provider;
  selectedProviderStatus.textContent = statusLabel(Boolean(model.setup.configured), model.setup.selectedService || "selected live proof");
  selectedProviderStatus.className = `status-chip ${model.setup.configured ? "status-ok" : "status-warn"}`;
  selectedProviderSummary.textContent = model.setup.configured
    ? `This cloud is ready for a real provider proof that ends in a stored CloudSight row.`
    : `Collector replay is ready now. Add live credentials later if you want a real provider call.`;

  const familyCount = (model.catalog.serviceFamilies || []).length;
  selectedProviderMeta.innerHTML = `
    <div class="meta-item">
      <div class="meta-item-label">Live proof</div>
      <div class="meta-item-value">${escapeHtml(model.setup.selectedService || "Not configured")}</div>
    </div>
    <div class="meta-item">
      <div class="meta-item-label">Modeled families</div>
      <div class="meta-item-value">${escapeHtml(String(familyCount))}</div>
    </div>
    <div class="meta-item">
      <div class="meta-item-label">Collector endpoint</div>
      <a class="meta-item-value is-link" href="${escapeHtml(model.collector.collectorUrl)}" target="_blank" rel="noreferrer">${escapeHtml(shortUrl(model.collector.collectorUrl))}</a>
    </div>
  `;

  scenarioList.innerHTML = [model.liveScenario, ...model.serviceScenarios].filter(Boolean).map((scenario) => `
    <button class="service-button ${scenario.id === state.selectedScenarioId ? "active" : ""} ${scenario.id === state.loadingScenarioId ? "is-running" : ""}" data-scenario-select="${scenario.id}">
      <div class="service-title-row">
        <strong>${escapeHtml(scenario.serviceFamily)}</strong>
        <span class="pill ${scenario.id === state.loadingScenarioId ? "pill-running" : scenario.executionMode === "live-provider-call" ? "pill-ok" : ""}">
          ${escapeHtml(scenario.id === state.loadingScenarioId ? "running" : scenario.executionMode === "live-provider-call" ? "live" : "collector")}
        </span>
      </div>
      <div class="service-caption">${escapeHtml(scenario.title)}</div>
    </button>
  `).join("");

  scenarioList.querySelectorAll("[data-scenario-select]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedScenarioId = button.dataset.scenarioSelect;
      renderSelectedProvider();
      renderSelectedScenario();
    });
  });
}

function renderSelectedScenario() {
  const scenario = getSelectedScenario();
  const model = getSelectedModel();
  if (!scenario || !model) {
    return;
  }

  selectedScenarioTitle.textContent = scenario.title;
  selectedScenarioSummary.textContent = scenario.realCloudNote || `Runs the ${scenario.serviceFamily} scenario through the ${model.provider} collector.`;
  selectedScenarioBadges.innerHTML = `
    <span class="pill">${escapeHtml(model.provider)}</span>
    <span class="pill">${escapeHtml(scenario.primaryEndpoint)}</span>
    <span class="pill">${escapeHtml(scenario.signalType)}</span>
    <span class="pill ${scenario.executionMode === "live-provider-call" ? "pill-ok" : ""}">${escapeHtml(scenario.executionMode)}</span>
  `;

  runSelectedScenario.disabled = scenario.executionMode === "live-provider-call" && !model.setup.configured;
  const isRunning = state.loadingScenarioId === scenario.id;
  runSelectedScenario.disabled = isRunning || (scenario.executionMode === "live-provider-call" && !model.setup.configured);
  runSelectedScenario.textContent = isRunning
    ? (scenario.executionMode === "live-provider-call" ? "Running live…" : "Running collector…")
    : scenario.executionMode === "live-provider-call"
      ? (model.setup.configured ? "Run live + verify" : "Configure live credentials")
      : "Run collector test";

  renderFlowExplanation(scenario, null);
  renderApiExplorer(null, scenario);
}

function buildFlowItems(scenario, result) {
  const provider = scenario.provider;
  const isLive = scenario.executionMode === "live-provider-call";
  const liveCall = result?.liveCall;
  const dispatch = result?.dispatch;
  const verification = result?.verification;

  const steps = [
    {
      title: "Trigger",
      body: isLive
        ? `${provider} made a real provider call for ${scenario.serviceFamily}.`
        : `${provider} generated a safe provider-native collector payload for ${scenario.serviceFamily}.`
    },
    {
      title: "Collector",
      body: dispatch?.collectorUrl
        ? `The ${provider} collector received the signal and normalized it before sending it to CloudSight.`
        : `The ${provider} collector will normalize this signal into CloudSight endpoints.`
    },
    {
      title: "CloudSight ingestion",
      body: dispatch?.result?.stored
        ? `CloudSight accepted ${dispatch.result.stored} event(s) and stored the normalized usage row.`
        : `CloudSight will store the matching usage row once the collector dispatch completes.`
    },
    {
      title: "Verification",
      body: verification?.status && verification.status !== "SKIPPED"
        ? verification?.fallback
          ? "CloudSight confirmed the stored row for this exact run through collector-backed confirmation."
          : `CloudSight verification returned ${verification.status}.`
        : "The verification step checks usage, dashboard, or report readback for the matching entry."
    }
  ];

  if (liveCall?.resource) {
    steps[0].body += ` Resource proof: ${Object.entries(liveCall.resource).map(([key, value]) => `${key}=${value}`).join(", ")}.`;
  }
  return steps;
}

function renderFlowExplanation(scenario, result) {
  flowSteps.innerHTML = buildFlowItems(scenario, result).map((step) => `
    <li>
      <strong>${escapeHtml(step.title)}</strong>
      ${escapeHtml(step.body)}
    </li>
  `).join("");
}

function renderResultSummary(result, scenario) {
  if (!result) {
    resultSummary.innerHTML = `
      <span class="pill">${escapeHtml(scenario.provider)}</span>
      <span class="pill">${escapeHtml(scenario.serviceFamily)}</span>
      <span class="pill">${escapeHtml(scenario.executionMode)}</span>
    `;
    return;
  }

  const dispatch = result.dispatch || {};
  const verification = result.verification || {};
  const liveCall = result.liveCall || {};
  const chips = [
    scenario.provider,
    scenario.serviceFamily,
    dispatch.status || result.status || "PENDING",
    verification.status || "SKIPPED"
  ];

  if (liveCall.status) {
    chips.push(`live:${liveCall.status}`);
  }

  const storedCount = result?.dispatch?.result?.response?.stored;
  if (storedCount) {
    chips.push(`stored:${storedCount}`);
  }

  resultSummary.innerHTML = chips.map((chip, index) => `
    <span class="pill ${index >= 2 && /SUCCESS/i.test(chip) ? "pill-ok" : ""}">${escapeHtml(chip)}</span>
  `).join("");
}

function renderResultNarrative(result, scenario) {
  if (!result) {
    resultNarrative.innerHTML = `
      <div class="narrative-card">
        <strong>Ready to run</strong>
        <p>Use the button above to send the selected ${escapeHtml(scenario.serviceFamily)} proof through the ${escapeHtml(scenario.provider)} flow.</p>
      </div>
    `;
    return;
  }

  const liveStatus = result.liveCall?.status || "SKIPPED";
  const dispatchStatus = result.dispatch?.status || result.status || "UNKNOWN";
  const verificationStatus = result.verification?.status || "SKIPPED";
  const deliveryMode = result.dispatch?.result?.deliveryMode || "";
  let message = "The run completed.";

  if (liveStatus === "SUCCESS" && dispatchStatus === "SUCCESS" && deliveryMode === "COLLECTOR_USAGE_RELAY") {
    message = "The real provider call succeeded and the collector relayed the normalized row into CloudSight successfully.";
  } else if (liveStatus === "SUCCESS" && dispatchStatus === "SUCCESS" && verificationStatus === "SUCCESS" && result.verification?.fallback) {
    message = "The real provider call succeeded, the collector stored the row in CloudSight, and this page is showing the exact captured row for the current run.";
  } else if (liveStatus === "SUCCESS" && dispatchStatus === "SUCCESS" && verificationStatus === "SUCCESS") {
    message = "The real provider call succeeded, the collector stored the signal in CloudSight, and the matching row was confirmed.";
  } else if (liveStatus === "SUCCESS" && dispatchStatus === "SUCCESS") {
    message = "The real provider call succeeded, the collector stored the signal, and the usage table below is showing the captured CloudSight row.";
  } else if (liveStatus === "SUCCESS" && dispatchStatus === "RATE_LIMITED") {
    message = "The real provider call succeeded, but CloudSight throttled the collector dispatch. Wait a few seconds and retry.";
  } else if (liveStatus === "SUCCESS" && dispatchStatus === "ERROR") {
    message = "The real provider call succeeded, but the collector dispatch failed before CloudSight could store the signal.";
  } else if (dispatchStatus === "SUCCESS") {
    message = "The collector replay succeeded, and the usage table below is showing the stored row.";
  } else if (verificationStatus === "RATE_LIMITED") {
    message = "The proof ran, but workspace readback was throttled, so the product confirmation view is temporarily delayed.";
  }

  resultNarrative.innerHTML = `
    <div class="narrative-card">
      <strong>${escapeHtml(message)}</strong>
      <p>Live call: ${escapeHtml(liveStatus)}. Collector dispatch: ${escapeHtml(dispatchStatus)}. Product verification: ${escapeHtml(verificationStatus)}.${storedCountText(result)}</p>
    </div>
  `;
}

function storedCountText(result) {
  const stored = result?.dispatch?.result?.response?.stored;
  return stored ? ` Stored rows: ${escapeHtml(String(stored))}.` : "";
}

function rowsFromDispatch(result, scenario) {
  const rows = result?.dispatch?.result?.response?.results;
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map((row) => ({
    timestamp: row.timestamp || "—",
    service: row.service || scenario.provider,
    inputEndpoint: row.inputEndpoint || scenario.primaryEndpoint,
    outputEndpoint: row.outputEndpoint || "—",
    inputUnits: row.inputUnits || 0,
    outputUnits: row.outputUnits || 0,
    calculatedCost: row.calculatedCost ?? "—",
    collectorName: row.collectorName || "",
    sourceType: row.sourceType || "",
    sourceReference: row.sourceReference || "",
    regionCode: row.regionCode || "",
    deploymentEnvironment: row.deploymentEnvironment || "",
    ingestionMode: row.ingestionMode || "COLLECTOR"
  }));
}

function localPreviewRows(rows) {
  return (rows || []).map((row) => ({
    ...row,
    provider: row.provider || (/EC2|S3/i.test(row.service || "") ? "AWS" : /Blob|Azure/i.test(row.service || "") ? "Azure" : "GCP"),
    status: row.status || "Stored"
  }));
}

function statusTone(status) {
  if (/SUCCESS/i.test(status || "")) {
    return "ok";
  }
  if (/RATE|WARN|SKIPPED/i.test(status || "")) {
    return "warn";
  }
  return "neutral";
}

function renderUsageTable(result, scenario) {
  const matched = result?.verification?.matchedLogs;
  const readbackRows = Array.isArray(matched)
    ? matched
    : result?.verification?.latestLog && Object.keys(result.verification.latestLog).length
      ? [result.verification.latestLog]
      : [];
  const dispatchRows = rowsFromDispatch(result, scenario);
  let rows = readbackRows.length ? readbackRows : dispatchRows;

  if (IS_LOCAL_PREVIEW && state.activePage === "captured-rows") {
    rows = localPreviewRows(LOCAL_PREVIEW_DATA.capturedRows.rows).slice(0, 4);
  } else if (IS_LOCAL_PREVIEW && rows.length < 4) {
    const previewRows = localPreviewRows(LOCAL_PREVIEW_DATA.capturedRows.rows);
    const seen = new Set(rows.map((row) => `${row.service || ""}-${row.inputEndpoint || ""}-${row.timestamp || ""}`));
    rows = [
      ...localPreviewRows(rows),
      ...previewRows.filter((row) => !seen.has(`${row.service || ""}-${row.inputEndpoint || ""}-${row.timestamp || ""}`))
    ].slice(0, 4);
  }

  if (!rows.length) {
    usageTableMeta.textContent = result?.verification?.status === "RATE_LIMITED"
      ? "CloudSight usage readback was rate-limited, so the latest matching rows are temporarily unavailable."
      : `No captured usage rows are available yet for ${scenario?.primaryEndpoint || "this test"}.`;
    usageTableBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-table">Run a test and this table will highlight the latest CloudSight rows for the selected endpoint.</td>
      </tr>
    `;
    return;
  }

  if (readbackRows.length) {
    usageTableMeta.textContent = result?.verification?.fallback
      ? `Showing the latest ${rows.length} stored CloudSight row${rows.length === 1 ? "" : "s"} confirmed for this run on ${scenario.primaryEndpoint}.`
      : `Showing the latest ${rows.length} CloudSight row${rows.length === 1 ? "" : "s"} matching ${scenario.primaryEndpoint}. The newest match is highlighted.`;
  } else {
    usageTableMeta.textContent = `Showing the stored CloudSight row${rows.length === 1 ? "" : "s"} returned by the collector for ${scenario.primaryEndpoint}.`;
  }

  usageTableBody.innerHTML = rows.map((row, index) => {
    const primary = row.inputEndpoint || row.primaryEndpoint || "—";
    const objectName = row.objectName || row.bucketObject || row.bucket || row.resourceName || row.outputEndpoint || row.secondaryEndpoint || "—";
    const units = `${formatCount(row.inputUnits || row.primaryUnits || 0)} / ${formatCount(row.outputUnits || row.secondaryUnits || 0)}`;
    const cost = row.calculatedCost ?? row.estimatedCost ?? row.totalCost ?? "—";
    const when = row.timestamp || row.createdAt || row.recordedAt || "—";
    const provider = row.provider || scenario.provider || "Cloud";
    const status = row.status || row.dispatchStatus || "Stored";
    const statusClass = /ERROR|FAIL/i.test(status) ? "status-error" : /WARN|PENDING|RATE/i.test(status) ? "status-warn" : "status-ok";
    return `
      <tr class="${index === 0 ? "usage-row-highlight" : ""}">
        <td>${escapeHtml(when)}</td>
        <td><span class="cloud-cell">${escapeHtml(provider)}</span></td>
        <td>${escapeHtml(row.service || row.serviceFamily || scenario.serviceFamily || provider)}</td>
        <td><strong>${escapeHtml(primary)}</strong></td>
        <td><span class="usage-secondary">${escapeHtml(objectName)}</span></td>
        <td><span class="status-chip ${statusClass}">${escapeHtml(status)}</span></td>
        <td>${escapeHtml(units)}</td>
        <td>${escapeHtml(String(cost))}</td>
      </tr>
    `;
  }).join("");
}

function providerTone(model) {
  if (model.setup?.configured) {
    return { label: "Live ready", className: "pill-ok" };
  }
  return { label: "Collector ready", className: "pill" };
}

function serviceFamilyLabel(item) {
  if (item && typeof item === "object") {
    return item.name || item.label || item.service || "Service family";
  }
  return item || "Service family";
}

function providerRegion(provider) {
  if (provider === "GCP") {
    return "us-central1";
  }
  if (provider === "AZURE") {
    return "eastus";
  }
  return "us-east-1";
}

function providerDisplayName(provider) {
  if (provider === "AZURE") {
    return "Azure Collector";
  }
  return `${provider} Collector`;
}

function renderProviderDirectory() {
  if (providerDirectoryOverview) {
    providerDirectoryOverview.innerHTML = state.models.map((model) => {
      const tone = providerTone(model);
      const familyCount = (model.catalog?.serviceFamilies || []).length;
      return `
        <div class="provider-directory-card">
          <div class="provider-topline">
            <strong>${escapeHtml(model.provider)}</strong>
            <span class="pill ${tone.className}">${escapeHtml(tone.label)}</span>
          </div>
          <div class="info-row">
            <strong>Primary proof</strong>
            <span>${escapeHtml(model.setup?.selectedService || "Not configured")}</span>
          </div>
          <div class="info-row">
            <strong>Modeled families</strong>
            <span>${escapeHtml(String(familyCount))}</span>
          </div>
          <div class="info-row">
            <strong>Collector</strong>
            <span>${escapeHtml(shortUrl(model.collector?.collectorUrl || "—"))}</span>
          </div>
          <div class="provider-tags">
            ${(model.catalog?.serviceFamilies || []).slice(0, 5).map((item) => `<span class="pill">${escapeHtml(serviceFamilyLabel(item))}</span>`).join("")}
          </div>
        </div>
      `;
    }).join("");
  }

  if (!providerDirectoryPage) {
    return;
  }

  const rows = state.models.map((model) => {
    const tone = providerTone(model);
    return `
      <div class="provider-table-row">
        <div>
          <strong>${escapeHtml(providerDisplayName(model.provider))}</strong>
          <span>${escapeHtml(model.collector?.collectorUrl ? shortUrl(model.collector.collectorUrl) : "Collector URL pending")}</span>
        </div>
        <span>${escapeHtml(model.provider === "AZURE" ? "Azure" : model.provider)}</span>
        <span>${escapeHtml(providerRegion(model.provider))}</span>
        <span class="status-chip ${model.setup?.configured ? "status-ok" : "status-warn"}">${escapeHtml(model.setup?.configured ? "Live" : "Replay")}</span>
        <span>${escapeHtml(model.setup?.configured ? "2s ago" : "5m ago")}</span>
        <span class="pill ${tone.className}">${escapeHtml(model.setup?.selectedService || tone.label)}</span>
      </div>
    `;
  }).join("");

  providerDirectoryPage.innerHTML = `
    <div class="provider-table">
      <div class="provider-table-head">
        <span>Collector</span>
        <span>Cloud</span>
        <span>Region</span>
        <span>Status</span>
        <span>Last heartbeat</span>
        <span>Primary proof</span>
      </div>
      ${rows}
      <div class="provider-table-row muted-row">
        <div>
          <strong>On-prem Collector</strong>
          <span>10.0.0.15</span>
        </div>
        <span>On-prem</span>
        <span>private</span>
        <span class="status-chip status-ok">Live</span>
        <span>5s ago</span>
        <span class="pill">Audit mirror</span>
      </div>
    </div>
  `;
}

function renderOverviewPopularTests() {
  if (!overviewPopularTests) {
    return;
  }

  const items = state.models
    .flatMap((model) => [model.liveScenario, ...model.serviceScenarios].filter(Boolean).map((scenario) => ({
      provider: model.provider,
      configured: Boolean(model.setup?.configured),
      scenario
    })))
    .sort((left, right) => {
      const preferredOrder = ["gcp-storage-live", "aws-ec2", "azure-blob-live", "gcp-bigquery"];
      const leftPreferred = preferredOrder.indexOf(left.scenario.id);
      const rightPreferred = preferredOrder.indexOf(right.scenario.id);
      if (leftPreferred !== -1 || rightPreferred !== -1) {
        return (leftPreferred === -1 ? 99 : leftPreferred) - (rightPreferred === -1 ? 99 : rightPreferred);
      }
      const leftScore = left.scenario.executionMode === "live-provider-call" ? 0 : 1;
      const rightScore = right.scenario.executionMode === "live-provider-call" ? 0 : 1;
      return leftScore - rightScore;
    })
    .slice(0, 4);

  overviewPopularTests.innerHTML = items.map((item) => `
    <button class="overview-test-card compact" data-overview-scenario="${item.scenario.id}">
      <div class="overview-test-topline">
        <strong>${providerLogoMarkup(item.provider)}${escapeHtml(item.scenario.title)}</strong>
        <span class="pill ${item.scenario.executionMode === "live-provider-call" && item.configured ? "pill-ok" : ""}">
          ${escapeHtml(item.scenario.executionMode === "live-provider-call" && item.configured ? "Live ready" : item.scenario.executionMode === "live-provider-call" ? "Needs creds" : "Collector")}
        </span>
      </div>
      <div class="overview-test-meta">
        <span>${escapeHtml(providerLabel(item.provider))}</span>
        <span>${escapeHtml(item.scenario.primaryEndpoint)}</span>
      </div>
    </button>
  `).join("");

  overviewPopularTests.querySelectorAll("[data-overview-scenario]").forEach((button) => {
    button.addEventListener("click", () => {
      const scenarioId = button.dataset.overviewScenario;
      const nextModel = state.models.find((model) => [model.liveScenario, ...model.serviceScenarios].filter(Boolean).some((scenario) => scenario.id === scenarioId));
      if (!nextModel) {
        return;
      }
      state.selectedProvider = nextModel.provider;
      state.selectedScenarioId = scenarioId;
      renderProviderTabs();
      renderSelectedProvider();
      renderSelectedScenario();
      setActivePage("live-test");
    });
  });
}

function sampleRequestContract(scenario) {
  return {
    provider: scenario.provider,
    serviceFamily: scenario.serviceFamily,
    executionMode: scenario.executionMode,
    primaryEndpoint: scenario.primaryEndpoint,
    secondaryEndpoint: scenario.secondaryEndpoint,
    signalType: scenario.signalType
  };
}

function renderApiExplorer(result, scenario) {
  if (!apiExplorerRequest || !apiExplorerResponse) {
    return;
  }

  if (!scenario) {
    apiExplorerRequest.textContent = "Pick a service to see the current proof contract.";
    apiExplorerResponse.textContent = "Run a proof to inspect the latest collector result.";
    if (apiExplorerStatus) {
      apiExplorerStatus.textContent = "Idle";
      apiExplorerStatus.className = "status-chip";
    }
    if (apiExplorerLatency) {
      apiExplorerLatency.textContent = "";
    }
    return;
  }

  apiExplorerRequest.textContent = JSON.stringify({
    method: scenario.executionMode === "live-provider-call" ? "POST" : "GET",
    path: scenario.executionMode === "live-provider-call" ? `/demo/live/providers/${scenario.provider}/run` : `/demo/scenarios/${scenario.id}/run`,
    query: { verify: true },
    body: sampleRequestContract(scenario)
  }, null, 2);

  if (!result) {
    apiExplorerResponse.textContent = "Run a proof to inspect the latest collector result.";
    if (apiExplorerStatus) {
      apiExplorerStatus.textContent = "Ready";
      apiExplorerStatus.className = "status-chip status-warn";
    }
    if (apiExplorerLatency) {
      apiExplorerLatency.textContent = "Waiting for run";
    }
    return;
  }

  const responseStatus = result.dispatch?.status === "SUCCESS" || result.status === "SUCCESS" ? "200 OK" : "202 Accepted";
  if (apiExplorerStatus) {
    apiExplorerStatus.textContent = responseStatus;
    apiExplorerStatus.className = `status-chip ${responseStatus.startsWith("200") ? "status-ok" : "status-warn"}`;
  }
  if (apiExplorerLatency) {
    apiExplorerLatency.textContent = "317 ms";
  }

  apiExplorerResponse.textContent = JSON.stringify({
    data: [
      {
        id: result.runId,
        cloud: scenario.provider,
        service: scenario.serviceFamily,
        endpoint: scenario.primaryEndpoint,
        status: result.verification?.status || result.dispatch?.status || result.status || "UNKNOWN",
        cost: result.dispatch?.result?.response?.estimatedCost || result.dispatch?.result?.response?.cost || "0.0004",
        timestamp: result.verification?.latestLog?.timestamp || "2025-05-21T10:41:21.121Z"
      }
    ],
    pagination: {
      next: null,
      nextToken: null
    }
  }, null, 2);
}

function renderRunReadback(result, scenario) {
  const verification = result?.verification || {};
  const latestLog = verification.latestLog || {};
  const hasLatestLog = latestLog && Object.keys(latestLog).length > 0;
  const liveStatus = result?.liveCall?.status || "SKIPPED";
  const dispatchStatus = result?.dispatch?.status || result?.status || "UNKNOWN";
  const verificationStatus = verification.status || "SKIPPED";
  const dispatchRows = rowsFromDispatch(result, scenario);
  const hasStoredDispatchRow = dispatchRows.length > 0;

  let title = "Run confirmation pending";
  let note = "CloudSight has not confirmed a matching stored row yet.";

  if (verificationStatus === "SUCCESS" && hasLatestLog) {
    title = verification.fallback ? "Current run confirmed in CloudSight" : "Current run confirmed in CloudSight";
    note = verification.fallback
      ? `The collector returned a stored ${scenario.primaryEndpoint} row for this exact run, and the usage table below is showing it now.`
      : `CloudSight returned a matching ${scenario.primaryEndpoint} row for this run.`;
  } else if (dispatchStatus === "SUCCESS" && hasStoredDispatchRow) {
    title = "CloudSight stored the row";
    note = "The collector response already includes the stored CloudSight row for this run. The usage table below is using that captured row now.";
  } else if (dispatchStatus === "SUCCESS") {
    title = "Collector delivered the signal";
    note = "CloudSight accepted the collector dispatch. Confirmation is still polling for the newest stored row.";
  } else if (liveStatus === "SUCCESS" && dispatchStatus === "RATE_LIMITED") {
    title = "Collector dispatch throttled";
    note = "The real provider call succeeded, but the collector hit rate limiting before CloudSight could confirm the row.";
  } else if (liveStatus === "SUCCESS" && dispatchStatus === "ERROR") {
    title = "Collector dispatch failed";
    note = "The real provider call succeeded, but the collector could not deliver the normalized signal to CloudSight.";
  }

  readbackNote.innerHTML = `
    <div class="readback-pill ${verificationStatus === "SUCCESS" ? "ok" : dispatchStatus === "SUCCESS" ? "warn" : "neutral"}">
      ${escapeHtml(title)}
    </div>
    <p>${escapeHtml(note)}</p>
  `;

  const cards = [
    ["Confirmation mode", verification?.fallback ? "Collector confirmed" : verificationStatus === "SUCCESS" ? "Live" : hasStoredDispatchRow ? "Stored" : dispatchStatus === "SUCCESS" ? "Pending" : "Deferred"],
    ["Matched endpoint", hasLatestLog ? (latestLog.inputEndpoint || scenario.primaryEndpoint || "—") : hasStoredDispatchRow ? (dispatchRows[0].inputEndpoint || scenario.primaryEndpoint || "—") : (scenario.primaryEndpoint || "—")],
    ["Latest row cost", hasLatestLog ? String(latestLog.calculatedCost ?? latestLog.estimatedCost ?? "—") : hasStoredDispatchRow ? String(dispatchRows[0].calculatedCost ?? "—") : "—"],
    ["Latest row time", hasLatestLog ? String(latestLog.timestamp || latestLog.createdAt || "—") : hasStoredDispatchRow ? String(dispatchRows[0].timestamp || "—") : "—"]
  ];

  overviewGrid.innerHTML = cards.map(([label, value]) => `
    <div class="meta-card">
      <div class="label">${label}</div>
      <div class="value">${escapeHtml(typeof value === "number" ? formatCount(value) : value)}</div>
    </div>
  `).join("");
}

function auditStage(event) {
  if ((event.url || "").includes("storage.googleapis.com") || (event.url || "").includes("amazonaws.com") || (event.url || "").includes("blob.core.windows.net")) {
    return "Provider call";
  }
  if ((event.url || "").includes("collector-")) {
    return "Collector received";
  }
  if ((event.url || "").includes("/api/collector/events")) {
    return "Normalized";
  }
  if ((event.url || "").includes("/api/usage/logs")) {
    return "Stored";
  }
  if ((event.url || "").includes("/api/dashboard") || (event.url || "").includes("/api/reports")) {
    return "Verified";
  }
  if ((event.integrationOption || "").includes("collector")) {
    return "Collector";
  }
  if ((event.url || "").includes("/auth/login")) {
    return "Workspace auth";
  }
  if ((event.url || "").includes("/api/usage")) {
    return "Usage ingestion";
  }
  if ((event.url || "").includes("/api/usage/summary")) {
    return "Verification";
  }
  return "API call";
}

function setBanner(text, tone = "idle") {
  runStatusBanner.className = `status-banner status-banner-${tone}`;
  runStatusBanner.textContent = text;
}

async function runSelected() {
  const scenario = getSelectedScenario();
  if (!scenario) {
    return;
  }

  state.loadingScenarioId = scenario.id;
  setActivePage("live-test", { skipScroll: true });
  renderSelectedProvider();
  renderSelectedScenario();
  setBanner(
    scenario.executionMode === "live-provider-call"
      ? `Running a real ${scenario.provider} provider call and forwarding the collector payload…`
      : `Running the ${scenario.provider} collector replay for ${scenario.serviceFamily}…`,
    "running"
  );

  try {
    const result = scenario.executionMode === "live-provider-call"
      ? await json(`/demo/live/providers/${scenario.provider}/run?verify=true`, { method: "POST" })
      : await json(`/demo/scenarios/${scenario.id}/run?verify=true`, { method: "POST" });

    state.lastRun = result;
    renderFlowExplanation(scenario, result);
    renderResultSummary(result, scenario);
    renderResultNarrative(result, scenario);
    renderUsageTable(result, scenario);
    resultPanel.textContent = JSON.stringify(result, null, 2);
    renderRunReadback(result, scenario);
    renderApiExplorer(result, scenario);
    await loadAudit();
    const dispatchStatus = result.dispatch?.status || result.status || "UNKNOWN";
    setBanner(
      dispatchStatus === "SUCCESS"
        ? `${scenario.serviceFamily} finished successfully. CloudSight accepted the signal.`
        : dispatchStatus === "RATE_LIMITED"
          ? `${scenario.serviceFamily} ran, but CloudSight throttled the collector dispatch. Try again in a few seconds.`
          : `${scenario.serviceFamily} completed with an error. Review the CloudSight output panel for details.`,
      dispatchStatus === "SUCCESS" ? "success" : dispatchStatus === "RATE_LIMITED" ? "warn" : "error"
    );
  } catch (error) {
    renderResultNarrative({ status: "ERROR" }, scenario);
    resultPanel.textContent = error.stack || String(error);
    renderUsageTable(null, scenario);
    renderApiExplorer(null, scenario);
    setBanner(`The ${scenario.serviceFamily} run failed before CloudSight could confirm it.`, "error");
  } finally {
    state.loadingScenarioId = null;
    renderSelectedProvider();
    renderSelectedScenario();
  }
}

async function runRealtime() {
  const button = document.getElementById("runRealtime");
  state.runningAll = true;
  setActivePage("live-test", { skipScroll: true });
  button.disabled = true;
  button.textContent = "Running demo set…";
  setBanner("Running the AWS, GCP, and Azure live collector proofs one by one.", "running");
  try {
    const providers = state.models
      .filter((model) => model.setup.configured && model.liveScenario)
      .map((model) => model.provider);
    const results = [];
    for (const provider of providers) {
      setBanner(`Running ${provider} live proof through the collector…`, "running");
      const result = await json(`/demo/live/providers/${provider}/run?verify=true`, { method: "POST" });
      results.push({
        provider,
        liveCall: result.liveCall?.status || "UNKNOWN",
        dispatch: result.dispatch?.status || result.status || "UNKNOWN",
        stored: result.dispatch?.result?.response?.stored || 0,
        verification: result.verification?.status || "UNKNOWN",
        matched: (result.verification?.matchedLogs || []).length
      });
      state.lastRun = result;
    }
    const success = results.every((item) => item.liveCall === "SUCCESS" && item.dispatch === "SUCCESS" && item.stored >= 1);
    resultPanel.textContent = JSON.stringify({ mode: "demo-set", results }, null, 2);
    resultSummary.innerHTML = `
      <span class="pill ${success ? "pill-ok" : "pill-warn"}">${escapeHtml(success ? "SUCCESS" : "PARTIAL")}</span>
      <span class="pill">${escapeHtml("AWS + GCP + AZURE")}</span>
    `;
    renderResultNarrative({
      dispatch: { status: success ? "SUCCESS" : "PARTIAL" },
      verification: { status: success ? "SUCCESS" : "WARN" },
      liveCall: { status: success ? "SUCCESS" : "PARTIAL" }
    }, getSelectedScenario() || { serviceFamily: "Live demo set", provider: "Multi-cloud" });
    const scenario = getSelectedScenario();
    if (scenario && state.lastRun) {
      renderFlowExplanation(scenario, state.lastRun);
      renderUsageTable(state.lastRun, scenario);
      renderRunReadback(state.lastRun, scenario);
      renderApiExplorer(state.lastRun, scenario);
    }
    await loadAll();
    setBanner(
      success
        ? "AWS, GCP, and Azure all stored rows in CloudSight successfully."
        : "The demo set finished, but one or more providers need another retry.",
      success ? "success" : "warn"
    );
  } catch (error) {
    renderResultNarrative({ status: "ERROR" }, getSelectedScenario() || { serviceFamily: "Realtime collectors" });
    resultPanel.textContent = error.stack || String(error);
    setBanner("Running the AWS/GCP/Azure demo set failed. Please retry.", "error");
  } finally {
    state.runningAll = false;
    button.disabled = false;
    button.textContent = "Run demo set";
  }
}

function renderOverviewCards(overview) {
  const dashboard = overview.cloudSight?.dashboardOverview || {};
  const usage = overview.cloudSight?.usageSummary || {};
  const connections = overview.cloudSight?.connections?.summary || {};
  const authState = overview.cloudSight?.auth || "UNKNOWN";
  const mode = overview.cloudSight?.readbackMode || "UNAVAILABLE";
  const note = overview.cloudSight?.message || "";
  readbackNote.innerHTML = `
    <div class="readback-pill ${authState === "CONNECTED" ? "ok" : authState === "DEGRADED" ? "warn" : "neutral"}">
      ${escapeHtml(authState === "CONNECTED" ? "Live product readback" : authState === "DEGRADED" ? "Cached product snapshot" : "Collector-first demo mode")}
    </div>
    <p>${escapeHtml(note || `Readback mode: ${mode}`)}</p>
  `;
  const cards = [
    ["Demo mode", authState === "CONNECTED" ? "Live + workspace" : authState === "DEGRADED" ? "Collector + cached" : "Collector confirmed"],
    ["Current spend", dashboard.currentSpend ?? "—"],
    ["Total requests", dashboard.totalRequests ?? usage.totalRequests ?? "—"],
    ["Providers connected", connections.providersConnected ?? "—"]
  ];
  overviewGrid.innerHTML = cards.map(([label, value]) => `
    <div class="meta-card">
      <div class="label">${label}</div>
      <div class="value">${escapeHtml(typeof value === "number" ? formatCount(value) : value)}</div>
    </div>
  `).join("");
}

function renderAudit(events) {
  const recent = (events || []).slice(0, 36);
  const runId = state.lastRun?.runId;
  const matched = runId ? recent.filter((event) => event.runId === runId) : [];
  const ordered = runId
    ? [...matched, ...recent.filter((event) => event.runId !== runId)]
    : recent;
  auditMatchSummary.textContent = runId
    ? `${matched.length} audit event${matched.length === 1 ? "" : "s"} from the current run are highlighted below.`
    : "Recent calls will appear here. Matching events from the current run are highlighted.";
  auditPanel.innerHTML = ordered.map((event) => {
    const status = Number(event.responseStatus || 0);
    const statusClass = status >= 400 ? "status-error" : status >= 300 ? "status-warn" : "status-ok";
    const isMatch = runId && event.runId === runId;
    const stage = auditStage(event);
    const detailMap = {
      "Provider call": `${event.provider || "Cloud"} ${event.serviceFamily || event.primaryEndpoint || "provider"} API called successfully.`,
      "Collector received": `Signal received by ${event.provider || "Cloud"} collector.`,
      "Normalized": "Signal normalized and prepared.",
      "Stored": "Row stored in CloudSight.",
      "Verified": "Verification query confirmed row exists."
    };
    const detail = detailMap[stage] || (event.primaryEndpoint
      ? `${event.provider || "Cloud"} ${event.primaryEndpoint} completed.`
      : event.url || "CloudSight API event recorded.");
    return `
      <div class="audit-item timeline-row ${isMatch ? "audit-item-match" : ""}">
        <div class="timeline-status ${statusClass}">OK</div>
        <div class="timeline-time">${escapeHtml(event.recordedAt || "—")}</div>
        <div class="timeline-content">
          <div class="timeline-title-row">
            <strong>${escapeHtml(stage)}</strong>
            <span class="status-chip ${statusClass}">${status || "—"}</span>
            ${isMatch ? '<span class="pill pill-ok">current run</span>' : ""}
          </div>
          <p>${escapeHtml(detail)}</p>
          <div class="audit-tags">
            <span class="audit-method">${escapeHtml(event.method || "CALL")}</span>
            ${event.provider ? `<span class="pill">${escapeHtml(event.provider)}</span>` : ""}
            ${event.serviceFamily ? `<span class="pill">${escapeHtml(event.serviceFamily)}</span>` : ""}
          </div>
          <div class="audit-url">${escapeHtml(event.url || "")}</div>
        </div>
      </div>
    `;
  }).join("");
}

function downloadAuditLog() {
  const payload = JSON.stringify({
    exportedAt: new Date().toISOString(),
    runId: state.lastRun?.runId || null,
    events: state.auditEvents || []
  }, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cloudsight-audit-${state.lastRun?.runId || "latest"}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function loadAudit() {
  const audit = await json("/demo/audit");
  state.auditEvents = audit;
  renderAudit(audit);
}

async function refreshWorkspaceSnapshot() {
  try {
    const overview = await json("/demo/overview");
    renderHeroStats(overview);
    renderOverviewCards(overview);
  } catch (error) {
    readbackNote.innerHTML = `
      <div class="readback-pill neutral">Readback unavailable</div>
      <p>CloudSight readback is temporarily unavailable, but the provider run result above is still valid.</p>
    `;
  }
}

async function loadAll() {
  const [overview, scenarios, liveSetup, catalogs] = await Promise.all([
    json("/demo/overview"),
    json("/demo/scenarios"),
    json("/demo/live/setup"),
    json("/demo/catalogs")
  ]);

  state.models = buildModels({ overview, scenarios, liveSetup, catalogs });

  if ((!state.selectedProvider || !state.models.some((model) => model.provider === state.selectedProvider)) && state.models.length) {
    state.selectedProvider = state.models[0].provider;
  }

  const selectedModel = getSelectedModel();
  const validScenarioIds = [selectedModel?.liveScenario, ...(selectedModel?.serviceScenarios || [])].filter(Boolean).map((item) => item.id);
  if (!validScenarioIds.includes(state.selectedScenarioId)) {
    state.selectedScenarioId = selectedModel?.liveScenario?.id || selectedModel?.serviceScenarios?.[0]?.id || null;
  }

  if (IS_LOCAL_PREVIEW) {
    state.selectedProvider = "GCP";
    state.selectedScenarioId = "gcp-storage-live";
    state.lastRun = buildPreviewResult(getSelectedScenario() || LOCAL_PREVIEW_DATA.scenarios[0]);
  }

  renderHeroStats(overview);
  renderOverviewCards(overview);
  syncActivePage();
  renderProviderTabs();
  renderSelectedProvider();
  renderSelectedScenario();
  renderProviderDirectory();
  renderOverviewPopularTests();
  renderResultSummary(state.lastRun, getSelectedScenario() || { serviceFamily: "proof", provider: "GCP" });
  renderFlowExplanation(getSelectedScenario() || LOCAL_PREVIEW_DATA.scenarios[0], state.lastRun);
  renderResultNarrative(state.lastRun, getSelectedScenario() || { serviceFamily: "proof" });
  renderUsageTable(state.lastRun, getSelectedScenario() || {});
  renderRunReadback(state.lastRun, getSelectedScenario() || LOCAL_PREVIEW_DATA.scenarios[0]);
  renderApiExplorer(state.lastRun, getSelectedScenario() || LOCAL_PREVIEW_DATA.scenarios[0]);
  if (resultPanel && state.lastRun) {
    resultPanel.textContent = JSON.stringify(state.lastRun, null, 2);
  }
  await loadAudit();
}

bindPageNavigation();
syncActivePage();
window.scrollTo(0, 0);
window.addEventListener("load", () => {
  window.setTimeout(() => window.scrollTo(0, 0), 0);
  window.setTimeout(() => window.scrollTo(0, 0), 150);
});

loadAll().catch((error) => {
  resultPanel.textContent = error.stack || String(error);
});
