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
const resultNarrative = document.getElementById("resultNarrative");
const resultPanel = document.getElementById("resultPanel");
const overviewGrid = document.getElementById("overviewGrid");
const readbackNote = document.getElementById("readbackNote");
const auditPanel = document.getElementById("auditPanel");
const runStatusBanner = document.getElementById("runStatusBanner");
const API_BASE = window.location.protocol === "file:" ? "https://cloudsight-poc-hybrid.onrender.com" : "";

const state = {
  models: [],
  selectedProvider: null,
  selectedScenarioId: null,
  lastRun: null,
  loadingScenarioId: null,
  runningAll: false
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
  let message = "The run completed.";

  if (liveStatus === "SUCCESS" && dispatchStatus === "SUCCESS") {
    message = "The real provider call succeeded and the collector delivered the signal to CloudSight successfully.";
  } else if (liveStatus === "SUCCESS" && dispatchStatus === "RATE_LIMITED") {
    message = "The real provider call succeeded, but CloudSight throttled the collector dispatch. Wait a few seconds and retry.";
  } else if (liveStatus === "SUCCESS" && dispatchStatus === "ERROR") {
    message = "The real provider call succeeded, but the collector dispatch failed before CloudSight could store the signal.";
  } else if (dispatchStatus === "SUCCESS") {
    message = "The collector replay succeeded and CloudSight accepted the signal.";
  } else if (verificationStatus === "RATE_LIMITED") {
    message = "The proof ran, but workspace readback was throttled, so the product confirmation view is temporarily delayed.";
  }

  resultNarrative.innerHTML = `
    <div class="narrative-card">
      <strong>${escapeHtml(message)}</strong>
      <p>Live call: ${escapeHtml(liveStatus)}. Collector dispatch: ${escapeHtml(dispatchStatus)}. Product verification: ${escapeHtml(verificationStatus)}.</p>
    </div>
  `;
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
    resultPanel.textContent = JSON.stringify(result, null, 2);
    await loadAudit();
    await refreshWorkspaceSnapshot();
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
  button.disabled = true;
  button.textContent = "Running all…";
  setBanner("Running all collector proofs across every provider. This can take a little while.", "running");
  try {
    const result = await json("/demo/bootstrap/realtime", { method: "POST" });
    state.lastRun = result;
    resultPanel.textContent = JSON.stringify(result, null, 2);
    resultSummary.innerHTML = `
      <span class="pill pill-ok">${escapeHtml(result.status || "SUCCESS")}</span>
      <span class="pill">${escapeHtml(result.integrationOption || "realtime")}</span>
    `;
    renderResultNarrative({
      dispatch: { status: result.status || "SUCCESS" },
      verification: { status: result.workspaceAuth?.status || "SKIPPED" }
    }, getSelectedScenario() || { serviceFamily: "Realtime collectors" });
    const scenario = getSelectedScenario();
    if (scenario) {
      renderFlowExplanation(scenario, result);
    }
    await loadAll();
    setBanner(
      result.status === "SUCCESS"
        ? "All collector proofs finished successfully."
        : "Collector proofs finished, but some providers need another retry.",
      result.status === "SUCCESS" ? "success" : "warn"
    );
  } catch (error) {
    renderResultNarrative({ status: "ERROR" }, getSelectedScenario() || { serviceFamily: "Realtime collectors" });
    resultPanel.textContent = error.stack || String(error);
    setBanner("Running all collectors failed. Please retry once the throttling settles.", "error");
  } finally {
    state.runningAll = false;
    button.disabled = false;
    button.textContent = "Run all collectors";
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
      ${escapeHtml(authState === "CONNECTED" ? "Live product readback" : authState === "DEGRADED" ? "Showing cached CloudSight snapshot" : "Product readback deferred")}
    </div>
    <p>${escapeHtml(note || `Readback mode: ${mode}`)}</p>
  `;
  const cards = [
    ["Readback state", authState === "CONNECTED" ? "Live" : authState === "DEGRADED" ? "Cached" : "Deferred"],
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
  renderResultNarrative(null, getSelectedScenario() || { serviceFamily: "proof" });
  await loadAudit();
}

loadAll().catch((error) => {
  resultPanel.textContent = error.stack || String(error);
});
