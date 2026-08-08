# Field Operations Risk Briefing — Weather + GPS/Radio Conditions

Give it US locations. Get back the NWS forecast and active weather alerts
**plus** current space-weather conditions — Kp index, GPS/HF-radio-relevant
radio blackout severity, and aurora-visible latitude — in one briefing per
location, instead of checking weather.gov and spaceweather-style sites
separately.

Built for anyone whose fieldwork depends on both what's happening on the
ground and overhead: precision-ag/survey teams relying on GPS accuracy, HF
radio operators (ham, aviation, remote utility crews), and drone/UAV
operations planning around both storms and radio blackouts.

## Input

```json
{
  "locations": [
    { "label": "Austin, TX", "latitude": 30.2672, "longitude": -97.7431 }
  ],
  "forecastPeriods": 4
}
```

| Field | Type | Description |
|---|---|---|
| `locations` | array | `{ "label": "optional name", "latitude": ..., "longitude": ... }`. US locations only — NWS coverage. |
| `forecastPeriods` | integer (default `4`) | How many ~12-hour NWS forecast periods to include (4 ≈ next 2 days). |

## Output

One record per location:

```json
{
  "label": "Fairbanks, AK",
  "latitude": 64.8378,
  "longitude": -147.7164,
  "weather": {
    "city": "Fairbanks",
    "state": "AK",
    "timeZone": "America/Anchorage",
    "forecastPeriods": [{ "name": "Tonight", "temperature": 51, "shortForecast": "Isolated Rain Showers", "...": "..." }],
    "activeAlerts": []
  },
  "spaceWeather": {
    "kpIndex": 1.67,
    "auroraVisibleLatitude": 62.4,
    "radioBlackout": { "xrayFlux": 3.74e-7, "rScale": "R0", "rScaleDescription": "No radio blackout" },
    "observedAt": "2026-08-08T03:00:00"
  },
  "briefedAt": "2026-08-08T07:43:50.308Z"
}
```

`spaceWeather` is the same snapshot on every location in a run — it's not a
per-location measurement, current conditions are shared globally. Compare
it against a location's latitude yourself (as above: Fairbanks at 64.8°N is
above the 62.4° aurora viewline, so aurora is plausible there tonight).

## How it works

Two official, keyless US-government JSON APIs, no scraping, no proxy:

- Weather/alerts: `api.weather.gov` (National Weather Service)
- Space weather: `services.swpc.noaa.gov` (NOAA Space Weather Prediction Center) — Kp index and the `0.1-0.8nm` GOES X-ray channel, classified into NOAA's own published R-scale

Space weather is fetched once per run and attached to every location record
— it's identical for everyone regardless of location, so there's no reason
to refetch it per location.

## Related products

Need just one signal instead of the combined briefing?

- [US Weather Tracker](https://github.com/timmKal01/us-weather-tracker) — NWS forecast/alerts only, per location
- [Space Weather Alert](https://github.com/timmKal01/space-weather-alert) — Kp/radio-blackout/aurora/NOAA alerts only, global snapshot

## Pricing note

Billed per **location briefed** — the shared space-weather fetch doesn't
add cost per location, so briefing 10 locations costs the same as briefing
1 for the space-weather portion.
