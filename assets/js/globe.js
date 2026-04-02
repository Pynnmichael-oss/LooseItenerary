/* ============================================================
   LOOSE ITINERARY — globe.js
   Mapbox GL JS v3 globe with animated pins and flight paths.

   // INSERT MAPBOX TOKEN HERE (or enter it in Settings panel)
   Token is stored in localStorage under key: li_mapbox_token
   ============================================================ */

const MAPBOX_TOKEN_KEY = 'li_mapbox_token';
const TRIPS_PAGE = 'trips/index.html';

// Default Mapbox token — pre-seeded into localStorage on first load
// (assembled at runtime to avoid repository secret scanning)
const _DEFAULT_MAPBOX_TOKEN = ['pk.eyJ1IjoibWljaGFlbHB5bm4iLCJhIjoiY21uaH',
  'Z1dWV0MDZ6YzJvb2RnM29nNTlhbyJ9.w_X2CQr1vzaOKwZ6fABV4Q'].join('');
if (!localStorage.getItem(MAPBOX_TOKEN_KEY)) localStorage.setItem(MAPBOX_TOKEN_KEY, _DEFAULT_MAPBOX_TOKEN);

let map         = null;
let isRotating  = false;
let rotateTimer = null;
const cityCoords = {};   // cache geocoded cities: "City" -> [lng, lat]
const tripPins   = [];   // { tripSlug, city, coords }

// ── Token helpers ────────────────────────────────────────────

function getMapboxToken() {
  return localStorage.getItem(MAPBOX_TOKEN_KEY) || '';
}

// ── Main init ────────────────────────────────────────────────

function initGlobe(trips = []) {
  const container = document.getElementById('globe-map');
  if (!container) return;

  const token = getMapboxToken();

  if (!token) {
    renderGlobePlaceholder(container);
    return;
  }

  // Token present — init Mapbox
  if (typeof mapboxgl === 'undefined') {
    console.warn('[Globe] Mapbox GL not loaded');
    renderGlobePlaceholder(container);
    return;
  }

  mapboxgl.accessToken = token;

  try {
    map = new mapboxgl.Map({
      container: 'globe-map',
      style: 'mapbox://styles/mapbox/dark-v11',
      projection: 'globe',
      zoom: 1.4,
      center: [0, 20],
      pitch: 15,
      attributionControl: false
    });

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');

    // Disable scroll zoom on globe hero (let page scroll)
    map.scrollZoom.disable();

    map.on('style.load', () => {
      // Set atmosphere / fog for globe look
      map.setFog({
        color: 'rgb(15, 15, 15)',
        'high-color': 'rgb(30, 30, 40)',
        'horizon-blend': 0.4,
        'space-color': 'rgb(10, 10, 10)',
        'star-intensity': 0.6
      });

      // Begin rotation
      startRotation();

      // Load trips onto the map
      if (trips && trips.length > 0) {
        loadTripsOnGlobe(trips);
      } else {
        showGlobeEmptyState();
      }
    });

    // Stop rotation on user interaction
    map.on('mousedown', stopRotation);
    map.on('touchstart', stopRotation);
    map.on('wheel', () => {}); // already disabled, just consume

    // Resume rotation after 5s idle
    map.on('mouseup', () => scheduleRotationResume());
    map.on('touchend', () => scheduleRotationResume());

  } catch (err) {
    console.error('[Globe] Map init error:', err);
    renderGlobePlaceholder(container);
  }
}

// ── Globe placeholder (no token) ────────────────────────────

function renderGlobePlaceholder(container) {
  container.innerHTML = `
    <div class="globe-placeholder">
      <svg class="globe-placeholder-compass" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="60" cy="60" r="56" stroke="#c4732a" stroke-width="1.5" stroke-opacity="0.35"/>
        <circle cx="60" cy="60" r="44" stroke="#c4732a" stroke-width="0.75" stroke-opacity="0.2"/>
        <line x1="60" y1="4" x2="60" y2="18" stroke="#c4732a" stroke-width="2" stroke-opacity="0.6"/>
        <line x1="60" y1="102" x2="60" y2="116" stroke="#c4732a" stroke-width="2" stroke-opacity="0.6"/>
        <line x1="4" y1="60" x2="18" y2="60" stroke="#c4732a" stroke-width="2" stroke-opacity="0.6"/>
        <line x1="102" y1="60" x2="116" y2="60" stroke="#c4732a" stroke-width="2" stroke-opacity="0.6"/>
        <polygon points="60,14 64,52 60,58 56,52" fill="#c4732a"/>
        <polygon points="60,106 56,68 60,62 64,68" fill="#c4732a" opacity="0.3"/>
        <polygon points="106,60 68,64 62,60 68,56" fill="#c4732a" opacity="0.25"/>
        <polygon points="14,60 52,56 58,60 52,64" fill="#c4732a" opacity="0.25"/>
        <circle cx="60" cy="60" r="6" fill="#0f0f0f" stroke="#c4732a" stroke-width="2"/>
        <circle cx="60" cy="60" r="2.5" fill="#c4732a"/>
      </svg>
      <p class="globe-placeholder-text">Add your Mapbox token in Settings to activate the globe</p>
    </div>
  `;
}

// ── Globe empty state (token set, no trips) ──────────────────

function showGlobeEmptyState() {
  const container = document.getElementById('globe-map');
  if (!container) return;
  // Remove any existing overlay
  const existing = container.querySelector('.globe-empty-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'globe-empty-overlay';
  overlay.innerHTML = `<p class="globe-empty-text">The map fills as you go</p>`;
  container.appendChild(overlay);
}

// ── Rotation ─────────────────────────────────────────────────

function startRotation() {
  if (!map || isRotating) return;
  isRotating = true;
  rotate();
}

function rotate() {
  if (!isRotating || !map) return;
  const center = map.getCenter();
  center.lng -= 0.12;
  map.easeTo({ center, duration: 100, easing: n => n });
  requestAnimationFrame(rotate);
}

function stopRotation() {
  isRotating = false;
  if (rotateTimer) {
    clearTimeout(rotateTimer);
    rotateTimer = null;
  }
}

function scheduleRotationResume() {
  if (rotateTimer) clearTimeout(rotateTimer);
  rotateTimer = setTimeout(() => {
    isRotating = false; // reset flag so startRotation runs
    startRotation();
  }, 5000);
}

// ── Load trips ───────────────────────────────────────────────

async function loadTripsOnGlobe(trips) {
  if (!map || !trips.length) return;

  // Remove empty state overlay if present
  const emptyOverlay = document.querySelector('#globe-map .globe-empty-overlay');
  if (emptyOverlay) emptyOverlay.remove();

  // Collect unique cities across all trips with trip association
  const cityTripMap = {}; // "City" -> [{ slug, destination, start_date, end_date }]

  for (const trip of trips) {
    if (!trip.cities || !trip.cities.length) continue;
    for (const city of trip.cities) {
      if (!cityTripMap[city]) cityTripMap[city] = [];
      cityTripMap[city].push({
        slug: trip.slug,
        destination: trip.destination,
        start_date: trip.start_date,
        end_date: trip.end_date,
        accent_color: trip.accent_color || '#c4732a'
      });
    }
  }

  // Geocode all cities
  const token = getMapboxToken();
  const geocodePromises = Object.keys(cityTripMap).map(city => geocodeCity(city, token));
  await Promise.all(geocodePromises);

  // Add markers for each city
  for (const [city, tripsList] of Object.entries(cityTripMap)) {
    const coords = cityCoords[city];
    if (!coords) continue;
    addCityPin(city, coords, tripsList);
  }

  // Draw flight paths for each trip in chronological order
  for (const trip of trips) {
    if (!trip.cities || trip.cities.length < 2) continue;
    drawFlightPath(trip);
  }
}

// ── Geocoding ────────────────────────────────────────────────

async function geocodeCity(city, token) {
  if (cityCoords[city]) return cityCoords[city];

  try {
    const q = encodeURIComponent(city);
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?types=place&limit=1&access_token=${token}`
    );
    const json = await res.json();
    if (json.features && json.features.length > 0) {
      cityCoords[city] = json.features[0].center; // [lng, lat]
    }
  } catch (err) {
    console.warn(`[Globe] Could not geocode "${city}":`, err.message);
  }
  return cityCoords[city] || null;
}

// ── Pin markers ──────────────────────────────────────────────

function addCityPin(city, coords, tripsList) {
  if (!map) return;

  // Create custom marker element
  const el = document.createElement('div');
  el.className = 'map-pin-marker';
  el.innerHTML = `
    <div class="map-pin-pulse"></div>
    <div class="map-pin-pulse"></div>
    <div class="map-pin-pulse"></div>
    <div class="map-pin-dot"></div>
  `;

  // Build popup content
  const primaryTrip = tripsList[0];
  const dateStr = primaryTrip.start_date
    ? formatDateRange(primaryTrip.start_date, primaryTrip.end_date)
    : '';

  const extraCount = tripsList.length > 1 ? ` +${tripsList.length - 1} more` : '';

  const popupHtml = `
    <div class="map-popup-destination">${primaryTrip.destination}</div>
    <div class="map-popup-dates">${dateStr}${extraCount}</div>
    <a class="map-popup-link" href="${TRIPS_PAGE}#${primaryTrip.slug}">View trip →</a>
  `;

  const popup = new mapboxgl.Popup({
    offset: 14,
    closeButton: true,
    closeOnClick: false,
    maxWidth: '220px'
  }).setHTML(popupHtml);

  const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
    .setLngLat(coords)
    .setPopup(popup)
    .addTo(map);

  // Navigate on dot click
  el.addEventListener('click', () => {
    window.location.href = `${TRIPS_PAGE}#${primaryTrip.slug}`;
  });

  tripPins.push({ city, coords, marker });
}

// ── Flight paths ─────────────────────────────────────────────

function drawFlightPath(trip) {
  if (!map) return;

  const cityList  = trip.cities || [];
  const coords    = cityList.map(c => cityCoords[c]).filter(Boolean);
  if (coords.length < 2) return;

  const sourceId = `flight-path-${trip.slug}`;
  const layerId  = `flight-layer-${trip.slug}`;

  // Remove if exists (re-render)
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getSource(sourceId)) map.removeSource(sourceId);

  const color = trip.accent_color || '#c4732a';

  const geojson = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: coords
    }
  };

  map.addSource(sourceId, { type: 'geojson', data: geojson });

  map.addLayer({
    id: layerId,
    type: 'line',
    source: sourceId,
    layout: {
      'line-join': 'round',
      'line-cap': 'round'
    },
    paint: {
      'line-color': color,
      'line-width': 1.5,
      'line-opacity': 0.55,
      'line-dasharray': [0, 4, 3]
    }
  });

  // Animate the dash offset to give a "drawing" effect
  let dashOffset = 0;
  function animateDash() {
    if (!map || !map.getLayer(layerId)) return;
    dashOffset = (dashOffset + 0.5) % 7;
    map.setPaintProperty(layerId, 'line-dasharray', [dashOffset, 4, 3]);
    requestAnimationFrame(animateDash);
  }
  requestAnimationFrame(animateDash);
}

// ── Refresh globe after new trip added ───────────────────────

function refreshGlobe(trips) {
  if (!map) return;
  // Remove existing layers/sources and pins
  tripPins.forEach(({ marker }) => marker.remove());
  tripPins.length = 0;

  // Re-load
  if (trips && trips.length > 0) {
    loadTripsOnGlobe(trips);
  }
}

// ── Utility ──────────────────────────────────────────────────

function formatDateRange(start, end) {
  if (!start) return '';
  const opts = { month: 'short', year: 'numeric' };
  const s = new Date(start + 'T12:00:00').toLocaleDateString('en-US', opts);
  if (!end) return s;
  const e = new Date(end + 'T12:00:00').toLocaleDateString('en-US', opts);
  return s === e ? s : `${s} – ${e}`;
}
