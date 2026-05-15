const heroStats = document.getElementById("heroStats");
const providerTabs = document.getElementById("providerTabs");
const selectedProviderTitle = document.getElementById("selectedProviderTitle");
const selectedProviderStatus = document.getElementById("selectedProviderStatus");
const selectedProviderSummary = document.getElementById("selectedProviderSummary");
const selectedProviderMeta = document.getElementById("selectedProviderMeta");
const liveScenarioCard = document.getElementById("liveScenarioCard");
const scenarioList = document.getElementById("scenarioList");
const selectedScenarioTitle = document.getElementById("selectedScenarioTitle");
const selectedScenarioSummary = document.getElementById("selectedScenarioSummary");
const selectedScenarioBadges = document.getElementById("selectedScenarioBadges");
const runSelectedScenario = document.getElementById("runSelectedScenario");
const flowSteps = document.getElementById("flowSteps");
const resultSummary = document.getElementById("resultSummary");
const resultPanel = document.getElementById("resultPanel");
const overviewGrid = document.getElementById("overviewGrid");
const auditPanel = document.getElementById("auditPanel");
const API_BASE = window.location.protocol === "file:" ? "https://cloudsight-poc-hybrid.onrender.com" : "";

const state = {
  models: [],
  selectedProvider: null,
  selectedScenarioId: null,
  lastRun: null
};

document.getElementById("refreshOverview").addEventListener("click", loadAll);
document.getElementById("refreshAudit").addEventListener("click", loadAudit);
document.getElementById("runRealtime").addEventListener("click", () => runRealtime());
runSelectedScenario.addEventListener("click", () => runSelected());

async function json(url, options) {
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

function shortUrl(value) {
  try {
    const url = new URL(String(value));
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch (error) {
    return String(value ?? "—");
  }
}

function summaryCards(overview) {
  const collectors = overview.cloudSight?.connections?.collectorSummary || {};
  return [
    ["Providers", overview.coverage?.providerCount ?? 4],
    ["Modeled tests", overview.coverage?.modeledScenarioCount ?? 0],
    ["Healthy collectors", collectors.healthyCollectors ?? "—"],
    ["Live-ready clouds", (overview.liveSetup || []).filter((item) => item.configured).length]
  ];
}

function renderHeroStats(overview) {
  heroStats.innerHTML = summaryCards(overview).map(([label, value]) => `
    <div class="stat-card">
      <div class="label">${label}</div>
      <div class="value">${formatCount(value)}</div>
    </div>
  `).join("");
}

function buildModels({ overview, scenarios, liveSetup, catalogs }) {
  return (overview.collectors || []).map((collector) => {
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
      ${model.provider}
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

  selectedProviderTitle.textContent = model.provider;
  selectedProviderStatus.textContent = statusLabel(Boolean(model.setup.configured), model.setup.selectedService || "selected live proof");
  selectedProviderStatus.className = `status-chip ${model.setup.configured ? "status-ok" : "status-warn"}`;
  selectedProviderSummary.textContent = model.setup.configured
    ? `This cloud is ready for a real provider proof and collector verification.`
    : `Collector replay is ready now. Add live credentials later if you want a real provider call.`;

  const familyCount = (model.catalog.serviceFamilies || []).length;
  selectedProviderMeta.innerHTML = `
    <div class="provider-summary-card">
      <div class="provider-summary-row">
        <div class="provider-summary-label">Live proof</div>
        <div class="provider-summary-value">${escapeHtml(model.setup.selectedService || "Not configured")}</div>
      </div>
      <div class="provider-summary-row">
        <div class="provider-summary-label">Modeled families</div>
        <div class="provider-summary-value">${escapeHtml(String(familyCount))}</div>
      </div>
      <div class="provider-summary-row">
        <div class="provider-summary-label">Collector endpoint</div>
        <div class="provider-summary-value">
          <a href="${escapeHtml(model.collector.collectorUrl)}" target="_blank" rel="noreferrer">${escapeHtml(shortUrl(model.collector.collectorUrl))}</a>
        </div>
      </div>
    </div>
  `;

  liveScenarioCard.innerHTML = model.liveScenario ? `
    <div class="service-title-row">
      <strong>${escapeHtml(model.liveScenario.title)}</strong>
      <span class="pill ${model.setup.configured ? "pill-ok" : "pill-warn"}">${model.setup.configured ? "Configured" : "Needs creds"}</span>
    </div>
    <div class="service-caption">${escapeHtml(model.liveScenario.realCloudNote || "Runs a real provider proof when credentials are configured.")}</div>
    <div class="badge-row">
      <span class="pill">${escapeHtml(model.liveScenario.primaryEndpoint)}</span>
      <span class="pill">${escapeHtml(model.liveScenario.signalType)}</span>
      <span class="pill">${escapeHtml(model.liveScenario.executionMode)}</span>
    </div>
  ` : "<div class='service-caption'>No live proof configured for this provider.</div>";

  scenarioList.innerHTML = [model.liveScenario, ...model.serviceScenarios].filter(Boolean).map((scenario) => `
    <button class="service-button ${scenario.id === state.selectedScenarioId ? "active" : ""}" data-scenario-select="${scenario.id}">
      <div class="service-title-row">
        <strong>${escapeHtml(scenario.serviceFamily)}</strong>
        <span class="pill ${scenario.executionMode === "live-provider-call" ? "pill-ok" : ""}">${escapeHtml(scenario.executionMode === "live-provider-call" ? "live" : "collector")}</span>
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
  runSelectedScenario.textContent = scenario.executionMode === "live-provider-call"
    ? (model.setup.configured ? "Run live + verify" : "Configure live credentials")
    : "Run collector test";

  renderFlowExplanation(scenario, null);
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
        ? `CloudSight verification returned ${verification.status}.`
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

  resultSummary.innerHTML = chips.map((chip, index) => `
    <span class="pill ${index >= 2 && /SUCCESS/i.test(chip) ? "pill-ok" : ""}">${escapeHtml(chip)}</span>
  `).join("");
}

async function runSelected() {
  const scenario = getSelectedScenario();
  if (!scenario) {
    return;
  }

  runSelectedScenario.disabled = true;
  runSelectedScenario.textContent = scenario.executionMode === "live-provider-call" ? "Running live…" : "Running collector…";

  try {
    const result = scenario.executionMode === "live-provider-call"
      ? await json(`/demo/live/providers/${scenario.provider}/run?verify=true`, { method: "POST" })
      : await json(`/demo/scenarios/${scenario.id}/run?verify=true`, { method: "POST" });

    state.lastRun = result;
    renderFlowExplanation(scenario, result);
    renderResultSummary(result, scenario);
    resultPanel.textContent = JSON.stringify(result, null, 2);
    await loadAudit();
    await refreshWorkspaceSnapshot();
  } catch (error) {
    resultPanel.textContent = error.stack || String(error);
  } finally {
    renderSelectedScenario();
  }
}

async function runRealtime() {
  const button = document.getElementById("runRealtime");
  button.disabled = true;
  button.textContent = "Running all…";
  try {
    const result = await json("/demo/bootstrap/realtime", { method: "POST" });
    state.lastRun = result;
    resultPanel.textContent = JSON.stringify(result, null, 2);
    resultSummary.innerHTML = `
      <span class="pill pill-ok">${escapeHtml(result.status || "SUCCESS")}</span>
      <span class="pill">${escapeHtml(result.integrationOption || "realtime")}</span>
    `;
    const scenario = getSelectedScenario();
    if (scenario) {
      renderFlowExplanation(scenario, result);
    }
    await loadAll();
  } catch (error) {
    resultPanel.textContent = error.stack || String(error);
  } finally {
    button.disabled = false;
    button.textContent = "Run all collectors";
  }
}

function renderOverviewCards(overview) {
  const dashboard = overview.cloudSight?.dashboardOverview || {};
  const usage = overview.cloudSight?.usageSummary || {};
  const connections = overview.cloudSight?.connections?.summary || {};
  const cards = [
    ["Auth state", overview.cloudSight?.auth || "UNKNOWN"],
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
  const recent = (events || []).slice(0, 20);
  auditPanel.innerHTML = recent.map((event) => {
    const status = Number(event.responseStatus || 0);
    const statusClass = status >= 400 ? "status-error" : status >= 300 ? "status-warn" : "status-ok";
    return `
      <div class="audit-item">
        <div class="audit-top">
          <div><span class="audit-method">${escapeHtml(event.method || "CALL")}</span> <span class="${statusClass}">${status || "—"}</span></div>
          <div class="muted">${escapeHtml(event.recordedAt || "")}</div>
        </div>
        <div class="audit-url">${escapeHtml(event.url || "")}</div>
      </div>
    `;
  }).join("");
}

async function loadAudit() {
  const audit = await json("/demo/audit");
  renderAudit(audit);
}

async function refreshWorkspaceSnapshot() {
  const overview = await json("/demo/overview");
  renderHeroStats(overview);
  renderOverviewCards(overview);
}

async function loadAll() {
  const [overview, scenarios, liveSetup, catalogs] = await Promise.all([
    json("/demo/overview"),
    json("/demo/scenarios"),
    json("/demo/live/setup"),
    json("/demo/catalogs")
  ]);

  state.models = buildModels({ overview, scenarios, liveSetup, catalogs });

  if (!state.selectedProvider && state.models.length) {
    state.selectedProvider = state.models[0].provider;
  }

  const selectedModel = getSelectedModel();
  const validScenarioIds = [selectedModel?.liveScenario, ...(selectedModel?.serviceScenarios || [])].filter(Boolean).map((item) => item.id);
  if (!validScenarioIds.includes(state.selectedScenarioId)) {
    state.selectedScenarioId = selectedModel?.liveScenario?.id || selectedModel?.serviceScenarios?.[0]?.id || null;
  }

  renderHeroStats(overview);
  renderOverviewCards(overview);
  renderProviderTabs();
  renderSelectedProvider();
  renderSelectedScenario();
  await loadAudit();
}

loadAll().catch((error) => {
  resultPanel.textContent = error.stack || String(error);
});
