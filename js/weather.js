import { settings } from './store.js';

const CODES = {
  0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog',
  51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow',
  80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 85: 'Snow showers', 86: 'Snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm',
};

let cache = null; // { at, key, data }

export async function getWeather() {
  const loc = settings.get('weatherLoc');
  if (!loc) return null;
  const key = `${loc.lat},${loc.lon}`;
  if (cache && cache.key === key && Date.now() - cache.at < 30 * 60e3) return cache.data;
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${loc.lat}&longitude=${loc.lon}`
    + '&current=temperature_2m,weather_code'
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max'
    + '&timezone=auto&forecast_days=1';
  const j = await (await fetch(url)).json();
  const data = {
    temp: Math.round(j.current.temperature_2m),
    label: CODES[j.current.weather_code] || '',
    hi: Math.round(j.daily.temperature_2m_max[0]),
    lo: Math.round(j.daily.temperature_2m_min[0]),
    rain: j.daily.precipitation_probability_max[0],
  };
  cache = { at: Date.now(), key, data };
  return data;
}

// Asks the browser for the device location and remembers it (rounded to ~1 km).
export function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not available in this browser'));
    navigator.geolocation.getCurrentPosition((p) => {
      settings.set('weatherLoc', { lat: +p.coords.latitude.toFixed(2), lon: +p.coords.longitude.toFixed(2) });
      resolve();
    }, reject, { timeout: 10000 });
  });
}
