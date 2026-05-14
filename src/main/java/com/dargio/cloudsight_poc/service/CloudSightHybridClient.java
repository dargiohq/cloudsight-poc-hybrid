package com.dargio.cloudsight_poc.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.dargio.cloudsight_poc.dto.UsageRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

@Service
public class CloudSightHybridClient {

    private static final int CONNECT_TIMEOUT_MS = 8_000;
    private static final int READ_TIMEOUT_MS = 60_000;
    private static final long COLLECTOR_DISPATCH_DELAY_MS = 2_500L;
    private static final long COLLECTOR_PROVIDER_DELAY_MS = 4_000L;
    private static final DateTimeFormatter AWS_TIMESTAMP = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(java.time.ZoneOffset.UTC);
    private static final DateTimeFormatter AWS_DATE = DateTimeFormatter.ofPattern("yyyyMMdd").withZone(java.time.ZoneOffset.UTC);
    private static final String LIVE_AWS_PROVIDER = "AWS";
    private static final String LIVE_GCP_PROVIDER = "GCP";
    private static final String LIVE_AZURE_PROVIDER = "AZURE";
    private static final String LIVE_OPENAI_PROVIDER = "OPENAI";

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

    @Value("${cloudsight.live.aws.region}")
    private String liveAwsRegion;

    @Value("${cloudsight.live.aws.bucket}")
    private String liveAwsBucket;

    @Value("${cloudsight.live.aws.access-key-id}")
    private String liveAwsAccessKeyId;

    @Value("${cloudsight.live.aws.secret-access-key}")
    private String liveAwsSecretAccessKey;

    @Value("${cloudsight.live.aws.session-token:}")
    private String liveAwsSessionToken;

    @Value("${cloudsight.live.gcp.bucket}")
    private String liveGcpBucket;

    @Value("${cloudsight.live.gcp.service-account-json}")
    private String liveGcpServiceAccountJson;

    @Value("${cloudsight.live.gcp.service-account-file:}")
    private String liveGcpServiceAccountFile;

    @Value("${cloudsight.live.azure.blob-container-sas-url}")
    private String liveAzureBlobContainerSasUrl;

    @Value("${cloudsight.live.openai.api-key}")
    private String liveOpenAiApiKey;

    @Value("${cloudsight.live.openai.model}")
    private String liveOpenAiModel;

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
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private volatile Session cachedSession;
    private volatile Instant cachedSessionExpiresAt;

    public CloudSightHybridClient(AuditTrailService auditTrailService) {
        this.auditTrailService = auditTrailService;
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(CONNECT_TIMEOUT_MS);
        requestFactory.setReadTimeout(READ_TIMEOUT_MS);
        this.restTemplate = new RestTemplate(requestFactory);
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(java.time.Duration.ofMillis(CONNECT_TIMEOUT_MS))
                .build();
        this.objectMapper = new ObjectMapper();
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
                ),
                "executionModes", List.of(
                        "collector-replay: premium demo mode using provider-native non-PII signals through live collectors",
                        "direct-ingestion: optional fallback path using /api/usage",
                        "live-provider-calls: only possible when real cloud credentials, resources, and network access are explicitly configured"
                )
        );
    }

    public Map<String, Object> overview() {
        Map<String, Object> overview = new LinkedHashMap<>();
        overview.put("application", "cloudsight-poc-hybrid");
        overview.put("mode", "hybrid-premium-console");
        overview.put("cloudSightBaseUrl", baseUrl);
        overview.put("cloudSightWorkspace", workspaceEmail);
        overview.put("collectors", List.of(
                collectorInfo("AWS", awsCollectorUrl, List.of("S3", "Lambda", "EC2 + EBS", "RDS", "API Gateway", "CloudFront", "DynamoDB", "SQS + SNS")),
                collectorInfo("GCP", gcpCollectorUrl, List.of("Cloud Storage", "Gemini", "Vision", "Cloud Run", "GKE runtime", "BigQuery", "Pub/Sub")),
                collectorInfo("AZURE", azureCollectorUrl, List.of("Blob Storage", "VM", "Functions", "Azure OpenAI", "Azure SQL", "Cosmos DB")),
                collectorInfo("OPENAI", openAiCollectorUrl, List.of("gpt-4", "gpt-4o-mini", "gpt-4.1", "o3", "text-embedding-3-large"))
        ));
        overview.put("coverage", Map.of(
                "modeledScenarioCount", scenarios().size(),
                "liveProviderScenarioCount", liveScenarios().size(),
                "providerCount", 4,
                "catalogFamilyCount", catalogs().stream().mapToInt(item -> ((List<?>) item.getOrDefault("serviceFamilies", List.of())).size()).sum(),
                "realCloudCallSupport", "Optional and credential-dependent. This console proves the collector architecture with safe provider-native signals and can run selected real provider calls when credentials are present.",
                "recommendedClientStory", "Deploy collectors first, then add optional live provider credentials and billing connections."
        ));
        overview.put("liveSetup", liveSetup());

        try {
            Session session = login();
            overview.put("cloudSight", Map.of(
                    "auth", "CONNECTED",
                    "connections", getJson(baseUrl + "/api/connections", session.token()),
                    "dashboardOverview", getJson(baseUrl + "/api/dashboard/overview?days=30", session.token()),
                    "usageSummary", getJson(baseUrl + "/api/usage/summary?days=30", session.token()),
                    "reportStatement", getJson(baseUrl + "/api/reports/statement?days=30", session.token())
            ));
        } catch (RestClientException error) {
            overview.put("cloudSight", Map.of(
                    "auth", "UNAVAILABLE",
                    "message", error.getMessage()
            ));
        }

        return overview;
    }

    public List<Map<String, Object>> liveSetup() {
        return List.of(
                liveSetupView(LIVE_AWS_PROVIDER, "S3 PutObject", List.of(
                        envRequirement("CLOUDSIGHT_LIVE_AWS_ACCESS_KEY_ID", configured(liveAwsAccessKeyId), "AWS access key id"),
                        envRequirement("CLOUDSIGHT_LIVE_AWS_SECRET_ACCESS_KEY", configured(liveAwsSecretAccessKey), "AWS secret access key"),
                        envRequirement("CLOUDSIGHT_LIVE_AWS_REGION", configured(liveAwsRegion), "AWS region"),
                        envRequirement("CLOUDSIGHT_LIVE_AWS_BUCKET", configured(liveAwsBucket), "S3 bucket for live write test")
                ), List.of(
                        "Deploy the AWS collector and keep signed collector credentials configured.",
                        "Create or reuse a non-PII demo bucket dedicated to CloudSight verification.",
                        "Add AWS access key or short-lived role credentials to server-side secrets only.",
                        "Run the live S3 scenario to put a tiny object, send the matching collector payload, and verify the entry in CloudSight."
                ), liveResourceSummary("bucket", liveAwsBucket, "region", liveAwsRegion)),
                liveSetupView(LIVE_GCP_PROVIDER, "Cloud Storage object upload", List.of(
                        envRequirement("CLOUDSIGHT_LIVE_GCP_SERVICE_ACCOUNT_JSON or CLOUDSIGHT_LIVE_GCP_SERVICE_ACCOUNT_FILE", gcpServiceAccountConfigured(), "Service account JSON or secret file with storage write access"),
                        envRequirement("CLOUDSIGHT_LIVE_GCP_BUCKET", configured(liveGcpBucket), "Cloud Storage bucket for live write test")
                ), List.of(
                        "Deploy the GCP collector and keep signed collector credentials configured.",
                        "Create or reuse a non-PII Cloud Storage bucket dedicated to CloudSight verification.",
                        "Store the service account JSON in a secret manager or Render secret file, not in source control.",
                        "Run the live GCP scenario to upload a tiny object, emit the matching collector payload, and verify the entry in CloudSight."
                ), liveResourceSummary("bucket", liveGcpBucket, "credentialSource", gcpServiceAccountConfigured() ? gcpCredentialSource() : "Missing")),
                liveSetupView(LIVE_AZURE_PROVIDER, "Blob Storage block blob upload", List.of(
                        envRequirement("CLOUDSIGHT_LIVE_AZURE_BLOB_CONTAINER_SAS_URL", configured(liveAzureBlobContainerSasUrl), "Container SAS URL with blob write permission")
                ), List.of(
                        "Deploy the Azure collector and keep signed collector credentials configured.",
                        "Create or reuse a non-PII blob container dedicated to CloudSight verification.",
                        "Store the SAS URL in server-side secrets only and rotate it like any other credential.",
                        "Run the live Azure scenario to write a small blob, emit the matching collector payload, and verify the entry in CloudSight."
                ), liveResourceSummary("containerSas", configured(liveAzureBlobContainerSasUrl) ? "Configured" : "Missing")),
                liveSetupView(LIVE_OPENAI_PROVIDER, "OpenAI Responses API", List.of(
                        envRequirement("CLOUDSIGHT_LIVE_OPENAI_API_KEY", configured(liveOpenAiApiKey), "OpenAI API key"),
                        envRequirement("CLOUDSIGHT_LIVE_OPENAI_MODEL", configured(liveOpenAiModel), "OpenAI model to call")
                ), List.of(
                        "Deploy the OpenAI sync collector and keep signed collector credentials configured.",
                        "Store the API key in server-side secrets only and restrict it to a demo-safe project.",
                        "Use a short, non-PII prompt so the run produces real usage without sending customer content.",
                        "Run the live OpenAI scenario to call the Responses API, forward actual usage counts through the collector, and verify the entry in CloudSight."
                ), liveResourceSummary("model", liveOpenAiModel))
        );
    }

    public List<Map<String, Object>> catalogs() {
        return List.of(
                catalogView(LIVE_AWS_PROVIDER, List.of(
                        catalogFamily("S3", "collector-ready", true, true),
                        catalogFamily("Lambda", "collector-ready", true, false),
                        catalogFamily("EC2", "collector-ready", false, false),
                        catalogFamily("EBS", "collector-ready", false, false),
                        catalogFamily("RDS", "collector-ready", false, false),
                        catalogFamily("API Gateway", "collector-ready", false, false),
                        catalogFamily("CloudFront", "collector-ready", false, false),
                        catalogFamily("DynamoDB", "collector-ready", false, false),
                        catalogFamily("SQS", "collector-ready", false, false),
                        catalogFamily("SNS", "collector-ready", false, false),
                        catalogFamily("ECS", "catalog-expanded", false, false),
                        catalogFamily("EKS", "catalog-expanded", false, false),
                        catalogFamily("Redshift", "catalog-expanded", false, false)
                )),
                catalogView(LIVE_GCP_PROVIDER, List.of(
                        catalogFamily("Cloud Storage", "collector-ready", true, true),
                        catalogFamily("Gemini", "collector-ready", false, false),
                        catalogFamily("Vision", "collector-ready", false, false),
                        catalogFamily("Cloud Run", "collector-ready", false, false),
                        catalogFamily("GKE", "collector-ready", false, false),
                        catalogFamily("BigQuery", "collector-ready", false, false),
                        catalogFamily("Pub/Sub", "collector-ready", false, false),
                        catalogFamily("Firestore", "catalog-expanded", false, false),
                        catalogFamily("Cloud SQL", "catalog-expanded", false, false),
                        catalogFamily("Dataflow", "catalog-expanded", false, false)
                )),
                catalogView(LIVE_AZURE_PROVIDER, List.of(
                        catalogFamily("Blob Storage", "collector-ready", true, true),
                        catalogFamily("VM", "collector-ready", false, false),
                        catalogFamily("Functions", "collector-ready", false, false),
                        catalogFamily("Azure OpenAI", "collector-ready", false, false),
                        catalogFamily("Azure SQL", "collector-ready", false, false),
                        catalogFamily("Cosmos DB", "collector-ready", false, false),
                        catalogFamily("Bandwidth", "collector-ready", false, false),
                        catalogFamily("Service Bus", "catalog-expanded", false, false),
                        catalogFamily("AKS", "catalog-expanded", false, false),
                        catalogFamily("Application Gateway", "catalog-expanded", false, false)
                )),
                catalogView(LIVE_OPENAI_PROVIDER, List.of(
                        catalogFamily("gpt-4", "collector-ready", false, false),
                        catalogFamily("gpt-4o-mini", "collector-ready", false, false),
                        catalogFamily("gpt-4.1", "collector-ready", true, true),
                        catalogFamily("o3", "collector-ready", false, false),
                        catalogFamily("Embeddings", "collector-ready", false, false),
                        catalogFamily("Audio", "catalog-expanded", false, false),
                        catalogFamily("Images", "catalog-expanded", false, false),
                        catalogFamily("Batch", "catalog-expanded", false, false),
                        catalogFamily("Fine-tuning", "catalog-expanded", false, false)
                ))
        );
    }

    public List<Map<String, Object>> scenarios() {
        return scenarioDefinitions().stream()
                .map(this::scenarioView)
                .toList();
    }

    public Map<String, Object> runScenario(String scenarioId, boolean verify) {
        DemoScenario scenario = scenarioDefinitions().stream()
                .filter(candidate -> candidate.id().equalsIgnoreCase(scenarioId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown scenario: " + scenarioId));

        if ("live-provider-call".equals(scenario.executionMode())) {
            return runLiveProvider(scenario.provider(), verify);
        }

        Session session = login();
        ensureConnections(session.token());

        Map<String, Object> dispatch = postSingleCollectorPayload(
                scenario.provider(),
                scenario.collectorUrl(),
                scenario.payload()
        );

        Map<String, Object> verification = verify
                ? verifyScenario(session.token(), scenario)
                : Map.of("status", "SKIPPED");

        return Map.of(
                "scenario", scenarioView(scenario),
                "dispatch", dispatch,
                "verification", verification
        );
    }

    public Map<String, Object> runLiveProvider(String provider, boolean verify) {
        String normalizedProvider = provider.toUpperCase(Locale.ROOT);
        DemoScenario scenario = scenarioDefinitions().stream()
                .filter(candidate -> candidate.provider().equalsIgnoreCase(normalizedProvider))
                .filter(candidate -> "live-provider-call".equals(candidate.executionMode()))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("No live scenario configured for provider: " + normalizedProvider));
        try {
            requireProviderConfigured(normalizedProvider);
            Session session = login();
            ensureConnections(session.token());

            Map<String, Object> liveCall = switch (normalizedProvider) {
                case LIVE_AWS_PROVIDER -> runAwsLiveS3Call();
                case LIVE_GCP_PROVIDER -> runGcpLiveStorageCall();
                case LIVE_AZURE_PROVIDER -> runAzureLiveBlobCall();
                case LIVE_OPENAI_PROVIDER -> runOpenAiLiveCall();
                default -> throw new IllegalArgumentException("Unsupported live provider: " + provider);
            };

            Map<String, Object> dispatch = postSingleCollectorPayload(
                    normalizedProvider,
                    scenario.collectorUrl(),
                    liveCall.get("collectorPayload")
            );

            Map<String, Object> verification = verify
                    ? verifyScenario(session.token(), scenario)
                    : Map.of("status", "SKIPPED");

            return Map.of(
                    "scenario", scenarioView(scenario),
                    "liveCall", liveCall,
                    "dispatch", dispatch,
                    "verification", verification
            );
        } catch (Exception error) {
            Map<String, Object> wizard = liveSetup().stream()
                    .filter(item -> normalizedProvider.equalsIgnoreCase(String.valueOf(item.get("provider"))))
                    .findFirst()
                    .orElse(Map.of("provider", normalizedProvider));
            return Map.of(
                    "status", "ERROR",
                    "provider", normalizedProvider,
                    "message", error.getMessage(),
                    "scenario", scenarioView(scenario),
                    "wizard", wizard
            );
        }
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
        sleep(COLLECTOR_PROVIDER_DELAY_MS);
        collectorResults.add(postCollectorPayloads("GCP", gcpCollectorUrl, gcpCollectorPayloads()));
        sleep(COLLECTOR_PROVIDER_DELAY_MS);
        collectorResults.add(postCollectorPayloads("AZURE", azureCollectorUrl, azureCollectorPayloads()));
        sleep(COLLECTOR_PROVIDER_DELAY_MS);
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
            sleep(COLLECTOR_DISPATCH_DELAY_MS);
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

    private Map<String, Object> collectorInfo(String provider, String collectorUrl, List<String> families) {
        return Map.of(
                "provider", provider,
                "collectorUrl", collectorUrl,
                "serviceFamilies", families,
                "executionMode", "collector-replay + optional live-provider-call",
                "liveProviderReady", isProviderConfigured(provider),
                "liveProviderCalls", realCloudNote(provider, "Selected live provider call is configured for this collector.")
        );
    }

    private Map<String, Object> scenarioView(DemoScenario scenario) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("id", scenario.id());
        view.put("provider", scenario.provider());
        view.put("title", scenario.title());
        view.put("serviceFamily", scenario.serviceFamily());
        view.put("primaryEndpoint", scenario.primaryEndpoint());
        view.put("secondaryEndpoint", scenario.secondaryEndpoint());
        view.put("collectorUrl", scenario.collectorUrl());
        view.put("signalType", scenario.signalType());
        view.put("executionMode", scenario.executionMode());
        view.put("realCloudReady", scenario.realCloudReady());
        view.put("realCloudNote", scenario.realCloudNote());
        return view;
    }

    private Map<String, Object> verifyScenario(String token, DemoScenario scenario) {
        Map<String, Object> logs = getJson(
                baseUrl + "/api/usage/logs?page=0&size=5&sort=timestamp,desc&search=" + scenario.primaryEndpoint(),
                token
        );
        Map<String, Object> summary = getJson(
                baseUrl + "/api/usage/summary?days=30&search=" + scenario.primaryEndpoint(),
                token
        );
        Object latest = null;
        Object content = logs.get("content");
        if (content instanceof List<?> list && !list.isEmpty()) {
            latest = list.get(0);
        }
        return Map.of(
                "status", latest == null ? "NOT_FOUND" : "SUCCESS",
                "search", scenario.primaryEndpoint(),
                "summary", summary,
                "latestLog", latest == null ? Map.of() : latest
        );
    }

    private List<DemoScenario> scenarioDefinitions() {
        Instant now = Instant.now();
        List<DemoScenario> baseScenarios = List.of(
                new DemoScenario("aws-s3", "AWS", "S3 object created", "S3", "s3-put", "s3-get", awsCollectorUrl, awsS3Payload(now), "S3 event", "collector-replay", false, "Uses a safe S3-style event payload through the live AWS collector."),
                new DemoScenario("aws-lambda", "AWS", "Lambda execution summary", "Lambda", "lambda-request", "lambda-duration-gb-second", awsCollectorUrl, awsLambdaPayload(now), "Metric summary", "collector-replay", false, "Uses a Lambda runtime summary through the live AWS collector."),
                new DemoScenario("aws-ec2-ebs", "AWS", "EC2 and EBS usage", "EC2 + EBS", "ec2-core-hour", "ebs-gp3-gb-month", awsCollectorUrl, awsEc2Payload(now), "Metric summary", "collector-replay", false, "Uses a compute and storage summary through the live AWS collector."),
                new DemoScenario("aws-rds", "AWS", "RDS instance hours", "RDS", "rds-db-instance-hour", "rds-db-instance-hour", awsCollectorUrl, awsRdsPayload(now), "Metric summary", "collector-replay", false, "Uses an RDS summary through the live AWS collector."),
                new DemoScenario("aws-api-gateway", "AWS", "API Gateway requests", "API Gateway", "api-gateway-request", "cloudfront-egress-gb", awsCollectorUrl, awsApiGatewayPayload(now), "Metric summary", "collector-replay", false, "Uses an API Gateway traffic summary through the live AWS collector."),
                new DemoScenario("aws-cloudfront", "AWS", "CloudFront traffic", "CloudFront", "cloudfront-request", "cloudfront-egress-gb", awsCollectorUrl, awsCloudFrontPayload(now), "Metric summary", "collector-replay", false, "Uses a CloudFront traffic summary through the live AWS collector."),
                new DemoScenario("aws-dynamodb", "AWS", "DynamoDB request units", "DynamoDB", "dynamodb-read-request-unit", "dynamodb-write-request-unit", awsCollectorUrl, awsDynamoPayload(now), "Metric summary", "collector-replay", false, "Uses DynamoDB unit summaries through the live AWS collector."),
                new DemoScenario("aws-queueing", "AWS", "SQS and SNS queueing", "SQS + SNS", "sqs-request", "sns-publish-request", awsCollectorUrl, awsQueuePayload(now), "Metric summary", "collector-replay", false, "Uses queueing summaries through the live AWS collector."),

                new DemoScenario("gcp-storage", "GCP", "Cloud Storage write", "Cloud Storage", "cloud-storage-class-a", "cloud-storage-class-b", gcpCollectorUrl, gcpStoragePayload(now), "Audit log", "collector-replay", false, "Uses a Cloud Storage audit-style payload through the live GCP collector."),
                new DemoScenario("gcp-gemini", "GCP", "Gemini model usage", "Gemini", "gemini-input", "gemini-output", gcpCollectorUrl, gcpGeminiPayload(now), "Metric summary", "collector-replay", false, "Uses Gemini token summaries through the live GCP collector."),
                new DemoScenario("gcp-vision", "GCP", "Vision operations", "Vision", "vision-object-detection-minute", "vision-warehouse-search-request", gcpCollectorUrl, gcpVisionPayload(now), "Metric summary", "collector-replay", false, "Uses Vision service summaries through the live GCP collector."),
                new DemoScenario("gcp-cloud-run", "GCP", "Cloud Run traffic", "Cloud Run", "cloud-run-request", "cloud-run-vcpu-second", gcpCollectorUrl, gcpCloudRunPayload(now), "Metric summary", "collector-replay", false, "Uses Cloud Run summaries through the live GCP collector."),
                new DemoScenario("gcp-gke", "GCP", "GKE runtime", "GKE runtime", "cloud-run-memory-gib-second", "gke-cluster-hour", gcpCollectorUrl, gcpGkePayload(now), "Metric summary", "collector-replay", false, "Uses GKE runtime summaries through the live GCP collector."),
                new DemoScenario("gcp-bigquery", "GCP", "BigQuery jobs", "BigQuery", "bigquery-query-tb", "cloud-storage-class-a", gcpCollectorUrl, gcpBigQueryPayload(now), "Job summary", "collector-replay", false, "Uses BigQuery job summaries through the live GCP collector."),
                new DemoScenario("gcp-pubsub", "GCP", "Pub/Sub traffic", "Pub/Sub", "pubsub-message-operation", "cloud-storage-class-b", gcpCollectorUrl, gcpPubSubPayload(now), "Metric summary", "collector-replay", false, "Uses Pub/Sub summaries through the live GCP collector."),

                new DemoScenario("azure-blob", "AZURE", "Blob created", "Blob Storage", "blob-write", "blob-read", azureCollectorUrl, azureBlobPayload(now), "Event Grid event", "collector-replay", false, "Uses an Event Grid-style blob event through the live Azure collector."),
                new DemoScenario("azure-vm", "AZURE", "VM compute summary", "VM", "vm-core-hour", "vm-memory-gb-hour", azureCollectorUrl, azureVmPayload(now), "Metric summary", "collector-replay", false, "Uses VM summaries through the live Azure collector."),
                new DemoScenario("azure-functions", "AZURE", "Functions activity", "Functions", "functions-execution", "bandwidth-egress-gb", azureCollectorUrl, azureFunctionsPayload(now), "Metric summary", "collector-replay", false, "Uses Azure Functions summaries through the live Azure collector."),
                new DemoScenario("azure-openai", "AZURE", "Azure OpenAI tokens", "Azure OpenAI", "azure-openai-input", "azure-openai-output", azureCollectorUrl, azureOpenAiPayload(now), "Metric summary", "collector-replay", false, "Uses Azure OpenAI summaries through the live Azure collector."),
                new DemoScenario("azure-sql", "AZURE", "Azure SQL usage", "Azure SQL", "azure-sql-vcore-hour", "managed-disk-gb-month", azureCollectorUrl, azureSqlPayload(now), "Metric summary", "collector-replay", false, "Uses Azure SQL summaries through the live Azure collector."),
                new DemoScenario("azure-cosmos", "AZURE", "Cosmos DB usage", "Cosmos DB", "cosmosdb-request-unit", "managed-disk-gb-month", azureCollectorUrl, azureCosmosPayload(now), "Metric summary", "collector-replay", false, "Uses Cosmos DB summaries through the live Azure collector."),

                new DemoScenario("openai-usage", "OPENAI", "OpenAI usage sync", "OpenAI", "gpt-4-input", "gpt-4-output", openAiCollectorUrl, openAiCollectorPayload(), "Usage API sync", "collector-replay", false, "Uses a safe OpenAI usage sync payload through the live OpenAI collector.")
        );
        List<DemoScenario> allScenarios = new ArrayList<>(baseScenarios);
        allScenarios.addAll(liveScenarios());
        return allScenarios;
    }

    private List<DemoScenario> liveScenarios() {
        return List.of(
                new DemoScenario("aws-s3-live", LIVE_AWS_PROVIDER, "Live S3 PutObject", "S3", "s3-put", "s3-get", awsCollectorUrl, Map.of(), "Live API call", "live-provider-call", isProviderConfigured(LIVE_AWS_PROVIDER), realCloudNote(LIVE_AWS_PROVIDER, "Writes a tiny object to the configured S3 bucket, then forwards the matching collector payload.")),
                new DemoScenario("gcp-storage-live", LIVE_GCP_PROVIDER, "Live Cloud Storage upload", "Cloud Storage", "cloud-storage-class-a", "cloud-storage-class-b", gcpCollectorUrl, Map.of(), "Live API call", "live-provider-call", isProviderConfigured(LIVE_GCP_PROVIDER), realCloudNote(LIVE_GCP_PROVIDER, "Uploads a tiny object to the configured GCS bucket, then forwards the matching collector payload.")),
                new DemoScenario("azure-blob-live", LIVE_AZURE_PROVIDER, "Live Blob upload", "Blob Storage", "blob-write", "blob-read", azureCollectorUrl, Map.of(), "Live API call", "live-provider-call", isProviderConfigured(LIVE_AZURE_PROVIDER), realCloudNote(LIVE_AZURE_PROVIDER, "Uploads a tiny block blob through the configured SAS URL, then forwards the matching collector payload.")),
                new DemoScenario("openai-live", LIVE_OPENAI_PROVIDER, "Live OpenAI response", "OpenAI", "gpt-4.1-input", "gpt-4.1-output", openAiCollectorUrl, Map.of(), "Live API call", "live-provider-call", isProviderConfigured(LIVE_OPENAI_PROVIDER), realCloudNote(LIVE_OPENAI_PROVIDER, "Calls the OpenAI Responses API with a safe prompt, then forwards the real usage counts through the collector."))
        );
    }

    private Map<String, Object> awsS3Payload(Instant timestamp) {
        return Map.of(
                "batchReference", "poc-aws-s3-" + UUID.randomUUID(),
                "source", "aws.s3",
                "detail-type", "Object Created",
                "time", timestamp.toString(),
                "region", "ap-south-1",
                "account", "demo-aws-account",
                "detail", Map.of("bucket", Map.of("name", "cloudsight-demo"))
        );
    }

    private Map<String, Object> awsLambdaPayload(Instant timestamp) {
        return Map.of("metricType", "lambda-summary", "invocations", 2200000, "gbSeconds", 14400, "timestamp", timestamp.toString(), "regionCode", "ap-south-1");
    }

    private Map<String, Object> awsEc2Payload(Instant timestamp) {
        return Map.of("metricType", "ec2-ebs-summary", "coreHours", 34, "gp3GbMonth", 260, "timestamp", timestamp.toString(), "regionCode", "ap-south-1");
    }

    private Map<String, Object> awsRdsPayload(Instant timestamp) {
        return Map.of("metricType", "rds-summary", "instanceHours", 16, "timestamp", timestamp.toString(), "regionCode", "ap-south-1");
    }

    private Map<String, Object> awsApiGatewayPayload(Instant timestamp) {
        return Map.of("metricType", "api-gateway-summary", "requests", 7600000, "egressGb", 44, "timestamp", timestamp.toString(), "regionCode", "ap-south-1");
    }

    private Map<String, Object> awsCloudFrontPayload(Instant timestamp) {
        return Map.of("metricType", "cloudfront-summary", "requests", 1900000, "egressGb", 28, "timestamp", timestamp.toString(), "regionCode", "ap-south-1");
    }

    private Map<String, Object> awsDynamoPayload(Instant timestamp) {
        return Map.of("metricType", "dynamodb-summary", "readUnits", 2800000, "writeUnits", 780000, "timestamp", timestamp.toString(), "regionCode", "ap-south-1");
    }

    private Map<String, Object> awsQueuePayload(Instant timestamp) {
        return Map.of("metricType", "queueing-summary", "sqsRequests", 2400000, "snsPublishes", 640000, "timestamp", timestamp.toString(), "regionCode", "ap-south-1");
    }

    private Map<String, Object> gcpStoragePayload(Instant timestamp) {
        return Map.of(
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
                "timestamp", timestamp.toString()
        );
    }

    private Map<String, Object> gcpGeminiPayload(Instant timestamp) {
        return Map.of("metricType", "gemini-summary", "model", "gemini-1.5-pro", "inputTokens", 4600, "outputTokens", 1900, "timestamp", timestamp.toString(), "regionCode", "asia-south1");
    }

    private Map<String, Object> gcpVisionPayload(Instant timestamp) {
        return Map.of("metricType", "vision-summary", "objectDetectionMinutes", 240, "searchRequests", 5400, "timestamp", timestamp.toString(), "regionCode", "asia-south1");
    }

    private Map<String, Object> gcpCloudRunPayload(Instant timestamp) {
        return Map.of("metricType", "cloud-run-summary", "requests", 2400000, "vcpuSeconds", 17200, "timestamp", timestamp.toString(), "regionCode", "asia-south1");
    }

    private Map<String, Object> gcpGkePayload(Instant timestamp) {
        return Map.of("metricType", "gke-runtime-summary", "memoryGibSeconds", 38000, "clusterHours", 8, "timestamp", timestamp.toString(), "regionCode", "asia-south1");
    }

    private Map<String, Object> gcpBigQueryPayload(Instant timestamp) {
        return Map.of("metricType", "bigquery-job", "terabytesScanned", 4, "timestamp", timestamp.toString(), "regionCode", "asia-south1");
    }

    private Map<String, Object> gcpPubSubPayload(Instant timestamp) {
        return Map.of("metricType", "pubsub-summary", "messageOperations", 3400000, "classBOperations", 260000, "timestamp", timestamp.toString(), "regionCode", "asia-south1");
    }

    private List<Map<String, Object>> azureBlobPayload(Instant timestamp) {
        return List.of(Map.of(
                "id", UUID.randomUUID().toString(),
                "eventType", "Microsoft.Storage.BlobCreated",
                "eventTime", timestamp.toString(),
                "data", Map.of("api", "centralindia")
        ));
    }

    private Map<String, Object> azureVmPayload(Instant timestamp) {
        return Map.of("metricType", "vm-summary", "coreHours", 24, "memoryGbHours", 96, "timestamp", timestamp.toString(), "regionCode", "centralindia");
    }

    private Map<String, Object> azureFunctionsPayload(Instant timestamp) {
        return Map.of("metricType", "functions-summary", "executions", 1650000, "egressGb", 18, "timestamp", timestamp.toString(), "regionCode", "centralindia");
    }

    private Map<String, Object> azureOpenAiPayload(Instant timestamp) {
        return Map.of("metricType", "azure-openai-summary", "inputTokens", 7200, "outputTokens", 3100, "timestamp", timestamp.toString(), "regionCode", "centralindia");
    }

    private Map<String, Object> azureSqlPayload(Instant timestamp) {
        return Map.of("metricType", "sql-summary", "vcoreHours", 18, "diskGbMonth", 300, "timestamp", timestamp.toString(), "regionCode", "centralindia");
    }

    private Map<String, Object> azureCosmosPayload(Instant timestamp) {
        return Map.of("metricType", "cosmos-summary", "requestUnits", 2200000, "diskGbMonth", 180, "timestamp", timestamp.toString(), "regionCode", "centralindia");
    }

    private Map<String, Object> runAwsLiveS3Call() {
        requireProviderConfigured(LIVE_AWS_PROVIDER);
        Instant now = Instant.now();
        String objectKey = "cloudsight-live/" + now.toEpochMilli() + "-" + UUID.randomUUID() + ".txt";
        String body = "CloudSight live S3 verification " + now;
        String host = liveAwsBucket + ".s3." + liveAwsRegion + ".amazonaws.com";
        String canonicalUri = "/" + uriPathSegment(objectKey);
        String payloadHash = hex(sha256(body.getBytes(StandardCharsets.UTF_8)));
        String amzDate = AWS_TIMESTAMP.format(now);
        String dateStamp = AWS_DATE.format(now);

        LinkedHashMap<String, String> canonicalHeaderMap = new LinkedHashMap<>();
        canonicalHeaderMap.put("host", host);
        canonicalHeaderMap.put("x-amz-content-sha256", payloadHash);
        canonicalHeaderMap.put("x-amz-date", amzDate);
        if (configured(liveAwsSessionToken)) {
            canonicalHeaderMap.put("x-amz-security-token", liveAwsSessionToken);
        }

        String canonicalHeaders = canonicalHeaderMap.entrySet().stream()
                .map(entry -> entry.getKey() + ":" + entry.getValue().trim() + "\n")
                .reduce("", String::concat);
        String signedHeaders = String.join(";", canonicalHeaderMap.keySet());
        String canonicalRequest = "PUT\n" + canonicalUri + "\n\n" + canonicalHeaders + "\n" + signedHeaders + "\n" + payloadHash;
        String scope = dateStamp + "/" + liveAwsRegion + "/s3/aws4_request";
        String stringToSign = "AWS4-HMAC-SHA256\n" + amzDate + "\n" + scope + "\n" + hex(sha256(canonicalRequest.getBytes(StandardCharsets.UTF_8)));
        byte[] signingKey = awsSigningKey(liveAwsSecretAccessKey, dateStamp, liveAwsRegion, "s3");
        String signature = hex(hmacSha256(signingKey, stringToSign));
        String authorization = "AWS4-HMAC-SHA256 Credential=" + liveAwsAccessKeyId + "/" + scope + ", SignedHeaders=" + signedHeaders + ", Signature=" + signature;

        HttpRequest.Builder requestBuilder = HttpRequest.newBuilder()
                .uri(URI.create("https://" + host + canonicalUri))
                .timeout(java.time.Duration.ofMillis(READ_TIMEOUT_MS))
                .header("x-amz-date", amzDate)
                .header("x-amz-content-sha256", payloadHash)
                .header("Authorization", authorization)
                .header("Content-Type", "text/plain; charset=utf-8")
                .PUT(HttpRequest.BodyPublishers.ofString(body));
        if (configured(liveAwsSessionToken)) {
            requestBuilder.header("x-amz-security-token", liveAwsSessionToken);
        }

        HttpResponse<String> response = send(requestBuilder.build(), "aws-live-call");
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("AWS S3 live call failed: " + response.statusCode() + " " + response.body());
        }

        return Map.of(
                "provider", LIVE_AWS_PROVIDER,
                "service", "S3 PutObject",
                "status", "SUCCESS",
                "resource", Map.of("bucket", liveAwsBucket, "key", objectKey, "region", liveAwsRegion),
                "httpStatus", response.statusCode(),
                "collectorPayload", awsS3Payload(now)
        );
    }

    private Map<String, Object> runGcpLiveStorageCall() {
        requireProviderConfigured(LIVE_GCP_PROVIDER);
        Instant now = Instant.now();
        Map<String, Object> serviceAccount = parseJsonMap(resolvedLiveGcpServiceAccountJson());
        String accessToken = gcpAccessToken(serviceAccount);
        String objectName = "cloudsight-live/" + now.toEpochMilli() + "-" + UUID.randomUUID() + ".txt";
        String uploadUrl = "https://storage.googleapis.com/upload/storage/v1/b/" + encodeQuery(liveGcpBucket) + "/o?uploadType=media&name=" + encodeQuery(objectName);
        String body = "CloudSight live GCS verification " + now;

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(uploadUrl))
                .timeout(java.time.Duration.ofMillis(READ_TIMEOUT_MS))
                .header("Authorization", "Bearer " + accessToken)
                .header("Content-Type", "text/plain; charset=utf-8")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        HttpResponse<String> response = send(request, "gcp-live-call");
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("GCP Cloud Storage live call failed: " + response.statusCode() + " " + response.body());
        }

        return Map.of(
                "provider", LIVE_GCP_PROVIDER,
                "service", "Cloud Storage upload",
                "status", "SUCCESS",
                "resource", Map.of("bucket", liveGcpBucket, "object", objectName),
                "httpStatus", response.statusCode(),
                "collectorPayload", gcpStoragePayload(now)
        );
    }

    private Map<String, Object> runAzureLiveBlobCall() {
        requireProviderConfigured(LIVE_AZURE_PROVIDER);
        Instant now = Instant.now();
        String blobName = "cloudsight-live-" + now.toEpochMilli() + "-" + UUID.randomUUID() + ".txt";
        String blobUrl = appendBlobNameToSasUrl(liveAzureBlobContainerSasUrl, blobName);
        String body = "CloudSight live Azure Blob verification " + now;

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(blobUrl))
                .timeout(java.time.Duration.ofMillis(READ_TIMEOUT_MS))
                .header("x-ms-blob-type", "BlockBlob")
                .header("x-ms-version", "2023-11-03")
                .header("Content-Type", "text/plain; charset=utf-8")
                .PUT(HttpRequest.BodyPublishers.ofString(body))
                .build();
        HttpResponse<String> response = send(request, "azure-live-call");
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("Azure Blob live call failed: " + response.statusCode() + " " + response.body());
        }

        return Map.of(
                "provider", LIVE_AZURE_PROVIDER,
                "service", "Blob upload",
                "status", "SUCCESS",
                "resource", Map.of("blobUrl", redactUrl(blobUrl)),
                "httpStatus", response.statusCode(),
                "collectorPayload", azureBlobPayload(now)
        );
    }

    private Map<String, Object> runOpenAiLiveCall() {
        requireProviderConfigured(LIVE_OPENAI_PROVIDER);
        Instant now = Instant.now();
        Map<String, Object> payload = Map.of(
                "model", liveOpenAiModel,
                "input", "Summarize why collector-first multi-cloud cost visibility matters for a modern engineering team in one sentence.",
                "max_output_tokens", 120
        );

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("https://api.openai.com/v1/responses"))
                .timeout(java.time.Duration.ofMillis(READ_TIMEOUT_MS))
                .header("Authorization", "Bearer " + liveOpenAiApiKey)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(writeJson(payload)))
                .build();
        HttpResponse<String> response = send(request, "openai-live-call");
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("OpenAI live call failed: " + response.statusCode() + " " + response.body());
        }
        Map<String, Object> responseMap = parseJsonMap(response.body());
        Map<String, Object> usage = mapValue(responseMap.get("usage"));
        int inputTokens = integerValue(usage.get("input_tokens"));
        int outputTokens = integerValue(usage.get("output_tokens"));
        String model = Objects.toString(responseMap.getOrDefault("model", liveOpenAiModel), liveOpenAiModel);

        return Map.of(
                "provider", LIVE_OPENAI_PROVIDER,
                "service", "Responses API",
                "status", "SUCCESS",
                "resource", Map.of("model", model, "inputTokens", inputTokens, "outputTokens", outputTokens),
                "httpStatus", response.statusCode(),
                "collectorPayload", Map.of(
                        "batchReference", "live-openai-" + UUID.randomUUID(),
                        "records", List.of(Map.of(
                                "model", model,
                                "inputTokens", inputTokens,
                                "outputTokens", outputTokens,
                                "timestamp", now.toString(),
                                "feature", "live-poc"
                        ))
                )
        );
    }

    private boolean isProviderConfigured(String provider) {
        return switch (provider.toUpperCase(Locale.ROOT)) {
            case LIVE_AWS_PROVIDER -> configured(liveAwsAccessKeyId) && configured(liveAwsSecretAccessKey) && configured(liveAwsRegion) && configured(liveAwsBucket);
            case LIVE_GCP_PROVIDER -> gcpServiceAccountConfigured() && configured(liveGcpBucket);
            case LIVE_AZURE_PROVIDER -> configured(liveAzureBlobContainerSasUrl);
            case LIVE_OPENAI_PROVIDER -> configured(liveOpenAiApiKey) && configured(liveOpenAiModel);
            default -> false;
        };
    }

    private boolean gcpServiceAccountConfigured() {
        return configured(liveGcpServiceAccountJson) || configured(liveGcpServiceAccountFile);
    }

    private String gcpCredentialSource() {
        if (configured(liveGcpServiceAccountJson)) {
            return "env";
        }
        if (configured(liveGcpServiceAccountFile)) {
            return "file";
        }
        return "missing";
    }

    private String resolvedLiveGcpServiceAccountJson() {
        if (configured(liveGcpServiceAccountJson)) {
            return liveGcpServiceAccountJson;
        }
        if (!configured(liveGcpServiceAccountFile)) {
            throw new IllegalStateException("GCP service account JSON is not configured");
        }
        try {
            return Files.readString(Path.of(liveGcpServiceAccountFile), StandardCharsets.UTF_8);
        } catch (Exception error) {
            throw new IllegalStateException("Unable to read GCP service account secret file", error);
        }
    }

    private void requireProviderConfigured(String provider) {
        if (!isProviderConfigured(provider)) {
            throw new IllegalStateException(provider + " live credentials are incomplete. Check the setup wizard and required environment variables.");
        }
    }

    private String realCloudNote(String provider, String whenReadyMessage) {
        return isProviderConfigured(provider)
                ? whenReadyMessage
                : "Live credentials are not configured yet. Use the setup wizard below to enable this provider.";
    }

    private Map<String, Object> liveSetupView(String provider, String selectedService, List<Map<String, Object>> requirements, List<String> steps, Map<String, Object> resources) {
        List<String> missing = requirements.stream()
                .filter(item -> !Boolean.TRUE.equals(item.get("configured")))
                .map(item -> String.valueOf(item.get("env")))
                .toList();
        return Map.of(
                "provider", provider,
                "selectedService", selectedService,
                "configured", missing.isEmpty(),
                "missing", missing,
                "requirements", requirements,
                "steps", steps,
                "resources", resources
        );
    }

    private Map<String, Object> envRequirement(String env, boolean configured, String description) {
        return Map.of("env", env, "configured", configured, "description", description);
    }

    private Map<String, Object> liveResourceSummary(String key1, String value1) {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put(key1, configured(value1) ? value1 : "Missing");
        return summary;
    }

    private Map<String, Object> liveResourceSummary(String key1, String value1, String key2, String value2) {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put(key1, configured(value1) ? value1 : "Missing");
        summary.put(key2, configured(value2) ? value2 : "Missing");
        return summary;
    }

    private Map<String, Object> catalogView(String provider, List<Map<String, Object>> families) {
        return Map.of("provider", provider, "serviceFamilies", families);
    }

    private Map<String, Object> catalogFamily(String name, String status, boolean selectedLiveCall, boolean writeVerified) {
        return Map.of(
                "name", name,
                "status", status,
                "selectedLiveCall", selectedLiveCall,
                "writeVerified", writeVerified
        );
    }

    private HttpResponse<String> send(HttpRequest request, String integrationOption) {
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            record(integrationOption, request.method(), request.uri().toString(), Map.of("Authorization", redactAuthorization(request), "Content-Type", headerValue(request, "Content-Type")), Map.of(), response.statusCode(), truncate(response.body()));
            return response;
        } catch (Exception error) {
            record(integrationOption, request.method(), request.uri().toString(), Map.of("Authorization", redactAuthorization(request), "Content-Type", headerValue(request, "Content-Type")), Map.of(), 0, Map.of("error", error.getMessage()));
            throw new IllegalStateException("Live provider call failed: " + error.getMessage(), error);
        }
    }

    private String redactAuthorization(HttpRequest request) {
        return request.headers().firstValue("Authorization").map(value -> value.startsWith("Bearer ") ? "Bearer REDACTED" : "REDACTED").orElse("");
    }

    private String headerValue(HttpRequest request, String key) {
        return request.headers().firstValue(key).orElse("");
    }

    private Object truncate(String value) {
        if (value == null) {
            return "";
        }
        return value.length() > 500 ? value.substring(0, 500) + "…" : value;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseJsonMap(String json) {
        try {
            return objectMapper.readValue(json, Map.class);
        } catch (Exception error) {
            throw new IllegalStateException("Unable to parse JSON payload", error);
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception error) {
            throw new IllegalStateException("Unable to serialize JSON payload", error);
        }
    }

    private String gcpAccessToken(Map<String, Object> serviceAccount) {
        String tokenUri = Objects.toString(serviceAccount.getOrDefault("token_uri", "https://oauth2.googleapis.com/token"));
        String clientEmail = Objects.toString(serviceAccount.get("client_email"), "");
        String privateKeyPem = Objects.toString(serviceAccount.get("private_key"), "");
        if (!configured(clientEmail) || !configured(privateKeyPem)) {
            throw new IllegalStateException("GCP service account JSON is missing client_email or private_key");
        }
        long now = Instant.now().getEpochSecond();
        Map<String, Object> header = Map.of("alg", "RS256", "typ", "JWT");
        Map<String, Object> claim = Map.of(
                "iss", clientEmail,
                "scope", "https://www.googleapis.com/auth/devstorage.read_write",
                "aud", tokenUri,
                "iat", now,
                "exp", now + 3600
        );
        String assertion = base64Url(writeJson(header)) + "." + base64Url(writeJson(claim));
        String jwt = assertion + "." + base64Url(signRs256(assertion, privateKeyPem));

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        String body = "grant_type=" + encodeQuery("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + encodeQuery(jwt);
        HttpEntity<String> entity = new HttpEntity<>(body, headers);
        ResponseEntity<Map> response = restTemplate.exchange(tokenUri, HttpMethod.POST, entity, Map.class);
        Map<String, Object> payload = response.getBody();
        return Objects.toString(payload == null ? "" : payload.get("access_token"), "");
    }

    private byte[] signRs256(String data, String privateKeyPem) {
        try {
            Signature signature = Signature.getInstance("SHA256withRSA");
            signature.initSign(loadPrivateKey(privateKeyPem));
            signature.update(data.getBytes(StandardCharsets.UTF_8));
            return signature.sign();
        } catch (Exception error) {
            throw new IllegalStateException("Unable to sign RSA payload", error);
        }
    }

    private PrivateKey loadPrivateKey(String pem) {
        try {
            String sanitized = pem
                    .replace("-----BEGIN PRIVATE KEY-----", "")
                    .replace("-----END PRIVATE KEY-----", "")
                    .replace("\\n", "")
                    .replace("\n", "")
                    .replace("\r", "");
            byte[] decoded = Base64.getDecoder().decode(sanitized);
            return KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(decoded));
        } catch (Exception error) {
            throw new IllegalStateException("Unable to load RSA private key", error);
        }
    }

    private byte[] awsSigningKey(String secret, String dateStamp, String region, String service) {
        byte[] kDate = hmacSha256(("AWS4" + secret).getBytes(StandardCharsets.UTF_8), dateStamp);
        byte[] kRegion = hmacSha256(kDate, region);
        byte[] kService = hmacSha256(kRegion, service);
        return hmacSha256(kService, "aws4_request");
    }

    private byte[] hmacSha256(byte[] key, String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(value.getBytes(StandardCharsets.UTF_8));
        } catch (Exception error) {
            throw new IllegalStateException("Unable to calculate HMAC", error);
        }
    }

    private byte[] sha256(byte[] value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value);
        } catch (Exception error) {
            throw new IllegalStateException("Unable to calculate SHA-256", error);
        }
    }

    private String hex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) {
            builder.append(String.format("%02x", value));
        }
        return builder.toString();
    }

    private String base64Url(String value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private String base64Url(byte[] value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    private String encodeQuery(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private String uriPathSegment(String value) {
        return value.split("/")
                .length == 0 ? encodeQuery(value) : String.join("/", java.util.Arrays.stream(value.split("/"))
                        .map(this::encodeQuery)
                        .toList());
    }

    private String appendBlobNameToSasUrl(String containerSasUrl, String blobName) {
        String[] parts = containerSasUrl.split("\\?", 2);
        String base = parts[0].replaceAll("/$", "");
        return base + "/" + encodeQuery(blobName) + (parts.length > 1 ? "?" + parts[1] : "");
    }

    private String redactUrl(String url) {
        int queryIndex = url.indexOf('?');
        return queryIndex > 0 ? url.substring(0, queryIndex) + "?REDACTED" : url;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> mapValue(Object value) {
        return value instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of();
    }

    private int integerValue(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value == null) {
            return 0;
        }
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    private boolean configured(String value) {
        return value != null && !value.isBlank();
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

    private record DemoScenario(
            String id,
            String provider,
            String title,
            String serviceFamily,
            String primaryEndpoint,
            String secondaryEndpoint,
            String collectorUrl,
            Object payload,
            String signalType,
            String executionMode,
            boolean realCloudReady,
            String realCloudNote
    ) {}

    private record Session(String token, String apiKey) {}
}
