#!/usr/bin/env node

const config = {
  baseUrl: "https://assessment.ksensetech.com/api",
  apiKey: process.env.API_KEY,
  limit: 20,
  maxRetries: 8,
  timeoutMs: 15000,
  maxPages: 50,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withJitter(ms) {
  return ms + Math.floor(Math.random() * 250);
}

function getRetryDelayMs(response, attempt) {
  const retryAfter = response?.headers?.get?.("retry-after");

  if (retryAfter) {
    const seconds = Number.parseInt(retryAfter, 10);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
  }

  const baseDelay = 500 * 2 ** (attempt - 1);
  return Math.min(withJitter(baseDelay), 10000);
}

function isRetriableStatus(status) {
  return status === 429 || status === 500 || status === 503;
}

function normalizePagePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return {
      patients: [],
      total: 0,
      limit: config.limit,
      hasNext: false,
    };
  }

  const patients = Array.isArray(payload.data) ? payload.data : [];
  const pagination = payload.pagination || {};

  return {
    patients,
    total: numericOrNull(pagination.total) ?? 0,
    limit: numericOrNull(pagination.limit) ?? config.limit,
    hasNext: Boolean(pagination.hasNext),
  };
}

function numericOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dedupePatients(patients) {
  const seen = new Set();
  const results = [];

  for (const patient of patients) {
    const id = patient?.patient_id ?? null;
    const key = id !== null ? `id:${id}` : JSON.stringify(patient);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    results.push(patient);
  }

  return results;
}

async function fetchJson(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const body = isJson ? await response.json() : await response.text();

    return { response, body };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Use this to request each paginated patient batch and recover from temporary API failures.
async function fetchPatientsPage(config, page) {
  const url = `${config.baseUrl.replace(/\/+$/, "")}/patients?page=${page}&limit=${config.limit}`;

  for (let attempt = 1; attempt <= config.maxRetries; attempt += 1) {
    try {
      const { response, body } = await fetchJson(
        url,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "x-api-key": config.apiKey,
          },
        },
        config.timeoutMs,
      );

      if (!response.ok) {
        if (isRetriableStatus(response.status) && attempt < config.maxRetries) {
          const delayMs = getRetryDelayMs(response, attempt);
          console.error(
            `Page ${page} returned ${response.status}. Retrying in ${delayMs}ms (attempt ${attempt}/${config.maxRetries}).`,
          );
          await sleep(delayMs);
          continue;
        }

        throw new Error(
          `Request failed for page ${page} with status ${response.status}: ${stringifyBody(body)}`,
        );
      }

      return normalizePagePayload(body);
    } catch (error) {
      const retriableNetworkError =
        error?.name === "AbortError" ||
        error?.name === "TypeError" ||
        /fetch failed/i.test(String(error?.message || ""));

      if (retriableNetworkError && attempt < config.maxRetries) {
        const delayMs = Math.min(withJitter(500 * 2 ** (attempt - 1)), 10000);
        console.error(
          `Page ${page} failed with ${error.name || "Error"}. Retrying in ${delayMs}ms (attempt ${attempt}/${config.maxRetries}).`,
        );
        await sleep(delayMs);
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Exhausted retries for page ${page}.`);
}

function stringifyBody(body) {
  if (typeof body === "string") {
    return body;
  }

  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

function shouldStopPagination(currentPage, normalized, uniqueCount) {
  if (normalized.total !== null && uniqueCount >= normalized.total) {
    return true;
  }

  if (normalized.patients.length === 0) {
    return true;
  }

  if (
    normalized.limit !== null &&
    normalized.patients.length < normalized.limit
  ) {
    return true;
  }

  if (!normalized.hasNext) {
    return true;
  }

  return false;
}

async function fetchAllPatients(config) {
  const allPatients = [];

  for (let page = 1; page <= config.maxPages; page++) {
    const normalized = await fetchPatientsPage(config, page);
    const beforeCount = allPatients.length;

    allPatients.push(...normalized.patients);

    const deduped = dedupePatients(allPatients);
    allPatients.length = 0;
    allPatients.push(...deduped);

    console.error(
      `Fetched page ${page}: received ${normalized.patients.length}, total unique patients ${allPatients.length}.`,
    );

    if (shouldStopPagination(page, normalized, allPatients.length)) {
      return allPatients;
    }

    if (
      allPatients.length === beforeCount &&
      normalized.patients.length > 0 &&
      !normalized.hasNext
    ) {
      console.error(
        `Page ${page} added no new unique records and pagination indicates no next page. Stopping.`,
      );
      return allPatients;
    }
  }

  throw new Error(
    `Reached DEMOMED_MAX_PAGES (${config.maxPages}) before pagination terminated.`,
  );
}

async function main() {
  const patients = await fetchAllPatients(config);

  process.stdout.write(
    `${JSON.stringify(
      {
        totalPatients: patients.length,
        patients,
      },
      null,
      2,
    )}\n`,
  );
}

module.exports = {
  config,
  fetchAllPatients,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
