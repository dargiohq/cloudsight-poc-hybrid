# CloudSight POC Hybrid

Public demo URL:

- `https://cloudsight-poc-hybrid.onrender.com`

Purpose:

- demonstrate the recommended `hybrid` integration path
- authenticate to CloudSight
- ensure provider connections exist
- send normalized usage events
- send provider-native payloads to the deployed AWS, GCP, Azure, and OpenAI collector services
- read dashboard, usage, and report data back from CloudSight

Key endpoints:

- `/`
- `/health`
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
5. `POST /api/usage` as the optional fallback path
6. `GET /api/dashboard/overview`
7. `GET /api/usage/summary`
8. `GET /api/reports/statement`
