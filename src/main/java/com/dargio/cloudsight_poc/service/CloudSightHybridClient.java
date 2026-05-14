package com.dargio.cloudsight_poc.service;

import com.dargio.cloudsight_poc.dto.UsageRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

@Service
public class CloudSightHybridClient {

    private static final int CONNECT_TIMEOUT_MS = 8_000;
    private static final int READ_TIMEOUT_MS = 60_000;

    @Value("${cloudsight.api.base-url}")
    private String baseUrl;

    @Value("${cloudsight.workspace.email}")
    private String workspaceEmail;

    @Value("${cloudsight.workspace.password}")
    private String workspacePassword;

    @Value("${cloudsight.collector.aws-url}")
    private String awsCollectorUrl;

    @Value("${cloudsight.collector.gcp-url}")
    private String gcpCollectorUrl;

    @Value("${cloudsight.collector.azure-url}")
    private String azureCollectorUrl;

    @Value("${cloudsight.collector.openai-url}")
    private String openAiCollectorUrl;

    private static final List<ServiceProfile> PROFILES = List.of(
            profile("openai-gpt4", "OPENAI", "gpt-4-input", "gpt-4-output", 4200, 1800),
            profile("openai-gpt41", "OPENAI", "gpt-4.1-input", "gpt-4.1-output", 6400, 2700),
            profile("openai-embeddings", "OPENAI", "embeddings-input", "embeddings-output", 14000, 0),
            profile("aws-lambda", "AWS", "lambda-request", "lambda-duration-gb-second", 2400000, 12800),
            profile("aws-s3", "AWS", "s3-put", "s3-get", 38000, 142000),
            profile("aws-api-gateway", "AWS", "api-gateway-request", "cloudfront-egress-gb", 8200000, 54),
            profile("aws-dynamodb", "AWS", "dynamodb-read-request-unit", "dynamodb-write-request-unit", 3400000, 820000),
            profile("gcp-gemini", "GCP", "gemini-input", "gemini-output", 4800, 2100),
            profile("gcp-cloud-run", "GCP", "cloud-run-request", "cloud-run-vcpu-second", 2700000, 18400),
            profile("gcp-bigquery", "GCP", "bigquery-query-tb", "cloud-storage-class-a", 4, 220000),
            profile("gcp-pubsub", "GCP", "pubsub-message-operation", "cloud-storage-class-b", 3600000, 310000),
            profile("azure-openai", "AZURE", "azure-openai-input", "azure-openai-output", 5600, 2400),
            profile("azure-blob", "AZURE", "blob-read", "blob-write", 210000, 64000),
            profile("azure-functions", "AZURE", "functions-execution", "bandwidth-egress-gb", 1800000, 24),
            profile("azure-sql", "AZURE", "azure-sql-vcore-hour", "managed-disk-gb-month", 14, 420)
    );

    private final RestTemplate restTemplate;
    private final AuditTrailService auditTrailService;
    private volatile Session cachedSession;
    private volatile Instant cachedSessionExpiresAt;

    public CloudSightHybridClient(AuditTrailService auditTrailService) {
        this.auditTrailService = auditTrailService;
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(CONNECT_TIMEOUT_MS);
        requestFactory.setReadTimeout(READ_TIMEOUT_MS);
        this.restTemplate = new RestTemplate(requestFactory);
    }

    public Map<String, Object> contract() {
        return Map.of(
                "integrationOption", "hybrid",
                "workflow", List.of(
                        "Authenticate with workspace admin credentials.",
                        "Ensure provider connections exist for AWS, GCP, AZURE, and OPENAI.",
                        "Send provider-native payloads to deployed collectors for real-time automatic capture.",
                        "Use the returned CloudSight API key to send normalized usage rows.",
                        "Read dashboard, usage, connections, and reports back from CloudSight."
                ),
                "noPiiGuidance", List.of(
                        "Keep workspace admin credentials in server-side secrets only.",
                        "Use generic provider identifiers and secret references in connections.",
                        "Collectors send only safe provider telemetry, not end-user content or prompts.",
                        "Send only normalized service, endpoint, unit, and timestamp data to usage ingestion."
                )
        );
    }

    public Map<String, Object> bootstrap(int eventsPerProfile, int spreadDays) {
        Session session;
        try {
            session = login();
        } catch (RestClientException error) {
            return Map.of(
                    "integrationOption", "hybrid",
                    "status", "ERROR",
                    "stage", "workspace-authentication",
                    "message", error.getMessage(),
                    "audit", audit()
            );
        }
        List<Map<String, Object>> connectionResults = ensureConnections(session.token());
        List<Map<String, Object>> usageResults = sendUsage(session.apiKey(), bounded(eventsPerProfile, 1, 25), bounded(spreadDays, 1, 365));

        List<Map<String, Object>> readback = List.of(
                safeReadback("connections", baseUrl + "/api/connections", session.token()),
                safeReadback("dashboardOverview", baseUrl + "/api/dashboard/overview?days=30", session.token()),
                safeReadback("usageSummary", baseUrl + "/api/usage/summary?days=30", session.token()),
                safeReadback("reportStatement", baseUrl + "/api/reports/statement?days=30", session.token())
        );

        return Map.of(
                "integrationOption", "hybrid",
                "connections", connectionResults,
                "usageDispatch", Map.of(
                        "profiles", PROFILES.size(),
                        "eventsSent", usageResults.size(),
                        "results", usageResults
                ),
                "cloudSightReadback", readback
        );
    }

    public Map<String, Object> bootstrapRealtimeCollectors() {
        Session session = null;
        Map<String, Object> authStatus = Map.of("status", "SKIPPED");
        try {
            session = login();
        } catch (RestClientException error) {
            authStatus = Map.of(
                    "status", "RATE_LIMITED",
                    "message", error.getMessage()
            );
        }

        List<Map<String, Object>> connectionResults = session == null
                ? List.of(Map.of(
                "status", "SKIPPED",
                "reason", "Workspace auth was unavailable for this run."
        ))
                : ensureConnections(session.token());
        List<Map<String, Object>> collectorResults = new ArrayList<>();

        collectorResults.add(postCollectorPayloads("AWS", awsCollectorUrl, awsCollectorPayloads()));
        collectorResults.add(postCollectorPayloads("GCP", gcpCollectorUrl, gcpCollectorPayloads()));
        collectorResults.add(postCollectorPayloads("AZURE", azureCollectorUrl, azureCollectorPayloads()));
        collectorResults.add(postCollectorPayloads("OPENAI", openAiCollectorUrl, List.of(openAiCollectorPayload())));

        List<Map<String, Object>> readback = session == null
                ? List.of(Map.of(
                "key", "workspaceReadback",
                "status", "SKIPPED",
                "reason", "Workspace auth was rate-limited, so collector dispatch results are returned without authenticated readback."
        ))
                : List.of(
                safeReadback("connections", baseUrl + "/api/connections", session.token()),
                safeReadback("dashboardOverview", baseUrl + "/api/dashboard/overview?days=30", session.token()),
                safeReadback("usageSummary", baseUrl + "/api/usage/summary?days=30", session.token()),
                safeReadback("reportStatement", baseUrl + "/api/reports/statement?days=30", session.token())
        );

        return Map.of(
                "integrationOption", "hybrid-collector-realtime",
                "status", collectorResults.stream().allMatch(item -> "SUCCESS".equals(item.get("status"))) ? "SUCCESS" : "PARTIAL",
                "workspaceAuth", authStatus,
                "connections", connectionResults,
                "collectorDispatch", collectorResults,
                "cloudSightReadback", readback,
                "piiMode", "Provider-native event and metric summaries only. No user prompts, documents, or customer identifiers."
        );
    }

    public List<Map<String, Object>> audit() {
        return auditTrailService.events();
    }

    private Session login() {
        if (cachedSession != null
                && cachedSessionExpiresAt != null
                && cachedSessionExpiresAt.isAfter(Instant.now().plusSeconds(30))) {
            return cachedSession;
        }

        String loginUrl = baseUrl + "/auth/login";
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, String>> entity = new HttpEntity<>(Map.of(
                "email", workspaceEmail,
                "password", workspacePassword
        ), headers);

        ResponseEntity<Map> response = null;
        RestClientException lastError = null;
        for (int attempt = 1; attempt <= 4; attempt++) {
            try {
                response = restTemplate.exchange(loginUrl, HttpMethod.POST, entity, Map.class);
                break;
            } catch (RestClientException error) {
                lastError = error;
                record("hybrid", "POST", loginUrl, Map.of("Content-Type", "application/json"), Map.of("email", "REDACTED", "password", "REDACTED"), 0, Map.of(
                        "error", error.getMessage(),
                        "attempt", attempt
                ));
                if (!isRetryable(error) || attempt == 4) {
                    throw error;
                }
                sleep(attempt * 2500L);
            }
        }

        if (response == null) {
            throw lastError == null ? new IllegalStateException("Authentication did not return a response") : lastError;
        }
        Map<String, Object> body = response.getBody();
        String token = body == null ? "" : String.valueOf(body.get("token"));
        String apiKey = body == null ? "" : String.valueOf(body.get("apiKey"));

        record("hybrid", "POST", loginUrl, Map.of("Content-Type", "application/json"), Map.of("email", "REDACTED", "password", "REDACTED"), response.getStatusCode().value(), Map.of("token", "REDACTED", "apiKey", mask(apiKey)));
        cachedSession = new Session(token, apiKey);
        cachedSessionExpiresAt = Instant.now().plus(45, ChronoUnit.MINUTES);
        return cachedSession;
    }

    private List<Map<String, Object>> ensureConnections(String token) {
        Map<String, Object> overview = getJson(baseUrl + "/api/connections", token);
        List<Map<String, Object>> currentConnections = (List<Map<String, Object>>) overview.getOrDefault("connections", List.of());

        List<Map<String, Object>> results = new ArrayList<>();
        for (String provider : List.of("AWS", "GCP", "AZURE", "OPENAI")) {
            try {
                    Map<String, Object> existing = currentConnections.stream()
                            .filter(connection -> provider.equalsIgnoreCase(String.valueOf(connection.get("provider"))))
                            .findFirst()
                            .orElse(null);
                    if (existing != null) {
                        results.add(Map.of("status", "EXISTS", "provider", provider, "connection", existing));
                        continue;
                    }
                    results.add(postJson(baseUrl + "/api/connections", token, connectionTemplate(provider)));
            } catch (RestClientException error) {
                results.add(Map.of("status", "ERROR", "provider", provider, "error", error.getMessage()));
            }
        }
        return results;
    }

    private List<Map<String, Object>> sendUsage(String apiKey, int eventsPerProfile, int spreadDays) {
        return PROFILES.stream()
                .flatMap(profile -> buildRequests(profile, eventsPerProfile, spreadDays).stream())
                .map(request -> postUsage(baseUrl + "/api/usage", apiKey, request))
                .toList();
    }

    private Map<String, Object> getJson(String url, String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        HttpEntity<Void> entity = new HttpEntity<>(headers);
        ResponseEntity<Map> response;
        try {
            response = restTemplate.exchange(url, HttpMethod.GET, entity, Map.class);
        } catch (RestClientException error) {
            record("hybrid", "GET", url, Map.of("Authorization", "Bearer REDACTED"), Map.of(), 0, Map.of("error", error.getMessage()));
            throw error;
        }
        record("hybrid", "GET", url, Map.of("Authorization", "Bearer REDACTED"), Map.of(), response.getStatusCode().value(), response.getBody());
        return response.getBody();
    }

    private Map<String, Object> postJson(String url, String token, Map<String, Object> body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
        ResponseEntity<Map> response;
        try {
            response = restTemplate.exchange(url, HttpMethod.POST, entity, Map.class);
        } catch (RestClientException error) {
            record("hybrid", "POST", url, Map.of("Authorization", "Bearer REDACTED", "Content-Type", "application/json"), body, 0, Map.of("error", error.getMessage()));
            throw error;
        }
        record("hybrid", "POST", url, Map.of("Authorization", "Bearer REDACTED", "Content-Type", "application/json"), body, response.getStatusCode().value(), response.getBody());
        return response.getBody();
    }

    private Map<String, Object> postCollectorPayloads(String provider, String collectorUrl, List<Object> payloads) {
        List<Map<String, Object>> results = new ArrayList<>();
        boolean anyError = false;
        for (Object payload : payloads) {
            Map<String, Object> result = postSingleCollectorPayload(provider, collectorUrl, payload);
            results.add(result);
            if (!"SUCCESS".equals(result.get("status"))) {
                anyError = true;
            }
        }
        return Map.of(
                "provider", provider,
                "status", anyError ? "PARTIAL" : "SUCCESS",
                "collectorUrl", collectorUrl.replaceAll("/$", ""),
                "batchesSent", payloads.size(),
                "results", results
        );
    }

    private Map<String, Object> postSingleCollectorPayload(String provider, String collectorUrl, Object body) {
        String url = collectorUrl.replaceAll("/$", "");
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Object> entity = new HttpEntity<>(body, headers);
        ResponseEntity<Map> response;
        try {
            response = restTemplate.exchange(url, HttpMethod.POST, entity, Map.class);
        } catch (RestClientException error) {
            record("hybrid-collector-realtime", "POST", url, Map.of("Content-Type", "application/json"), Map.of(
                    "provider", provider,
                    "payload", body
            ), 0, Map.of("error", error.getMessage()));
            return Map.of(
                    "provider", provider,
                    "status", "ERROR",
                    "collectorUrl", url,
                    "error", error.getMessage()
            );
        }

        record("hybrid-collector-realtime", "POST", url, Map.of("Content-Type", "application/json"), Map.of(
                "provider", provider,
                "payload", body
        ), response.getStatusCode().value(), response.getBody());
        return Map.of(
                "provider", provider,
                "status", "SUCCESS",
                "collectorUrl", url,
                "result", response.getBody()
        );
    }

    private Map<String, Object> postUsage(String url, String apiKey, UsageRequest body) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-API-KEY", apiKey);
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<UsageRequest> entity = new HttpEntity<>(body, headers);
        ResponseEntity<Map> response;
        try {
            response = restTemplate.exchange(url, HttpMethod.POST, entity, Map.class);
        } catch (RestClientException error) {
            record("hybrid", "POST", url, Map.of("X-API-KEY", mask(apiKey), "Content-Type", "application/json"), Map.of(
                    "service", body.getService(),
                    "inputEndpoint", body.getInputEndpoint(),
                    "outputEndpoint", body.getOutputEndpoint(),
                    "inputUnits", body.getInputUnits(),
                    "outputUnits", body.getOutputUnits(),
                    "timestamp", body.getTimestamp()
            ), 0, Map.of("error", error.getMessage()));
            return Map.of(
                    "status", "ERROR",
                    "request", Map.of(
                            "service", body.getService(),
                            "inputEndpoint", body.getInputEndpoint(),
                            "outputEndpoint", body.getOutputEndpoint()
                    ),
                    "error", error.getMessage()
            );
        }
        record("hybrid", "POST", url, Map.of("X-API-KEY", mask(apiKey), "Content-Type", "application/json"), Map.of(
                "service", body.getService(),
                "inputEndpoint", body.getInputEndpoint(),
                "outputEndpoint", body.getOutputEndpoint(),
                "inputUnits", body.getInputUnits(),
                "outputUnits", body.getOutputUnits(),
                "timestamp", body.getTimestamp()
        ), response.getStatusCode().value(), response.getBody());
        return response.getBody();
    }

    private Map<String, Object> safeReadback(String key, String url, String token) {
        try {
            return Map.of(
                    "key", key,
                    "status", "SUCCESS",
                    "data", getJson(url, token)
            );
        } catch (RestClientException error) {
            return Map.of(
                    "key", key,
                    "status", "ERROR",
                    "error", error.getMessage()
            );
        }
    }

    private List<Object> awsCollectorPayloads() {
        return List.of(
                Map.of(
                        "batchReference", "poc-aws-s3-" + UUID.randomUUID(),
                        "source", "aws.s3",
                        "detail-type", "Object Created",
                        "time", Instant.now().toString(),
                        "region", "ap-south-1",
                        "account", "demo-aws-account",
                        "detail", Map.of("bucket", Map.of("name", "cloudsight-demo"))
                ),
                Map.of("metricType", "lambda-summary", "invocations", 2200000, "gbSeconds", 14400, "timestamp", Instant.now().toString(), "regionCode", "ap-south-1"),
                Map.of("metricType", "ec2-ebs-summary", "coreHours", 34, "gp3GbMonth", 260, "timestamp", Instant.now().toString(), "regionCode", "ap-south-1"),
                Map.of("metricType", "rds-summary", "instanceHours", 16, "timestamp", Instant.now().toString(), "regionCode", "ap-south-1"),
                Map.of("metricType", "api-gateway-summary", "requests", 7600000, "egressGb", 44, "timestamp", Instant.now().toString(), "regionCode", "ap-south-1"),
                Map.of("metricType", "cloudfront-summary", "requests", 1900000, "egressGb", 28, "timestamp", Instant.now().toString(), "regionCode", "ap-south-1"),
                Map.of("metricType", "dynamodb-summary", "readUnits", 2800000, "writeUnits", 780000, "timestamp", Instant.now().toString(), "regionCode", "ap-south-1"),
                Map.of("metricType", "queueing-summary", "sqsRequests", 2400000, "snsPublishes", 640000, "timestamp", Instant.now().toString(), "regionCode", "ap-south-1")
        );
    }

    private List<Object> gcpCollectorPayloads() {
        return List.of(
                Map.of(
                        "protoPayload", Map.of(
                                "serviceName", "storage.googleapis.com",
                                "methodName", "storage.objects.create"
                        ),
                        "resource", Map.of(
                                "labels", Map.of(
                                        "location", "asia-south1",
                                        "project_id", "cloudsight-demo-gcp"
                                )
                        ),
                        "timestamp", Instant.now().toString()
                ),
                Map.of("metricType", "gemini-summary", "model", "gemini-1.5-pro", "inputTokens", 4600, "outputTokens", 1900, "timestamp", Instant.now().toString(), "regionCode", "asia-south1"),
                Map.of("metricType", "vision-summary", "objectDetectionMinutes", 240, "searchRequests", 5400, "timestamp", Instant.now().toString(), "regionCode", "asia-south1"),
                Map.of("metricType", "cloud-run-summary", "requests", 2400000, "vcpuSeconds", 17200, "timestamp", Instant.now().toString(), "regionCode", "asia-south1"),
                Map.of("metricType", "gke-runtime-summary", "memoryGibSeconds", 38000, "clusterHours", 8, "timestamp", Instant.now().toString(), "regionCode", "asia-south1"),
                Map.of("metricType", "bigquery-job", "terabytesScanned", 4, "timestamp", Instant.now().toString(), "regionCode", "asia-south1"),
                Map.of("metricType", "pubsub-summary", "messageOperations", 3400000, "classBOperations", 260000, "timestamp", Instant.now().toString(), "regionCode", "asia-south1")
        );
    }

    private List<Object> azureCollectorPayloads() {
        return List.of(
                List.of(Map.of(
                        "id", UUID.randomUUID().toString(),
                        "eventType", "Microsoft.Storage.BlobCreated",
                        "eventTime", Instant.now().toString(),
                        "data", Map.of("api", "centralindia")
                )),
                Map.of("metricType", "vm-summary", "coreHours", 24, "memoryGbHours", 96, "timestamp", Instant.now().toString(), "regionCode", "centralindia"),
                Map.of("metricType", "functions-summary", "executions", 1650000, "egressGb", 18, "timestamp", Instant.now().toString(), "regionCode", "centralindia"),
                Map.of("metricType", "azure-openai-summary", "inputTokens", 7200, "outputTokens", 3100, "timestamp", Instant.now().toString(), "regionCode", "centralindia"),
                Map.of("metricType", "sql-summary", "vcoreHours", 18, "diskGbMonth", 300, "timestamp", Instant.now().toString(), "regionCode", "centralindia"),
                Map.of("metricType", "cosmos-summary", "requestUnits", 2200000, "diskGbMonth", 180, "timestamp", Instant.now().toString(), "regionCode", "centralindia")
        );
    }

    private Map<String, Object> openAiCollectorPayload() {
        return Map.of(
                "batchReference", "poc-openai-" + UUID.randomUUID(),
                "records", List.of(
                        Map.of("model", "gpt-4", "inputTokens", 4200, "outputTokens", 1800, "timestamp", Instant.now().toString(), "feature", "assistant"),
                        Map.of("model", "gpt-4o-mini", "inputTokens", 9600, "outputTokens", 3200, "timestamp", Instant.now().toString(), "feature", "copilot"),
                        Map.of("model", "gpt-4.1", "inputTokens", 7200, "outputTokens", 2800, "timestamp", Instant.now().toString(), "feature", "analysis"),
                        Map.of("model", "o3", "inputTokens", 5400, "outputTokens", 2200, "timestamp", Instant.now().toString(), "feature", "reasoning"),
                        Map.of("model", "text-embedding-3-large", "inputTokens", 28000, "outputTokens", 0, "timestamp", Instant.now().toString(), "feature", "retrieval")
                )
        );
    }

    private List<UsageRequest> buildRequests(ServiceProfile profile, int events, int spreadDays) {
        return java.util.stream.IntStream.range(0, events)
                .mapToObj(index -> {
                    UsageRequest request = new UsageRequest();
                    request.setService(profile.service());
                    request.setInputEndpoint(profile.inputEndpoint());
                    request.setOutputEndpoint(profile.outputEndpoint());
                    request.setInputUnits(vary(profile.inputUnits(), index));
                    request.setOutputUnits(vary(profile.outputUnits(), index));
                    request.setTimestamp(Instant.now()
                            .minus(ThreadLocalRandom.current().nextInt(spreadDays), ChronoUnit.DAYS)
                            .minus(index % 10L, ChronoUnit.HOURS));
                    return request;
                })
                .toList();
    }

    private int vary(long base, int index) {
        long jitter = Math.max(1, base / 14);
        long candidate = base + ((index % 2 == 0 ? 1 : -1) * (jitter / 2 + index * 11L));
        return (int) Math.max(0, candidate);
    }

    private int bounded(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private void record(String integrationOption,
                        String method,
                        String url,
                        Map<String, Object> headers,
                        Map<String, Object> requestBody,
                        int status,
                        Object responseBody) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("integrationOption", integrationOption);
        event.put("method", method);
        event.put("url", url);
        event.put("headers", headers);
        event.put("requestBody", requestBody);
        event.put("responseStatus", status);
        event.put("responseBody", responseBody);
        auditTrailService.record(event);
    }

    private Map<String, Object> connectionTemplate(String provider) {
        return switch (provider.toUpperCase(Locale.ROOT)) {
            case "AWS" -> Map.of(
                    "provider", "AWS",
                    "connectionName", "aws-prod-hybrid",
                    "authType", "IAM role",
                    "accountIdentifier", "aws-hybrid-billing-01",
                    "projectIdentifier", "aws-hybrid-org",
                    "secretReference", "env:CLOUDSIGHT_AWS_CONNECTION_SECRET",
                    "status", "CONFIGURED",
                    "environment", "Production",
                    "scopes", List.of("cur-export", "ec2-pricing", "s3-pricing"),
                    "notes", "No PII. Hybrid demo connection."
            );
            case "GCP" -> Map.of(
                    "provider", "GCP",
                    "connectionName", "gcp-prod-hybrid",
                    "authType", "Service account",
                    "accountIdentifier", "gcp-hybrid-billing-01",
                    "projectIdentifier", "gcp-hybrid-platform",
                    "secretReference", "env:CLOUDSIGHT_GCP_CONNECTION_SECRET",
                    "status", "CONFIGURED",
                    "environment", "Production",
                    "scopes", List.of("billing-export", "bigquery", "cloud-run"),
                    "notes", "No PII. Hybrid demo connection."
            );
            case "AZURE" -> Map.of(
                    "provider", "AZURE",
                    "connectionName", "azure-prod-hybrid",
                    "authType", "Service principal",
                    "accountIdentifier", "azure-hybrid-subscription-01",
                    "projectIdentifier", "azure-hybrid-tenant",
                    "secretReference", "env:CLOUDSIGHT_AZURE_CONNECTION_SECRET",
                    "status", "CONFIGURED",
                    "environment", "Production",
                    "scopes", List.of("cost-management", "functions", "azure-openai"),
                    "notes", "No PII. Hybrid demo connection."
            );
            case "OPENAI" -> Map.of(
                    "provider", "OPENAI",
                    "connectionName", "openai-prod-hybrid",
                    "authType", "API key",
                    "accountIdentifier", "openai-hybrid-org",
                    "projectIdentifier", "openai-hybrid-project",
                    "secretReference", "env:CLOUDSIGHT_OPENAI_CONNECTION_SECRET",
                    "status", "CONFIGURED",
                    "environment", "Production",
                    "scopes", List.of("usage.read", "models.read", "pricing.snapshot"),
                    "notes", "No PII. Hybrid demo connection."
            );
            default -> throw new IllegalArgumentException("Unsupported provider: " + provider);
        };
    }

    private String mask(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        if (value.length() <= 8) {
            return "****";
        }
        return value.substring(0, 4) + "..." + value.substring(value.length() - 4);
    }

    private boolean isRetryable(RestClientException error) {
        String message = error.getMessage();
        if (message == null) {
            return false;
        }
        String normalized = message.toUpperCase(Locale.ROOT);
        return normalized.contains("429") || normalized.contains("TOO MANY REQUESTS") || normalized.contains("TIMED OUT");
    }

    private void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException interruptedException) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while waiting to retry", interruptedException);
        }
    }

    private static ServiceProfile profile(String key, String service, String inputEndpoint, String outputEndpoint, long inputUnits, long outputUnits) {
        return new ServiceProfile(key, service, inputEndpoint, outputEndpoint, inputUnits, outputUnits);
    }

    private record ServiceProfile(
            String key,
            String service,
            String inputEndpoint,
            String outputEndpoint,
            long inputUnits,
            long outputUnits
    ) {}

    private record Session(String token, String apiKey) {}
}
