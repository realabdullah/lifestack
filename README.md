# Lifestack

A custom personal metrics aggregator ("Digital Life Quantifier") that pulls data from third-party APIs (GitHub, WakaTime, Spotify) and exports them in Prometheus format.

## Architecture (100% Cloud-Hosted & Free)

- **Node.js Exporter**: Deployed on a free container service (e.g. Render, Koyeb). It queries third-party APIs asynchronously on background intervals and exposes a `/metrics` route secured by Bearer Token authorization.
- **Grafana Cloud**: A free hosted Prometheus instance pulls metrics from your cloud exporter and displays them on hosted dashboards. No local databases or local servers are required!

## Deployment Setup

### 1. Deploy the Exporter to the Cloud (Render / Koyeb)
1. Push this project folder to your private GitHub repository (exclude `.env` using `.gitignore`).
2. Register for a free account at [Render](https://render.com) or [Koyeb](https://www.koyeb.com).
3. Create a new **Web Service** and connect it to your GitHub repository.
4. Set the following environment variables in your deployment dashboard:
   - `EXPORTER_API_KEY`: A secure key you generate to protect your metrics endpoint (e.g., `my-super-secret-token`).
   - `GITHUB_USERNAME` / `GITHUB_TOKEN`
   - `WAKATIME_USERNAME` / `WAKATIME_API_KEY`
   - `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` / `SPOTIFY_REFRESH_TOKEN`
5. Once deployed, note down your public URL (e.g., `https://lifestack-exporter.onrender.com`).

### 2. Configure Grafana Cloud (Free)
1. Register for a free account at [Grafana Cloud](https://grafana.com/products/grafana-cloud/).
2. From your Grafana Cloud dashboard, navigate to **Connections** -> **Add connection**.
3. Search for and select the **Metrics Endpoint** integration.
4. Configure a new Scrape Job:
   - **Job Name**: `lifestack-exporter`
   - **URL**: `https://your-app-url.onrender.com/metrics`
   - **Scrape Interval**: `60s` (or your preference)
   - **Authentication**: Select **Bearer Token** and enter the secret key you set in `EXPORTER_API_KEY`.
5. Save the integration. Grafana Cloud will now pull your digital metrics from the exporter on Render/Koyeb and store them securely in the cloud!

---

## Local Development
To run and test the exporter locally on your machine:
```bash
# Install dependencies
pnpm install

# Setup local credentials
cp .env.example .env
# Fill in your tokens inside .env

# Run the exporter
pnpm start
```
The exporter will be active at `http://localhost:3000/metrics`.
