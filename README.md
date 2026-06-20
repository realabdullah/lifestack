# Lifestack

A self-hosted, containerized personal metrics aggregator ("Digital Life Quantifier") that pulls data from third-party APIs (GitHub, WakaTime, Spotify) and exports them in Prometheus format.

## Architecture

- **Custom Node.js Exporter**: Collects personal metrics, utilizes background timers to cache responses, respects rate limits, and exports Prometheus-compliant metrics on `/metrics`.
- **Prometheus**: Periodically scrapes the custom exporter metrics.
- **Loki & Promtail**: Collects container JSON logs (errors, info) for debugging.
- **Grafana**: Dashboard interface to visualize the metrics and query Loki logs.

## Setup & Running

### 1. Configure Credentials
Copy `.env.example` to `.env` and fill out your tokens:
```bash
cp .env.example .env
```

| Environment Variable | Description |
|---|---|
| `GITHUB_USERNAME` | Your GitHub user handle. |
| `GITHUB_TOKEN` | Personal Access Token with read scopes. |
| `WAKATIME_USERNAME` | Your WakaTime user handle. |
| `WAKATIME_API_KEY` | Raw WakaTime API key (will be automatically Basic-Auth base64 encoded). |
| `SPOTIFY_CLIENT_ID` | Spotify developer application Client ID. |
| `SPOTIFY_CLIENT_SECRET` | Spotify developer application Client Secret. |
| `SPOTIFY_REFRESH_TOKEN` | Refresh token generated for user scope authentication. |

### 2. Start the Stack (Using Docker)
Spin up the entire stack using Docker Compose:
```bash
docker compose up -d --build
```

### 3. Running Locally (Without Docker)
To run only the custom Node.js exporter locally:
```bash
# Install dependencies
pnpm install

# Start the application
pnpm start
```

### 4. Ports & Dashboards

- **Prometheus**: [http://localhost:9090](http://localhost:9090)
- **Exporter `/metrics`**: [http://localhost:3000/metrics](http://localhost:3000/metrics)
- **Grafana**: [http://localhost:3001](http://localhost:3001) (Credentials: `admin` / `admin`)

## Deployment (via Dokploy)

Since the stack is fully containerized with `docker-compose.yml`, you can deploy it seamlessly to your VPS using **Dokploy**:

1. **Commit & Push to Git**:
   Push this project folder to your private GitHub repository (do not commit your `.env` file).
2. **Create Compose App**:
   - Open your Dokploy dashboard.
   - Go to **Applications** -> **Create Application** -> Select **Compose**.
   - Point it to your GitHub repository and branch.
3. **Configure Environments**:
   - Under the **Environment** tab in Dokploy, add all the variables from your `.env` file (e.g., `GITHUB_TOKEN`, `SPOTIFY_CLIENT_ID`, etc.).
4. **Deploy**:
   - Click **Deploy** inside Dokploy. Dokploy will read `docker-compose.yml`, pull/build the containers, and run the entire stack.
5. **Configure Domain/SSL**:
   - Point your custom domains (e.g. `lifestack.yourdomain.com` or `grafana.yourdomain.com`) to port `3001` (Grafana) or port `3000` (Exporter) in the Dokploy settings tab.
