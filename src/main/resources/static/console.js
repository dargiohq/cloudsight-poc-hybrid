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
const overviewGrid = document.getElementById("overviewGrid");
const readbackNote = document.getElementById("readbackNote");
const auditPanel = document.getElementById("auditPanel");
const auditMatchSummary = document.getElementById("auditMatchSummary");
const usageTableMeta = document.getElementById("usageTableMeta");
const usageTableBody = document.getElementById("usageTableBody");
const runStatusBanner = document.getElementById("runStatusBanner");
const API_BASE = window.location.protocol === "file:" ? "https://cloudsight-poc-hybrid.onrender.com" : "";
const DEMO_VISIBLE_PROVIDERS = ["AWS", "GCP", "AZURE"];

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
  const visibleModels = state.models.length ? state.models : buildModels({
    overview,
    scenarios: [],
    liveSetup: overview.liveSetup || [],
    catalogs: []
  });
  const modeledTests = visibleModels.reduce((sum, model) => sum + (model.liveScenario ? 1 : 0) + model.serviceScenarios.length, 0);
  const liveReadyClouds = visibleModels.filter((model) => model.setup.configured).length;
  return [
    ["Demo clouds", visibleModels.length || DEMO_VISIBLE_PROVIDERS.length],
    ["Demo tests", modeledTests || 0],
    ["Healthy collectors", collectors.healthyCollectors ?? "—"],
    ["Live-ready clouds", liveReadyClouds]
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
    ? `This cloud is ready for a real provider proof that ends in a stored CloudSight row.`
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
          <a href="${escapeHtml(model.collector.collectorUrl)}" target="_blank" rel="noreferrer">Open collector</a>
        </div>
      </div>
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
  const rows = readbackRows.length ? readbackRows : dispatchRows;

  if (!rows.length) {
    usageTableMeta.textContent = result?.verification?.status === "RATE_LIMITED"
      ? "CloudSight usage readback was rate-limited, so the latest matching rows are temporarily unavailable."
      : `No captured usage rows are available yet for ${scenario?.primaryEndpoint || "this test"}.`;
    usageTableBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-table">Run a test and this table will highlight the latest CloudSight rows for the selected endpoint.</td>
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
    const secondary = row.outputEndpoint || row.secondaryEndpoint || "—";
    const units = `${formatCount(row.inputUnits || row.primaryUnits || 0)} / ${formatCount(row.outputUnits || row.secondaryUnits || 0)}`;
    const cost = row.calculatedCost ?? row.estimatedCost ?? row.totalCost ?? "—";
    const when = row.timestamp || row.createdAt || row.recordedAt || "—";
    return `
      <tr class="${index === 0 ? "usage-row-highlight" : ""}">
        <td>${escapeHtml(when)}</td>
        <td>${escapeHtml(row.service || row.provider || scenario.provider)}</td>
        <td><strong>${escapeHtml(primary)}</strong><br><span class="usage-secondary">${escapeHtml(secondary)}</span></td>
        <td>${escapeHtml(units)}</td>
        <td>${escapeHtml(String(cost))}</td>
      </tr>
    `;
  }).join("");
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
  if ((event.integrationOption || "").includes("collector")) {
    return "Collector";
  }
  if ((event.url || "").includes("/auth/login")) {
    return "Workspace auth";
  }
  if ((event.url || "").includes("/api/usage")) {
    return "Usage ingestion";
  }
  if ((event.url || "").includes("/api/usage/logs") || (event.url || "").includes("/api/usage/summary")) {
    return "Verification";
  }
  if ((event.url || "").includes("/api/dashboard") || (event.url || "").includes("/api/reports")) {
    return "Readback";
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
    return `
      <div class="audit-item ${isMatch ? "audit-item-match" : ""}">
        <div class="audit-top">
          <div>
            <span class="audit-method">${escapeHtml(event.method || "CALL")}</span>
            <span class="pill ${statusTone(event.responseStatus >= 400 ? "ERROR" : event.responseStatus >= 300 ? "WARN" : "SUCCESS")}">${escapeHtml(auditStage(event))}</span>
            ${isMatch ? '<span class="pill pill-ok">current run</span>' : ""}
          </div>
          <div class="muted">${escapeHtml(event.recordedAt || "")}</div>
        </div>
        <div class="audit-tags">
          <span class="status-chip ${statusClass}">${status || "—"}</span>
          ${event.provider ? `<span class="pill">${escapeHtml(event.provider)}</span>` : ""}
          ${event.serviceFamily ? `<span class="pill">${escapeHtml(event.serviceFamily)}</span>` : ""}
          ${event.primaryEndpoint ? `<span class="pill">${escapeHtml(event.primaryEndpoint)}</span>` : ""}
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

  if ((!state.selectedProvider || !state.models.some((model) => model.provider === state.selectedProvider)) && state.models.length) {
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
  renderUsageTable(null, getSelectedScenario() || {});
  await loadAudit();
}

loadAll().catch((error) => {
  resultPanel.textContent = error.stack || String(error);
});
