// NWS explicitly requires a descriptive User-Agent identifying the calling application.
const USER_AGENT = '(field-operations-risk-briefing Apify actor, field-ops-admin@example.com)';

const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 15_000;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** api.weather.gov has no documented SLA and is known to slow down or 5xx under load; retries and a per-attempt timeout keep one bad request from failing (or hanging) the whole run. */
async function fetchJson(url) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        let res;
        try {
            res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/geo+json' }, signal: controller.signal });
        } catch (err) {
            lastError = err.name === 'AbortError' ? new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`) : err;
            if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1));
            continue;
        } finally {
            clearTimeout(timeoutId);
        }
        if (res.ok) return res.json();
        if (!TRANSIENT_STATUSES.has(res.status)) {
            throw new Error(`Request failed: ${url} (${res.status})`);
        }
        lastError = new Error(`Request failed: ${url} (${res.status})`);
        if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1));
    }
    throw lastError;
}

export async function getLocationWeather({ latitude, longitude }, forecastPeriods) {
    const point = await fetchJson(`https://api.weather.gov/points/${latitude},${longitude}`);
    const props = point.properties;

    const forecast = await fetchJson(props.forecast);
    const alerts = await fetchJson(`https://api.weather.gov/alerts/active?point=${latitude},${longitude}`);

    const periods = forecast.properties.periods.slice(0, forecastPeriods).map((p) => ({
        name: p.name,
        startTime: p.startTime,
        endTime: p.endTime,
        temperature: p.temperature,
        temperatureUnit: p.temperatureUnit,
        precipitationProbability: p.probabilityOfPrecipitation?.value ?? null,
        windSpeed: p.windSpeed,
        windDirection: p.windDirection,
        shortForecast: p.shortForecast,
        detailedForecast: p.detailedForecast,
    }));

    const activeAlerts = alerts.features.map((f) => ({
        event: f.properties.event,
        severity: f.properties.severity,
        headline: f.properties.headline,
        effective: f.properties.effective,
        expires: f.properties.expires,
    }));

    return {
        city: props.relativeLocation?.properties?.city ?? null,
        state: props.relativeLocation?.properties?.state ?? null,
        timeZone: props.timeZone ?? null,
        forecastPeriods: periods,
        activeAlerts,
    };
}
