const overviewGrid = document.getElementById("overviewGrid");
const collectorGrid = document.getElementById("collectorGrid");
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
            </div>
            <div class="scenario-actions">
              <button class="btn btn-primary" data-scenario="${scenario.id}">Send + verify</button>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");

  scenarioGroups.querySelectorAll("[data-scenario]").forEach((button) => {
    button.addEventListener("click", async () => {
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
        button.textContent = "Send + verify";
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
  const [overview, scenarios] = await Promise.all([
    json("/demo/overview"),
    json("/demo/scenarios")
  ]);
  renderHeroStats(overview);
  renderOverview(overview);
  renderCollectors(overview);
  renderScenarios(scenarios);
  await loadAudit();
}

loadAll().catch((error) => {
  resultPanel.textContent = error.stack || String(error);
});
