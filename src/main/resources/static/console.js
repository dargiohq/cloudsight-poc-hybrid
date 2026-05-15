const overviewGrid = document.getElementById("overviewGrid");
const providerGrid = document.getElementById("providerGrid");
const serviceMatrix = document.getElementById("serviceMatrix");
const stepGrid = document.getElementById("stepGrid");
const resultPanel = document.getElementById("resultPanel");
const auditPanel = document.getElementById("auditPanel");
const heroStats = document.getElementById("heroStats");
const API_BASE = window.location.protocol === "file:" ? "https://cloudsight-poc-hybrid.onrender.com" : "";

document.getElementById("refreshOverview").addEventListener("click", loadAll);
document.getElementById("refreshAudit").addEventListener("click", loadAudit);
document.getElementById("runRealtime").addEventListener("click", () => runRealtime());

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

function renderHeroStats(overview) {
  const cloudSight = overview.cloudSight || {};
  const connections = cloudSight.connections?.summary || {};
  const collectors = cloudSight.connections?.collectorSummary || {};

  const cards = [
    ["Providers", overview.coverage?.providerCount ?? 4],
    ["Modeled tests", overview.coverage?.modeledScenarioCount ?? 0],
    ["Healthy collectors", collectors.healthyCollectors ?? "—"],
    ["Live-ready clouds", (overview.liveSetup || []).filter((item) => item.configured).length],
  ];

  heroStats.innerHTML = cards.map(([label, value]) => `
    <div class="card">
      <div class="label">${label}</div>
      <div class="value">${formatCount(value)}</div>
    </div>
  `).join("");
}

function renderSteps(overview) {
  const recommendation = overview.coverage?.recommendedClientStory || "Deploy collectors first, then layer live credentials and billing connections.";
  const realCloudSupport = overview.coverage?.realCloudCallSupport || "Credential-dependent real provider calls are optional.";
  stepGrid.innerHTML = [
    {
      title: "1. Pick a cloud",
      body: "Use the provider cards below. Each one shows whether live credentials are ready and what service is used for the proof."
    },
    {
      title: "2. Run a proof",
      body: "Start with a single live provider test, or expand the card to run individual modeled family checks through the collector."
    },
    {
      title: "3. Read CloudSight",
      body: `${recommendation} ${realCloudSupport}`
    }
  ].map((item) => `
    <div class="step-card">
      <div class="panel-label">Step</div>
      <h3>${item.title}</h3>
      <p>${item.body}</p>
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

function statusChip(configured, liveService) {
  return configured
    ? `<span class="status-chip status-ok">Live ready: ${escapeHtml(liveService)}</span>`
    : `<span class="status-chip status-warn">Collector-ready only</span>`;
}

function buildProviderModels({ overview, scenarios, liveSetup, catalogs }) {
  return (overview.collectors || []).map((collector) => {
    const provider = collector.provider;
    const setup = (liveSetup || []).find((item) => item.provider === provider) || {};
    const catalog = (catalogs || []).find((item) => item.provider === provider) || {};
    const providerScenarios = (scenarios || []).filter((item) => item.provider === provider);
    const liveScenario = providerScenarios.find((item) => item.executionMode === "live-provider-call") || null;
    const collectorScenarios = providerScenarios.filter((item) => item.executionMode !== "live-provider-call");
    return {
      provider,
      collector,
      setup,
      catalog,
      liveScenario,
      collectorScenarios,
      readyFamilies: (catalog.serviceFamilies || []).filter((family) => family.status === "collector-ready"),
      expandedFamilies: (catalog.serviceFamilies || []).filter((family) => family.status !== "collector-ready")
    };
  });
}

function renderProviders(models) {
  providerGrid.innerHTML = models.map((model) => `
    <article class="provider-card">
      <div class="provider-head">
        <div>
          <div class="tag">${model.provider}</div>
          <h3>${escapeHtml(model.setup.selectedService || "Collector-first provider flow")}</h3>
        </div>
        ${statusChip(Boolean(model.setup.configured), model.setup.selectedService || "selected live proof")}
      </div>

      <div class="provider-copy">
        <p>${escapeHtml(model.collector.liveProviderCalls || "Collector flow available.")}</p>
        <a class="provider-link" href="${escapeHtml(model.collector.collectorUrl)}" target="_blank" rel="noreferrer">${escapeHtml(model.collector.collectorUrl)}</a>
      </div>

      <div class="provider-metrics">
        <div class="mini-stat">
          <div class="label">Modeled families</div>
          <div class="value">${formatCount((model.catalog.serviceFamilies || []).length)}</div>
        </div>
        <div class="mini-stat">
          <div class="label">Collector tests</div>
          <div class="value">${formatCount(model.collectorScenarios.length)}</div>
        </div>
        <div class="mini-stat">
          <div class="label">Status</div>
          <div class="value">${model.setup.configured ? "Ready" : "Setup"}</div>
        </div>
      </div>

      <div class="provider-actions">
        <button class="btn btn-primary" data-provider-live="${model.provider}" ${model.setup.configured ? "" : "disabled"}>${model.setup.configured ? "Run live + verify" : "Configure live secrets"}</button>
        <button class="btn btn-ghost" data-provider-sample="${model.provider}" ${model.collectorScenarios.length ? "" : "disabled"}>Run collector sample</button>
      </div>

      <details>
        <summary>Show modeled families and advanced tests</summary>
        <div class="detail-grid">
          <div class="detail-stack">
            <div>
              <div class="panel-label">Collector-ready families</div>
              <div class="family-list">
                ${(model.readyFamilies || []).map((family) => `<span class="pill ${family.selectedLiveCall ? "pill-ok" : ""}">${escapeHtml(family.name)}</span>`).join("")}
              </div>
            </div>
            ${model.expandedFamilies.length ? `
            <div>
              <div class="panel-label">Catalog-expanded next</div>
              <div class="family-list">
                ${model.expandedFamilies.map((family) => `<span class="pill pill-warn">${escapeHtml(family.name)}</span>`).join("")}
              </div>
            </div>` : ""}
            <div>
              <div class="panel-label">Individual modeled tests</div>
              <div class="detail-actions">
                ${model.collectorScenarios.map((scenario) => `
                  <button class="btn btn-secondary" data-scenario="${escapeHtml(scenario.id)}">${escapeHtml(scenario.serviceFamily)}</button>
                `).join("")}
              </div>
            </div>
          </div>
          <div class="detail-stack">
            <div>
              <div class="panel-label">Setup requirements</div>
              <div class="family-list">
                ${(model.setup.requirements || []).map((item) => `<span class="pill ${item.configured ? "pill-ok" : "pill-warn"}">${escapeHtml(item.env)}</span>`).join("")}
              </div>
            </div>
            <div>
              <div class="panel-label">Live resources</div>
              <pre class="inline-code">${escapeHtml(JSON.stringify(model.setup.resources || {}, null, 2))}</pre>
            </div>
            <div>
              <div class="panel-label">Operator notes</div>
              <ul>
                ${(model.setup.steps || []).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
              </ul>
            </div>
          </div>
        </div>
      </details>
    </article>
  `).join("");

  providerGrid.querySelectorAll("[data-provider-live]").forEach((button) => {
    if (button.disabled) {
      return;
    }
    button.addEventListener("click", async () => {
      const provider = button.dataset.providerLive;
      button.disabled = true;
      button.textContent = "Running live…";
      try {
        const result = await json(`/demo/live/providers/${provider}/run?verify=true`, { method: "POST" });
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

  providerGrid.querySelectorAll("[data-provider-sample]").forEach((button) => {
    if (button.disabled) {
      return;
    }
    button.addEventListener("click", async () => {
      const provider = button.dataset.providerSample;
      const model = models.find((item) => item.provider === provider);
      const scenario = model?.collectorScenarios?.[0];
      if (!scenario) {
        return;
      }
      button.disabled = true;
      button.textContent = "Running sample…";
      try {
        const result = await json(`/demo/scenarios/${scenario.id}/run?verify=true`, { method: "POST" });
        resultPanel.textContent = JSON.stringify(result, null, 2);
        await loadAll();
      } catch (error) {
        resultPanel.textContent = error.stack || String(error);
      } finally {
        button.disabled = false;
        button.textContent = "Run collector sample";
      }
    });
  });

  providerGrid.querySelectorAll("[data-scenario]").forEach((button) => {
    button.addEventListener("click", async () => {
      const scenario = models.flatMap((item) => item.collectorScenarios).find((item) => item.id === button.dataset.scenario);
      const defaultLabel = scenario?.serviceFamily || "Run test";
      button.disabled = true;
      button.textContent = "Running…";
      try {
        const result = await json(`/demo/scenarios/${button.dataset.scenario}/run?verify=true`, { method: "POST" });
        resultPanel.textContent = JSON.stringify(result, null, 2);
        await loadAll();
      } catch (error) {
        resultPanel.textContent = error.stack || String(error);
      } finally {
        button.disabled = false;
        button.textContent = defaultLabel;
      }
    });
  });
}

function renderServiceMatrix(models) {
  serviceMatrix.innerHTML = `
    <thead>
      <tr>
        <th>Provider</th>
        <th>Live proof service</th>
        <th>Collector-ready families</th>
        <th>Catalog-expanded next</th>
      </tr>
    </thead>
    <tbody>
      ${models.map((model) => `
        <tr>
          <td>
            <strong>${escapeHtml(model.provider)}</strong>
            <span class="${model.setup.configured ? "status-ok" : "status-warn"}">${model.setup.configured ? "Live-ready" : "Collector-only today"}</span>
          </td>
          <td>
            <strong>${escapeHtml(model.setup.selectedService || "Not selected")}</strong>
            <span class="muted">${escapeHtml(model.collector.executionMode || "")}</span>
          </td>
          <td>
            <div class="family-list">
              ${(model.readyFamilies || []).map((family) => `<span class="pill ${family.writeVerified ? "pill-ok" : ""}">${escapeHtml(family.name)}</span>`).join("")}
            </div>
          </td>
          <td>
            <div class="family-list">
              ${(model.expandedFamilies || []).map((family) => `<span class="pill pill-warn">${escapeHtml(family.name)}</span>`).join("")}
            </div>
          </td>
        </tr>
      `).join("")}
    </tbody>
  `;
}

async function runRealtime() {
  const button = document.getElementById("runRealtime");
  button.disabled = true;
  button.textContent = "Running collectors…";
  try {
    const result = await json("/demo/bootstrap/realtime", { method: "POST" });
    resultPanel.textContent = JSON.stringify(result, null, 2);
    await loadAll();
  } catch (error) {
    resultPanel.textContent = error.stack || String(error);
  } finally {
    button.disabled = false;
    button.textContent = "Run all collectors";
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
  const models = buildProviderModels({ overview, scenarios, liveSetup, catalogs });
  renderHeroStats(overview);
  renderSteps(overview);
  renderOverview(overview);
  renderProviders(models);
  renderServiceMatrix(models);
  await loadAudit();
}

loadAll().catch((error) => {
  resultPanel.textContent = error.stack || String(error);
});
