# CloudSight POC Hybrid

Public demo URL:

- `https://cloudsight-poc-hybrid.onrender.com`

Purpose:

- demonstrate the recommended `hybrid` integration path
- provide a premium demo console at `/console.html`
- authenticate to CloudSight
- ensure provider connections exist
- send provider-native payloads to the deployed AWS, GCP, Azure, and OpenAI collector services
- manually verify matching CloudSight entries
- read dashboard, usage, connection, and report data back from CloudSight

Key endpoints:

- `/`
- `/console.html`
- `/api/info`
- `/health`
- `/demo/overview`
- `/demo/scenarios`
- `/demo/scenarios/{id}/run`
- `/demo/contract`
- `/demo/bootstrap`
- `/demo/bootstrap/realtime`
- `/demo/audit`

CloudSight target:

- `https://dargio-cloudsight-backend.onrender.com`

This app demonstrates the end-to-end sequence:

1. `POST /auth/login`
2. `GET /api/connections`
3. `POST /api/connections` when needed
4. `POST` provider-native payloads to the deployed collector services
5. `GET /api/usage/logs` to verify matching entries
6. `POST /api/usage` as the optional fallback path
7. `GET /api/dashboard/overview`
8. `GET /api/usage/summary`
9. `GET /api/reports/statement`

Important note:

- the premium console proves the collector-first architecture using safe provider-native signals through live collectors
- it does not claim that every service in every cloud can be live-called without real cloud credentials and real cloud resources
- `live provider calls` remain an optional extension path when explicit cloud credentials and customer-owned resources are configured
