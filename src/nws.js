// NWS explicitly requires a descriptive User-Agent identifying the calling application.
const USER_AGENT = '(field-operations-risk-briefing Apify actor, field-ops-admin@example.com)';

async function fetchJson(url) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/geo+json' } });
    if (!res.ok) throw new Error(`Request failed: ${url} (${res.status})`);
    return res.json();
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
