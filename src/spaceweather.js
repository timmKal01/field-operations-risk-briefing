const USER_AGENT = 'FieldOperationsRiskBriefing/0.1 (+contact: field-ops-admin@example.com)';

const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 15_000;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** services.swpc.noaa.gov has no documented SLA; retries and a per-attempt timeout keep one bad request from failing (or hanging) the whole run. */
async function fetchJson(url) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        let res;
        try {
            res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: controller.signal });
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

async function fetchLatestKp() {
    const rows = await fetchJson('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json');
    const latest = rows.at(-1);
    return { value: latest.Kp, timeTag: latest.time_tag };
}

/** The 0.1-0.8nm (long) channel is GOES's standard band for flare classification. */
async function fetchLatestXrayFlux() {
    const rows = await fetchJson('https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json');
    const longChannel = rows.filter((r) => r.energy === '0.1-0.8nm');
    const latest = longChannel.at(-1);
    if (!latest) return null;
    return { flux: latest.flux, timeTag: latest.time_tag };
}

/** NOAA's published R-scale (radio blackout), keyed off GOES long-channel X-ray flux. */
function classifyRScale(flux) {
    if (flux == null) return { rScale: null, description: 'No X-ray flux data available' };
    if (flux >= 2e-3) return { rScale: 'R5', description: 'Extreme radio blackout' };
    if (flux >= 1e-3) return { rScale: 'R4', description: 'Severe radio blackout' };
    if (flux >= 1e-4) return { rScale: 'R3', description: 'Strong radio blackout' };
    if (flux >= 4e-5) return { rScale: 'R2', description: 'Moderate radio blackout' };
    if (flux >= 1e-5) return { rScale: 'R1', description: 'Minor radio blackout' };
    return { rScale: 'R0', description: 'No radio blackout' };
}

/** Approximate lowest geomagnetic latitude (degrees) aurora is typically visible at, by Kp. */
const AURORA_VIEWLINE_LATITUDE = [66.5, 64.5, 62.4, 60.4, 58.3, 56.3, 54.2, 52.2, 50.1, 48.1];

function auroraVisibleLatitude(kp) {
    if (kp == null) return null;
    const rounded = Math.max(0, Math.min(9, Math.round(kp)));
    return AURORA_VIEWLINE_LATITUDE[rounded];
}

/**
 * One shared space-weather snapshot for the whole run — unlike NWS weather, this isn't
 * per-location, so callers should fetch it once and attach it to every location record.
 */
export async function getCurrentSpaceWeather() {
    const kp = await fetchLatestKp().catch(() => null);
    const xray = await fetchLatestXrayFlux().catch(() => null);
    const rScale = classifyRScale(xray?.flux);

    return {
        kpIndex: kp?.value ?? null,
        auroraVisibleLatitude: auroraVisibleLatitude(kp?.value),
        radioBlackout: {
            xrayFlux: xray?.flux ?? null,
            rScale: rScale.rScale,
            rScaleDescription: rScale.description,
        },
        observedAt: kp?.timeTag ?? xray?.timeTag ?? null,
    };
}
