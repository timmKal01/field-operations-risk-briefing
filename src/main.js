import { Actor, log } from 'apify';
import { getLocationWeather } from './nws.js';
import { getCurrentSpaceWeather } from './spaceweather.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const { locations = [], forecastPeriods = 4 } = input;

if (locations.length === 0) {
    throw new Error('No locations provided.');
}

/** Must match the event name configured in this Actor's pay-per-event pricing on Apify. */
const LOCATION_BRIEFED_EVENT = 'location-briefed';

let spaceWeather;
try {
    spaceWeather = await getCurrentSpaceWeather();
} catch (err) {
    log.warning('Space weather fetch failed, continuing with weather-only briefings', { error: err.message });
    spaceWeather = null;
}

for (const location of locations) {
    const { label = null, latitude, longitude } = location;

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        log.warning('Skipping location with missing/invalid latitude or longitude', { location });
        continue;
    }

    let weather;
    try {
        weather = await getLocationWeather({ latitude, longitude }, forecastPeriods);
    } catch (err) {
        log.warning('Failed to fetch weather for location', { location, error: err.message });
        continue;
    }

    await Actor.pushData({
        label,
        latitude,
        longitude,
        weather,
        spaceWeather,
        briefedAt: new Date().toISOString(),
    });
    await Actor.charge({ eventName: LOCATION_BRIEFED_EVENT });

    log.info('Briefed location', { label: label ?? `${latitude},${longitude}`, activeAlerts: weather.activeAlerts.length, rScale: spaceWeather?.radioBlackout?.rScale });
}

await Actor.exit();
