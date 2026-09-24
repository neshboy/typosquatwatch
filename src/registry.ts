import type { RegistryEvidence } from "./types.js";

const DEFAULT_TIMEOUT_MS = 8000;
const NPM_REGISTRY_BASE = "https://registry.npmjs.org";
const NPM_DOWNLOADS_BASE = "https://api.npmjs.org/downloads/point/last-week";
const PYPI_BASE = "https://pypi.org/pypi";
const PYPI_STATS_BASE = "https://pypistats.org/api/packages";

interface FetchJsonResult {
  status: number;
  json: unknown | null;
  networkError?: string;
}

/** Encodes a package name for use as a URL path segment, preserving scoped-package slashes. */
function encodePathSegments(name: string): string {
  return name.split("/").map(encodeURIComponent).join("/");
}

async function fetchJson(url: string, timeoutMs: number): Promise<FetchJsonResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json", "user-agent": "typosquatwatch-cli" },
    });
    if (res.status === 404) {
      return { status: 404, json: null };
    }
    if (!res.ok) {
      return { status: res.status, json: null };
    }
    const json = await res.json();
    return { status: res.status, json };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 0, json: null, networkError: message };
  } finally {
    clearTimeout(timer);
  }
}

function daysSince(isoDate: string): number {
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return NaN;
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

/**
 * Fetches real metadata + weekly-download evidence for an npm package from the public
 * npm registry (registry.npmjs.org) and download-counts API (api.npmjs.org). Never throws;
 * network failures are reported via `evidence.error` so the caller can degrade gracefully.
 */
export async function getNpmEvidence(
  name: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<RegistryEvidence> {
  const encoded = encodePathSegments(name);
  const [metaResult, downloadsResult] = await Promise.all([
    fetchJson(`${NPM_REGISTRY_BASE}/${encoded}`, timeoutMs),
    fetchJson(`${NPM_DOWNLOADS_BASE}/${encoded}`, timeoutMs),
  ]);

  if (metaResult.networkError) {
    return { ecosystem: "npm", name, found: false, error: metaResult.networkError };
  }

  if (metaResult.status === 404) {
    return { ecosystem: "npm", name, found: false };
  }

  const meta = metaResult.json as {
    time?: Record<string, string>;
    versions?: Record<string, unknown>;
    "dist-tags"?: Record<string, string>;
  } | null;

  if (!meta) {
    return { ecosystem: "npm", name, found: false, error: "empty registry response" };
  }

  const firstPublished = meta.time?.created;
  const versionCount = meta.versions ? Object.keys(meta.versions).length : undefined;
  const latestVersion = meta["dist-tags"]?.latest;

  let weeklyDownloads: number | undefined;
  if (!downloadsResult.networkError && downloadsResult.status === 200) {
    const dl = downloadsResult.json as { downloads?: number } | null;
    weeklyDownloads = typeof dl?.downloads === "number" ? dl.downloads : 0;
  } else if (downloadsResult.status === 404) {
    // No download stats at all (e.g. brand-new package) — treat as zero, not unknown.
    weeklyDownloads = 0;
  }

  return {
    ecosystem: "npm",
    name,
    found: true,
    firstPublished,
    ageInDays: firstPublished ? daysSince(firstPublished) : undefined,
    versionCount,
    weeklyDownloads,
    latestVersion,
  };
}

/**
 * Fetches real metadata from PyPI's JSON API and (best-effort) recent download counts
 * from pypistats.org. Never throws; failures are reported via `evidence.error`.
 */
export async function getPyPIEvidence(
  name: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<RegistryEvidence> {
  const encoded = encodeURIComponent(name);
  const [metaResult, statsResult] = await Promise.all([
    fetchJson(`${PYPI_BASE}/${encoded}/json`, timeoutMs),
    fetchJson(`${PYPI_STATS_BASE}/${encoded}/recent`, timeoutMs),
  ]);

  if (metaResult.networkError) {
    return { ecosystem: "pypi", name, found: false, error: metaResult.networkError };
  }

  if (metaResult.status === 404) {
    return { ecosystem: "pypi", name, found: false };
  }

  const meta = metaResult.json as {
    info?: { version?: string };
    releases?: Record<string, Array<{ upload_time_iso_8601?: string }>>;
  } | null;

  if (!meta) {
    return { ecosystem: "pypi", name, found: false, error: "empty registry response" };
  }

  let firstPublished: string | undefined;
  const releases = meta.releases ?? {};
  const versionCount = Object.keys(releases).length;
  for (const files of Object.values(releases)) {
    for (const file of files) {
      if (!file.upload_time_iso_8601) continue;
      if (!firstPublished || file.upload_time_iso_8601 < firstPublished) {
        firstPublished = file.upload_time_iso_8601;
      }
    }
  }

  let weeklyDownloads: number | undefined;
  if (!statsResult.networkError && statsResult.status === 200) {
    const stats = statsResult.json as { data?: { last_week?: number } } | null;
    weeklyDownloads = typeof stats?.data?.last_week === "number" ? stats.data.last_week : undefined;
  }

  return {
    ecosystem: "pypi",
    name,
    found: true,
    firstPublished,
    ageInDays: firstPublished ? daysSince(firstPublished) : undefined,
    versionCount,
    weeklyDownloads,
    latestVersion: meta.info?.version,
  };
}
