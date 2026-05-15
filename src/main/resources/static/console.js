const overviewGrid = document.getElementById("overviewGrid");
const collectorGrid = document.getElementById("collectorGrid");
const liveSetupGrid = document.getElementById("liveSetupGrid");
const catalogGrid = document.getElementById("catalogGrid");
const scenarioGroups = document.getElementById("scenarioGroups");
const resultPanel = document.getElementById("resultPanel");
const auditPanel = document.getElementById("auditPanel");
const heroStats = document.getElementById("heroStats");

document.getElementById("refreshOverview").addEventListener("click", loadAll);
document.getElementById("refreshAudit").addEventListener("click", loadAudit);
document.getElementById("runRealtime").addEventListener("click", () => runRealtime());

async function json(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${text || response.statusText}`);
  }
  return response.json();
}

function formatCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString() : String(value ?? "—");
}

function renderHeroStats(overview) {
  const cloudSight = overview.cloudSight || {};
  const connections = cloudSight.connections?.summary || {};
  const collectors = cloudSight.connections?.collectorSummary || {};

  const cards = [
    ["Providers", overview.coverage?.providerCount ?? 4],
    ["Scenarios", overview.coverage?.modeledScenarioCount ?? 0],
    ["Healthy collectors", collectors.healthyCollectors ?? "—"],
    ["Usage events", cloudSight.connections?.onboarding?.usageEvents ?? "—"],
  ];

  heroStats.innerHTML = cards.map(([label, value]) => `
    <div class="card">
      <div class="label">${label}</div>
      <div class="value">${formatCount(value)}</div>
    </div>
  `).join("");
}

function renderOverview(overview) {
  const dashboard = overview.cloudSight?.dashboardOverview || {};
  const usage = overview.cloudSight?.usageSummary || {};
  const connections = overview.cloudSight?.connections?.summary || {};
  const cards = [
    ["Auth state", overview.cloudSight?.auth || "UNKNOWN"],
    ["Current spend", dashboard.currentSpend ?? "—"],
    ["Total requests", dashboard.totalRequests ?? usage.totalRequests ?? "—"],
    ["Providers connected", connections.providersConnected ?? "—"],
  ];
  overviewGrid.innerHTML = cards.map(([label, value]) => `
    <div class="card">
      <div class="label">${label}</div>
      <div class="value">${typeof value === "number" ? formatCount(value) : value}</div>
    </div>
  `).join("");
}

function renderCollectors(overview) {
  collectorGrid.innerHTML = (overview.collectors || []).map((collector) => `
    <div class="collector-card">
      <div class="tag">${collector.provider}</div>
      <h3>${collector.executionMode}</h3>
      <p class="muted">${collector.collectorUrl}</p>
      <div class="pills">
        ${(collector.serviceFamilies || []).map((family) => `<span class="pill">${family}</span>`).join("")}
      </div>
      <p class="muted" style="margin-top:12px">${collector.liveProviderCalls}</p>
      <div class="status-inline ${collector.liveProviderReady ? "status-ok" : "status-warn"}">${collector.liveProviderReady ? "Live provider mode configured" : "Collector mode only until live credentials are set"}</div>
    </div>
  `).join("");
}

function renderLiveSetup(setups) {
  liveSetupGrid.innerHTML = (setups || []).map((setup) => `
    <div class="wizard-card">
      <div class="wizard-head">
        <div>
          <div class="tag">${setup.provider}</div>
          <h3>${setup.selectedService}</h3>
        </div>
        <span class="${setup.configured ? "status-ok" : "status-warn"}">${setup.configured ? "Configured" : "Needs secrets"}</span>
      </div>
      <div class="meta-list">
        ${(setup.requirements || []).map((item) => `<span class="pill ${item.configured ? "pill-ok" : "pill-warn"}">${item.env}</span>`).join("")}
      </div>
      <div class="wizard-copy">
        <div>
          <div class="panel-label">Setup steps</div>
          <ul>
            ${(setup.steps || []).map((step) => `<li>${step}</li>`).join("")}
          </ul>
        </div>
        <div>
          <div class="panel-label">Live resources</div>
          <pre class="inline-code">${JSON.stringify(setup.resources || {}, null, 2)}</pre>
        </div>
      </div>
      <div class="scenario-actions">
        <button class="btn btn-primary" data-live-provider="${setup.provider}" ${setup.configured ? "" : "disabled"}>${setup.configured ? "Run live + verify" : "Configure secrets first"}</button>
      </div>
    </div>
  `).join("");

  liveSetupGrid.querySelectorAll("[data-live-provider]").forEach((button) => {
    if (button.disabled) {
      return;
    }
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Running live call…";
      try {
        const result = await json(`/demo/live/providers/${button.dataset.liveProvider}/run?verify=true`, { method: "POST" });
        resultPanel.textContent = JSON.stringify(result, null, 2);
        await loadAll();
      } catch (error) {
        resultPanel.textContent = error.stack || String(error);
      } finally {
        button.disabled = false;
        button.textContent = "Run live + verify";
      }
    });
  });
}

function renderCatalogs(catalogs) {
  catalogGrid.innerHTML = (catalogs || []).map((catalog) => `
    <div class="catalog-card">
      <div class="wizard-head">
        <div>
          <div class="tag">${catalog.provider}</div>
          <h3>${(catalog.serviceFamilies || []).length} service families</h3>
        </div>
      </div>
      <div class="catalog-list">
        ${(catalog.serviceFamilies || []).map((family) => `
          <div class="catalog-item">
            <div>
              <strong>${family.name}</strong>
              <div class="muted">${family.selectedLiveCall ? "Selected for live credential-backed demo" : "Catalog-expanded family"}</div>
            </div>
            <div class="meta-list">
              <span class="pill">${family.status}</span>
              ${family.writeVerified ? '<span class="pill pill-ok">write-verified</span>' : ""}
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");
}

function groupByProvider(scenarios) {
  return scenarios.reduce((acc, scenario) => {
    acc[scenario.provider] = acc[scenario.provider] || [];
    acc[scenario.provider].push(scenario);
    return acc;
  }, {});
}

function renderScenarios(scenarios) {
  const groups = groupByProvider(scenarios);
  scenarioGroups.innerHTML = Object.entries(groups).map(([provider, items]) => `
    <div class="scenario-group">
      <div class="scenario-group-head">
        <div>
          <div class="panel-label">${provider}</div>
          <h3>${items.length} scenario${items.length === 1 ? "" : "s"} ready</h3>
        </div>
      </div>
      <div class="scenario-grid">
        ${items.map((scenario) => `
          <div class="scenario-card">
            <div>
              <div class="tag">${scenario.serviceFamily}</div>
              <h3>${scenario.title}</h3>
              <p class="muted">${scenario.realCloudNote}</p>
            </div>
            <div class="meta-list">
              <span class="pill">${scenario.primaryEndpoint}</span>
              <span class="pill">${scenario.signalType}</span>
              <span class="pill">${scenario.executionMode}</span>
              ${scenario.realCloudReady ? '<span class="pill pill-ok">live-ready</span>' : ""}
            </div>
            <div class="scenario-actions">
              <button class="btn btn-primary" data-scenario="${scenario.id}" ${scenario.executionMode === "live-provider-call" && !scenario.realCloudReady ? "disabled" : ""}>${scenario.executionMode === "live-provider-call" ? (scenario.realCloudReady ? "Run live + verify" : "Configure secrets first") : "Send + verify"}</button>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");

  scenarioGroups.querySelectorAll("[data-scenario]").forEach((button) => {
    button.addEventListener("click", async () => {
      const scenario = scenarios.find((item) => item.id === button.dataset.scenario);
      const defaultLabel = scenario?.executionMode === "live-provider-call" ? "Run live + verify" : "Send + verify";
      button.disabled = true;
      button.textContent = "Running…";
      try {
        const result = await json(`/demo/scenarios/${button.dataset.scenario}/run?verify=true`, { method: "POST" });
        resultPanel.textContent = JSON.stringify(result, null, 2);
        await loadAudit();
      } catch (error) {
        resultPanel.textContent = error.stack || String(error);
      } finally {
        button.disabled = false;
        button.textContent = defaultLabel;
      }
    });
  });
}

async function runRealtime() {
  const button = document.getElementById("runRealtime");
  button.disabled = true;
  button.textContent = "Running realtime flow…";
  try {
    const result = await json("/demo/bootstrap/realtime", { method: "POST" });
    resultPanel.textContent = JSON.stringify(result, null, 2);
    await loadAll();
  } catch (error) {
    resultPanel.textContent = error.stack || String(error);
  } finally {
    button.disabled = false;
    button.textContent = "Run Full Realtime Flow";
  }
}

function renderAudit(events) {
  const recent = (events || []).slice(0, 20);
  auditPanel.innerHTML = recent.map((event) => {
    const status = Number(event.responseStatus || 0);
    const statusClass = status >= 400 ? "status-error" : status >= 300 ? "status-warn" : "status-ok";
    return `
      <div class="audit-item">
        <div class="audit-top">
          <div><span class="audit-method">${event.method || "CALL"}</span> <span class="${statusClass}">${status || "—"}</span></div>
          <div class="muted">${event.recordedAt || ""}</div>
        </div>
        <div class="audit-url">${event.url || ""}</div>
      </div>
    `;
  }).join("");
}

async function loadAudit() {
  const audit = await json("/demo/audit");
  renderAudit(audit);
}

async function loadAll() {
  const [overview, scenarios, liveSetup, catalogs] = await Promise.all([
    json("/demo/overview"),
    json("/demo/scenarios"),
    json("/demo/live/setup"),
    json("/demo/catalogs")
  ]);
  renderHeroStats(overview);
  renderOverview(overview);
  renderCollectors(overview);
  renderLiveSetup(liveSetup);
  renderCatalogs(catalogs);
  renderScenarios(scenarios);
  await loadAudit();
}

loadAll().catch((error) => {
  resultPanel.textContent = error.stack || String(error);
});
