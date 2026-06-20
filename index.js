// @ts-nocheck
import 'dotenv/config';
import axios from "axios";
import express from "express";
import pino from "pino";
import client from "prom-client";

// Initialize structured JSON logging via Pino
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
});

const app = express();
const PORT = process.env.PORT || 3000;

// Create a Registry to register metrics
const register = new client.Registry();

// Enable default metrics collection (e.g. process CPU, memory usage)
client.collectDefaultMetrics({ register });

// --- Define Prometheus Metrics ---

const githubCommitsGauge = new client.Gauge({
  name: "github_daily_commits_total",
  help: "Total number of GitHub commits made today",
  registers: [register],
});

const wakatimeSecondsGauge = new client.Gauge({
  name: "wakatime_coding_seconds_total",
  help: "Total coding time recorded on WakaTime in seconds, labeled by language",
  labelNames: ["language"],
  registers: [register],
});

const spotifyPlayingGauge = new client.Gauge({
  name: "spotify_playing_status",
  help: "Spotify playing status: 1 if playing, 0 if paused/inactive",
  labelNames: ["artist", "track"],
  registers: [register],
});

const apiFetchErrorsCounter = new client.Counter({
  name: "api_fetch_errors_total",
  help: "Total number of API fetch errors, labeled by service",
  labelNames: ["service"],
  registers: [register],
});

// --- API Fetching and Caching Logic ---
// We use background intervals to fetch data asynchronously. This decouples Prometheus scrapes
// (which are frequent) from the rate-limited third-party APIs. If a fetch fails, we retain
// the last successfully loaded metric values and increment the error counter.

// Environment Configuration
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const WAKATIME_USERNAME = process.env.WAKATIME_USERNAME;
const WAKATIME_API_KEY = process.env.WAKATIME_API_KEY;

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN;

const POLL_INTERVAL_GITHUB =
  parseInt(process.env.POLL_INTERVAL_GITHUB_MS, 10) || 300000; // 5 min
const POLL_INTERVAL_WAKATIME =
  parseInt(process.env.POLL_INTERVAL_WAKATIME_MS, 10) || 300000; // 5 min
const POLL_INTERVAL_SPOTIFY =
  parseInt(process.env.POLL_INTERVAL_SPOTIFY_MS, 10) || 30000; // 30 sec

// 1. GitHub API Fetching
async function fetchGitHubMetrics() {
  if (!GITHUB_TOKEN) {
    logger.warn(
      "GITHUB_TOKEN not configured. Skipping GitHub metrics fetch (serving mock value).",
    );
    githubCommitsGauge.set(5); // Mock fallback value
    return;
  }

  try {
    const today = new Date().toISOString().split("T")[0];
    // Querying GitHub Search API for user commits today
    const response = await axios.get("https://api.github.com/search/commits", {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.cloak-preview+json",
        "User-Agent": "lifestack-exporter",
      },
      params: {
        q: `author:${GITHUB_USERNAME} committer-date:>=${today}`,
      },
      timeout: 10000,
    });

    const commitCount = response.data.total_count || 0;
    githubCommitsGauge.set(commitCount);
    logger.info({ commitCount }, "Successfully fetched GitHub metrics");
  } catch (error) {
    apiFetchErrorsCounter.inc({ service: "github" });
    logger.error({ err: error.message }, "Failed to fetch GitHub metrics");
  }
}

// 2. WakaTime API Fetching
async function fetchWakaTimeMetrics() {
  if (!WAKATIME_API_KEY) {
    logger.warn(
      "WAKATIME_API_KEY not configured. Skipping WakaTime metrics fetch (serving mock value).",
    );
    wakatimeSecondsGauge.set({ language: "javascript" }, 3600);
    wakatimeSecondsGauge.set({ language: "python" }, 1800);
    return;
  }

  try {
    const authHeader = `Basic ${Buffer.from(WAKATIME_API_KEY).toString("base64")}`;
    // Fetch stats for today / last 24 hrs
    const response = await axios.get(
      `https://wakatime.com/api/v1/users/${WAKATIME_USERNAME}/stats/last_7_days`,
      {
        headers: {
          Authorization: authHeader,
        },
        timeout: 10000,
      },
    );

    const languages = response.data.data?.languages || [];
    // Reset gauge labels to clean up old values
    wakatimeSecondsGauge.reset();

    for (const lang of languages) {
      wakatimeSecondsGauge.set(
        { language: lang.name.toLowerCase() },
        lang.total_seconds,
      );
    }
    logger.info("Successfully fetched WakaTime metrics");
  } catch (error) {
    apiFetchErrorsCounter.inc({ service: "wakatime" });
    logger.error({ err: error.message }, "Failed to fetch WakaTime metrics");
  }
}

// 3. Spotify API Fetching
async function fetchSpotifyMetrics() {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) {
    logger.warn(
      "Spotify credentials not fully configured. Skipping Spotify metrics fetch (serving mock value).",
    );
    spotifyPlayingGauge.set({ artist: "Mock Artist", track: "Mock Track" }, 1);
    return;
  }

  try {
    // A. Exchange Refresh Token for Access Token
    const tokenResponse = await axios.post(
      "https://accounts.spotify.com/api/token",
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: SPOTIFY_REFRESH_TOKEN,
      }).toString(),
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 5000,
      },
    );

    const accessToken = tokenResponse.data.access_token;

    // B. Get Currently Playing Track
    const playerResponse = await axios.get(
      "https://api.spotify.com/v1/me/player/currently-playing",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        timeout: 5000,
      },
    );

    // Reset gauge before setting to avoid accumulating old track labels indefinitely
    spotifyPlayingGauge.reset();

    if (
      playerResponse.status === 200 &&
      playerResponse.data &&
      playerResponse.data.is_playing
    ) {
      const track = playerResponse.data.item;
      const trackName = track ? track.name : "Unknown Track";
      const artists = track
        ? track.artists.map((a) => a.name).join(", ")
        : "Unknown Artist";

      spotifyPlayingGauge.set({ artist: artists, track: trackName }, 1);
      logger.info(
        { artist: artists, track: trackName },
        "Spotify is actively playing a track",
      );
    } else {
      // 0 represents paused or inactive
      spotifyPlayingGauge.set({ artist: "None", track: "None" }, 0);
      logger.info("Spotify is currently paused or inactive");
    }
  } catch (error) {
    apiFetchErrorsCounter.inc({ service: "spotify" });
    logger.error({ err: error.message }, "Failed to fetch Spotify metrics");
  }
}

// --- Background Polling Init ---

function startBackgroundPolling() {
  logger.info("Starting background metric polling loops...");

  // Initial executions
  fetchGitHubMetrics();
  fetchWakaTimeMetrics();
  fetchSpotifyMetrics();

  // Intervals
  setInterval(fetchGitHubMetrics, POLL_INTERVAL_GITHUB);
  setInterval(fetchWakaTimeMetrics, POLL_INTERVAL_WAKATIME);
  setInterval(fetchSpotifyMetrics, POLL_INTERVAL_SPOTIFY);
}

// Start polling loops
startBackgroundPolling();

// --- HTTP Routes ---

// The metrics endpoint for Prometheus scraping
app.get("/metrics", async (req, res) => {
  try {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    logger.error({ err: error.message }, "Error generating Prometheus metrics");
    res.status(500).end(error);
  }
});

// A basic health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", uptime: process.uptime() });
});

// Start Express Server
app.listen(PORT, () => {
  logger.info(`Lifestack Exporter listening on port ${PORT}`);
});
