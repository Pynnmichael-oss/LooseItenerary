/* ============================================================
   LOOSE ITINERARY — app.js
   Main application logic for index.html:
   - Settings panel
   - Trip card grid
   - Add Trip overlay
   - Seed data
   - Scroll animations
   ============================================================ */

'use strict';

/* ── Constants (MAPBOX_TOKEN_KEY, TRIPS_PAGE defined in globe.js;
   SUPABASE_URL_KEY, SUPABASE_KEY_KEY defined in supabase.js) ── */
const SEED_FLAG    = 'loose_itinerary_seeded';
const ANTHROPIC_KEY = 'li_anthropic_key';

/* ── Vibe tag presets ── */
const PRESET_VIBE_TAGS = [
  'Hiking', 'Rafting', 'Architecture', 'Drinking', 'Culture',
  'Nature', 'Friends', 'Solo', 'Budget', 'Luxury',
  'Beach', 'Mountains', 'City', 'Food', 'History', 'Golf'
];

/* ── App state ── */
let allTrips        = [];
let selectedVibes   = new Set();
let coverPhotoFile  = null;
let editingTrip     = null;   // non-null when overlay is in edit mode

/* ══════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async () => {
  initScrollObserver();
  initSettingsPanel();
  initAddTripOverlay();
  // Close card menus when clicking elsewhere
  document.addEventListener('click', () => {
    document.querySelectorAll('.trip-card-menu-dropdown').forEach(d => d.hidden = true);
    document.querySelectorAll('.trip-card-menu-btn.active').forEach(b => b.classList.remove('active'));
  });
  await loadAndRenderTrips();
  initGlobeSection();
  await maybeSeedData();
});

/* ══════════════════════════════════════════════════════════════
   SCROLL FADE-IN
   ══════════════════════════════════════════════════════════════ */

function initScrollObserver() {
  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );

  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
}

function observeNewElement(el) {
  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );
  observer.observe(el);
}

/* ══════════════════════════════════════════════════════════════
   SETTINGS PANEL
   ══════════════════════════════════════════════════════════════ */

function initSettingsPanel() {
  const btn      = document.getElementById('settings-btn');
  const panel    = document.getElementById('settings-panel');
  const backdrop = document.getElementById('settings-backdrop');
  const closeBtn = document.getElementById('settings-close');

  const supabaseUrlInput  = document.getElementById('settings-supabase-url');
  const supabaseKeyInput  = document.getElementById('settings-supabase-key');
  const mapboxTokenInput  = document.getElementById('settings-mapbox-token');
  const anthropicKeyInput = document.getElementById('settings-anthropic-key');
  const saveBtn           = document.getElementById('settings-save');
  const testBtn           = document.getElementById('settings-test');
  const statusEl          = document.getElementById('settings-connection-status');
  const exportBtn         = document.getElementById('settings-export');
  const importBtn         = document.getElementById('settings-import');
  const importFile        = document.getElementById('settings-import-file');

  // Populate from localStorage
  supabaseUrlInput.value  = localStorage.getItem(SUPABASE_URL_KEY) || '';
  supabaseKeyInput.value  = localStorage.getItem(SUPABASE_KEY_KEY) || '';
  mapboxTokenInput.value  = localStorage.getItem(MAPBOX_TOKEN_KEY) || '';
  anthropicKeyInput.value = localStorage.getItem(ANTHROPIC_KEY) || '';

  function openPanel() {
    panel.classList.add('open');
    backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closePanel() {
    panel.classList.remove('open');
    backdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  btn.addEventListener('click', openPanel);
  closeBtn.addEventListener('click', closePanel);
  backdrop.addEventListener('click', closePanel);

  // Save credentials
  saveBtn.addEventListener('click', () => {
    const url    = supabaseUrlInput.value.trim();
    const key    = supabaseKeyInput.value.trim();
    const mbTok  = mapboxTokenInput.value.trim();
    const aiKey  = anthropicKeyInput.value.trim();

    if (url)   localStorage.setItem(SUPABASE_URL_KEY, url);
    if (key)   localStorage.setItem(SUPABASE_KEY_KEY, key);
    if (mbTok) localStorage.setItem(MAPBOX_TOKEN_KEY, mbTok);
    if (aiKey) localStorage.setItem(ANTHROPIC_KEY, aiKey);

    // Re-init Supabase if credentials changed
    if (url && key) saveCredentials(url, key);

    showToast('Settings saved');
    closePanel();

    // Reinitialize globe if mapbox token was changed
    if (mbTok) {
      const globeSection = document.getElementById('globe-map');
      if (globeSection) {
        globeSection.innerHTML = '';
        initGlobeSection();
      }
    }
  });

  // Test Supabase connection
  testBtn.addEventListener('click', async () => {
    const url = supabaseUrlInput.value.trim();
    const key = supabaseKeyInput.value.trim();
    if (url && key) saveCredentials(url, key);

    statusEl.className = 'connection-status';
    statusEl.innerHTML = `<div class="spinner"></div> Testing…`;

    const result = await testConnection();
    if (result.ok) {
      statusEl.className = 'connection-status success';
      statusEl.innerHTML = `✓ Connected successfully`;
    } else {
      statusEl.className = 'connection-status error';
      statusEl.innerHTML = `✗ ${result.message}`;
    }
  });

  // Export data
  exportBtn && exportBtn.addEventListener('click', async () => {
    const { error } = await exportAllData();
    if (error) showToast('Export failed: ' + error.message, 'error');
    else showToast('Export downloaded');
  });

  // Import data
  importBtn && importBtn.addEventListener('click', () => importFile && importFile.click());
  importFile && importFile.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const { tripsImported, photosImported, error } = await importData(text);
      if (error) {
        showToast('Import failed: ' + error.message, 'error');
      } else {
        showToast(`Imported ${tripsImported} trips, ${photosImported} photos`);
        await loadAndRenderTrips();
      }
    } catch (err) {
      showToast('Invalid file', 'error');
    }
    importFile.value = '';
  });
}

/* ══════════════════════════════════════════════════════════════
   GLOBE INIT
   ══════════════════════════════════════════════════════════════ */

function initGlobeSection() {
  initGlobe(allTrips);
}

/* ══════════════════════════════════════════════════════════════
   TRIP GRID
   ══════════════════════════════════════════════════════════════ */

async function loadAndRenderTrips() {
  const grid = document.getElementById('trip-grid');
  if (!grid) return;

  // Check if Supabase is configured
  if (!isConfigured()) {
    renderTripGrid([], grid);
    return;
  }

  try {
    const { data, error } = await getAllTrips();
    if (error) {
      console.warn('[App] Could not load trips:', error.message);
      renderTripGrid([], grid);
      return;
    }
    allTrips = data || [];
    renderTripGrid(allTrips, grid);
  } catch (err) {
    renderTripGrid([], grid);
  }
}

function renderTripGrid(trips, grid) {
  grid.innerHTML = '';

  // Always-first: Add Trip card
  const addCard = createAddCard();
  grid.appendChild(addCard);

  if (trips.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state fade-in';
    empty.innerHTML = `
      <p class="empty-state-quote">
        "Every journey starts with a single step — and a one-way ticket."
      </p>
    `;
    grid.appendChild(empty);
  } else {
    trips.forEach((trip, i) => {
      const card = createTripCard(trip);
      card.classList.add('fade-in', `fade-in-delay-${Math.min(i + 1, 5)}`);
      grid.appendChild(card);
      observeNewElement(card);
    });
  }

  // Trigger observer for static fade-in elements
  setTimeout(() => initScrollObserver(), 50);
}

function createAddCard() {
  const card = document.createElement('div');
  card.className = 'trip-card trip-card-add';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', 'Add a new trip');
  card.innerHTML = `
    <div class="trip-card-add-icon">+</div>
    <span class="trip-card-add-label">Add a journey</span>
  `;
  card.addEventListener('click', openAddTripOverlay);
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') openAddTripOverlay();
  });
  return card;
}

function createTripCard(trip) {
  const card = document.createElement('div');
  card.className = 'trip-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `View trip: ${trip.destination}`);
  card.dataset.slug = trip.slug;

  const accent = trip.accent_color || '#c4732a';

  const coverHtml = trip.cover_photo_url
    ? `<img class="trip-card-cover" src="${trip.cover_photo_url}" alt="${trip.destination}" loading="lazy">`
    : `<div class="trip-card-cover-placeholder" style="background: linear-gradient(135deg, ${hexAdjust(accent, -30)} 0%, ${accent} 60%, ${hexAdjust(accent, 20)} 100%);">${trip.destination.charAt(0)}</div>`;

  const dateStr = formatDateRange(trip.start_date, trip.end_date);
  const tagHtml = (trip.vibe_tags || []).slice(0, 3).map(t =>
    `<span class="vibe-tag">${t}</span>`
  ).join('');

  card.innerHTML = `
    <button class="trip-card-menu-btn" aria-label="Trip options" title="Options">•••</button>
    <div class="trip-card-menu-dropdown" hidden>
      <button class="trip-card-menu-item" data-action="edit">✏ Edit Trip</button>
      <button class="trip-card-menu-item trip-card-menu-danger" data-action="delete">🗑 Delete Trip</button>
    </div>
    <div class="trip-card-cover-wrap">
      ${coverHtml}
      ${trip.tagline ? `<div class="trip-card-tagline-overlay">${trip.tagline}</div>` : ''}
    </div>
    <div class="trip-card-info">
      <div>
        <h3 class="trip-card-destination">${trip.destination}</h3>
        <p class="trip-card-dates">${dateStr}</p>
      </div>
      <div class="vibe-tags">${tagHtml}</div>
    </div>
  `;

  // Navigate on card click — not when menu is involved
  card.addEventListener('click', e => {
    if (e.target.closest('.trip-card-menu-btn') || e.target.closest('.trip-card-menu-dropdown')) return;
    window.location.href = `${TRIPS_PAGE}#${trip.slug}`;
  });
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter') window.location.href = `${TRIPS_PAGE}#${trip.slug}`;
  });

  // ••• menu toggle
  const menuBtn  = card.querySelector('.trip-card-menu-btn');
  const menuDrop = card.querySelector('.trip-card-menu-dropdown');
  menuBtn.addEventListener('click', e => {
    e.stopPropagation();
    const wasOpen = !menuDrop.hidden;
    // Close all others first
    document.querySelectorAll('.trip-card-menu-dropdown').forEach(d => d.hidden = true);
    document.querySelectorAll('.trip-card-menu-btn.active').forEach(b => b.classList.remove('active'));
    if (!wasOpen) {
      menuDrop.hidden = false;
      menuBtn.classList.add('active');
    }
  });

  // Menu actions
  menuDrop.addEventListener('click', e => {
    e.stopPropagation();
    const action = e.target.closest('[data-action]')?.dataset.action;
    menuDrop.hidden = true;
    menuBtn.classList.remove('active');
    if (action === 'edit')   openEditTripOverlay(trip, card);
    if (action === 'delete') confirmDeleteTripCard(trip, card);
  });

  return card;
}

function confirmDeleteTripCard(trip, card) {
  if (!confirm(`Delete "${trip.destination}"? This cannot be undone.`)) return;
  deleteTrip(trip.slug).then(({ error }) => {
    if (error) { showToast('Delete failed: ' + error.message, 'error'); return; }
    card.style.transition = 'opacity 0.3s, transform 0.3s';
    card.style.opacity = '0';
    card.style.transform = 'scale(0.92)';
    setTimeout(() => {
      card.remove();
      allTrips = allTrips.filter(t => t.slug !== trip.slug);
      refreshGlobe(allTrips);
      // Show empty state if no trips left
      const grid = document.getElementById('trip-grid');
      if (grid && !grid.querySelector('.trip-card:not(.trip-card-add)')) {
        const empty = document.createElement('div');
        empty.className = 'empty-state fade-in';
        empty.innerHTML = `<p class="empty-state-quote">"Every journey starts with a single step — and a one-way ticket."</p>`;
        grid.appendChild(empty);
        setTimeout(() => initScrollObserver(), 50);
      }
    }, 300);
  });
}

/* ══════════════════════════════════════════════════════════════
   ADD TRIP OVERLAY
   ══════════════════════════════════════════════════════════════ */

function initAddTripOverlay() {
  const overlay  = document.getElementById('add-trip-overlay');
  const closeBtn = document.getElementById('add-trip-close');
  const form     = document.getElementById('add-trip-form');
  const dropzone = document.getElementById('cover-dropzone');
  const fileInput = document.getElementById('cover-file-input');
  const preview   = document.getElementById('cover-preview');

  // Close
  closeBtn.addEventListener('click', closeAddTripOverlay);
  overlay.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAddTripOverlay();
  });

  // Vibe tag selector
  initVibeTagSelector();

  // Drag & drop photo
  dropzone.addEventListener('dragover', e => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleCoverPhoto(file);
  });

  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) handleCoverPhoto(file);
  });

  // Form submit
  form.addEventListener('submit', async e => {
    e.preventDefault();
    await submitTripForm();
  });
}

function openAddTripOverlay() {
  editingTrip = null;
  document.getElementById('overlay-title').textContent = 'New Journey';
  document.getElementById('add-trip-submit').textContent = 'Add Trip';
  const overlay = document.getElementById('add-trip-overlay');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => { overlay.querySelector('.form-input')?.focus(); }, 400);
}

function openEditTripOverlay(trip, cardEl) {
  editingTrip = trip;
  editingTrip._cardEl = cardEl; // keep ref to update in place

  // Swap overlay labels
  document.getElementById('overlay-title').textContent = 'Edit Journey';
  document.getElementById('add-trip-submit').textContent = 'Save Changes';

  // Pre-fill fields
  document.getElementById('trip-destination').value = trip.destination || '';
  document.getElementById('trip-cities').value       = (trip.cities || []).join(', ');
  document.getElementById('trip-start-date').value   = trip.start_date || '';
  document.getElementById('trip-end-date').value     = trip.end_date || '';
  document.getElementById('trip-tagline').value      = trip.tagline || '';
  document.getElementById('trip-points').value       = trip.points_used || '';
  document.getElementById('trip-cash').value         = trip.cash_spent || '';
  document.getElementById('trip-accent-color').value = trip.accent_color || '#c4732a';

  // Pre-select vibe tags — reset first
  selectedVibes.clear();
  document.querySelectorAll('.vibe-tag-selectable').forEach(el => el.classList.remove('selected'));
  (trip.vibe_tags || []).forEach(tag => {
    selectedVibes.add(tag);
    const pill = document.querySelector(`.vibe-tag-selectable[data-tag="${tag}"]`);
    if (pill) {
      pill.classList.add('selected');
    } else {
      // Custom tag not in presets — create it
      const container = document.getElementById('vibe-tag-selector');
      const p = document.createElement('span');
      p.className = 'vibe-tag vibe-tag-selectable selected';
      p.textContent = tag;
      p.dataset.tag = tag;
      p.addEventListener('click', () => toggleVibeTag(tag, p));
      container.appendChild(p);
    }
  });

  // Show current cover as preview
  const preview = document.getElementById('cover-preview');
  const dropText = document.querySelector('#cover-dropzone .photo-dropzone-text');
  if (trip.cover_photo_url && preview) {
    preview.src = trip.cover_photo_url;
    preview.classList.add('visible');
    if (dropText) dropText.textContent = 'Drop to replace cover photo';
  }

  const overlay = document.getElementById('add-trip-overlay');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => { overlay.querySelector('.form-input')?.focus(); }, 400);
}

function closeAddTripOverlay() {
  const overlay = document.getElementById('add-trip-overlay');
  overlay.classList.remove('open');
  document.body.style.overflow = '';
  resetAddTripForm();
}

function resetAddTripForm() {
  const form = document.getElementById('add-trip-form');
  if (form) form.reset();
  selectedVibes.clear();
  coverPhotoFile = null;
  editingTrip    = null;

  document.querySelectorAll('.vibe-tag-selectable').forEach(el => el.classList.remove('selected'));

  const preview = document.getElementById('cover-preview');
  if (preview) { preview.classList.remove('visible'); preview.src = ''; }
  const dropText = document.querySelector('#cover-dropzone .photo-dropzone-text');
  if (dropText) dropText.textContent = 'Drop a photo or click to browse';

  document.querySelectorAll('.form-error').forEach(el => el.classList.remove('visible'));
  document.querySelectorAll('.form-input.error').forEach(el => el.classList.remove('error'));

  const colorPicker = document.getElementById('trip-accent-color');
  if (colorPicker) colorPicker.value = '#c4732a';

  // Remove any custom tags added during edit session
  document.querySelectorAll('#vibe-tag-selector .vibe-tag-selectable:not([data-preset])').forEach(el => el.remove());
}

function initVibeTagSelector() {
  const container = document.getElementById('vibe-tag-selector');
  if (!container) return;

  PRESET_VIBE_TAGS.forEach(tag => {
    const pill = document.createElement('span');
    pill.className = 'vibe-tag vibe-tag-selectable';
    pill.textContent = tag;
    pill.dataset.tag = tag;
    pill.dataset.preset = '1';
    pill.addEventListener('click', () => toggleVibeTag(tag, pill));
    container.appendChild(pill);
  });

  // Custom tag add
  const addBtn   = document.getElementById('custom-tag-add');
  const addInput = document.getElementById('custom-tag-input');

  if (addBtn && addInput) {
    addBtn.addEventListener('click', () => addCustomTag(addInput, container));
    addInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addCustomTag(addInput, container);
      }
    });
  }
}

function toggleVibeTag(tag, el) {
  if (selectedVibes.has(tag)) {
    selectedVibes.delete(tag);
    el.classList.remove('selected');
  } else {
    selectedVibes.add(tag);
    el.classList.add('selected');
  }
}

function addCustomTag(input, container) {
  const val = input.value.trim();
  if (!val) return;
  if (selectedVibes.has(val)) {
    input.value = '';
    return;
  }

  // Create pill in selector
  const pill = document.createElement('span');
  pill.className = 'vibe-tag vibe-tag-selectable selected';
  pill.textContent = val;
  pill.dataset.tag = val;
  pill.addEventListener('click', () => toggleVibeTag(val, pill));
  container.appendChild(pill);

  selectedVibes.add(val);
  input.value = '';
}

function handleCoverPhoto(file) {
  coverPhotoFile = file;
  const preview  = document.getElementById('cover-preview');
  const dropText = document.querySelector('#cover-dropzone .photo-dropzone-text');

  const reader = new FileReader();
  reader.onload = e => {
    preview.src = e.target.result;
    preview.classList.add('visible');
    if (dropText) dropText.textContent = file.name;
  };
  reader.readAsDataURL(file);
}

async function submitTripForm() {
  // Validate
  const destination = document.getElementById('trip-destination').value.trim();
  const citiesRaw   = document.getElementById('trip-cities').value.trim();
  let valid = true;
  if (!destination) { showFieldError('trip-destination', 'Destination is required'); valid = false; }
  if (!citiesRaw)   { showFieldError('trip-cities', 'At least one city is required for the map'); valid = false; }
  if (!valid) return;

  const startDate   = document.getElementById('trip-start-date').value;
  const endDate     = document.getElementById('trip-end-date').value;
  const tagline     = document.getElementById('trip-tagline').value.trim();
  const pointsUsed  = parseInt(document.getElementById('trip-points').value) || 0;
  const cashSpent   = parseFloat(document.getElementById('trip-cash').value) || 0;
  const accentColor = document.getElementById('trip-accent-color').value || '#c4732a';
  const cities      = citiesRaw.split(',').map(c => c.trim()).filter(Boolean);

  const submitBtn = document.getElementById('add-trip-submit');
  const origText  = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<div class="spinner"></div> Saving…`;

  try {
    if (editingTrip) {
      /* ── EDIT mode ── */
      const updatedData = {
        ...editingTrip,
        destination,
        cities,
        start_date:   startDate || null,
        end_date:     endDate || null,
        tagline:      tagline || null,
        vibe_tags:    Array.from(selectedVibes),
        accent_color: accentColor,
        points_used:  pointsUsed,
        cash_spent:   cashSpent,
      };
      delete updatedData._cardEl;

      // Replace cover photo if a new one was selected
      if (coverPhotoFile && isConfigured()) {
        const { url, error: upErr } = await uploadPhoto(editingTrip.id, coverPhotoFile, '', null);
        if (!upErr && url) {
          if (editingTrip.cover_photo_url) {
            await deleteCoverPhoto(editingTrip.id, editingTrip.cover_photo_url);
          }
          updatedData.cover_photo_url = url;
        }
      }

      if (isConfigured()) {
        const { error } = await saveTrip(updatedData);
        if (error) throw error;
      }

      // Update local state
      const idx = allTrips.findIndex(t => t.slug === editingTrip.slug);
      if (idx !== -1) allTrips[idx] = updatedData;

      // Replace card in grid
      if (editingTrip._cardEl) {
        const newCard = createTripCard(updatedData);
        newCard.classList.add('pop-in');
        editingTrip._cardEl.replaceWith(newCard);
      }

      refreshGlobe(allTrips);
      closeAddTripOverlay();
      showToast('Trip updated');

    } else {
      /* ── NEW trip mode ── */
      const slug = generateSlug(destination, startDate);
      const tripData = {
        slug, destination, cities,
        start_date:   startDate || null,
        end_date:     endDate || null,
        tagline:      tagline || null,
        vibe_tags:    Array.from(selectedVibes),
        accent_color: accentColor,
        points_used:  pointsUsed,
        cash_spent:   cashSpent,
        days: [], highlights: [], tips: [], spending: null
      };

      let coverUrl = null;
      if (isConfigured()) {
        const { data: savedTrip, error: saveError } = await saveTrip(tripData);
        if (saveError) throw saveError;

        if (coverPhotoFile && savedTrip) {
          const { url, error: upErr } = await uploadPhoto(savedTrip.id, coverPhotoFile, '', null);
          if (!upErr && url) {
            coverUrl = url;
            await saveTrip({ ...tripData, id: savedTrip.id, cover_photo_url: url });
          }
        }
        tripData.id = savedTrip?.id;
      }

      tripData.cover_photo_url = coverUrl;
      allTrips.unshift(tripData);
      closeAddTripOverlay();
      addTripCardToGrid(tripData);
      refreshGlobe(allTrips);
      showToast('Trip added!');
      setTimeout(() => { window.location.href = `${TRIPS_PAGE}#${slug}`; }, 600);
    }

  } catch (err) {
    console.error('[App] Save trip error:', err);
    showToast('Could not save: ' + err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = origText;
  }
}

function addTripCardToGrid(trip) {
  const grid = document.getElementById('trip-grid');
  if (!grid) return;

  // Remove empty state if present
  const emptyState = grid.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  const card = createTripCard(trip);
  card.classList.add('pop-in');

  // Insert after the add card
  const addCard = grid.querySelector('.trip-card-add');
  if (addCard && addCard.nextSibling) {
    grid.insertBefore(card, addCard.nextSibling);
  } else {
    grid.appendChild(card);
  }
}

/* ══════════════════════════════════════════════════════════════
   SEED DATA — BANFF 2025
   ══════════════════════════════════════════════════════════════ */

async function maybeSeedData() {
  if (localStorage.getItem(SEED_FLAG)) return;
  if (!isConfigured()) return;

  const banff = {
    slug:        'banff-2025-07-31',
    destination: 'Banff & the Canadian Rockies',
    cities:      ['Calgary', 'Canmore', 'Banff', 'Lake Louise'],
    start_date:  '2025-07-31',
    end_date:    '2025-08-04',
    tagline:     'Ultimate Boys Trip',
    vibe_tags:   ['Hiking', 'Rafting', 'Nature', 'Friends', 'Golf'],
    accent_color: '#2a6496',
    points_used:  0,
    cash_spent:   1800,
    cover_photo_url: null,
    days: [
      { index: 0, date: '2025-07-31', title: 'Tulsa → Calgary',
        summary: 'Flew out of TUL. First look at the Rockies on approach.' },
      { index: 1, date: '2025-08-01', title: 'Into the Mountains',
        summary: 'Drove into Canmore. The scale of everything here is humbling.' },
      { index: 2, date: '2025-08-02', title: 'Banff Day',
        summary: 'Hiked, hit the golf course in Banff. Unreal backdrop.' },
      { index: 3, date: '2025-08-03', title: 'Lake Louise',
        summary: 'Fent Bent at Lake Louise. The water is actually that color.' },
      { index: 4, date: '2025-08-04', title: 'Calgary & Home',
        summary: 'Last morning in Calgary. Already planning the next one.' }
    ],
    highlights: [
      'Fent Bent @ Lake Louise',
      'White water rafting',
      'Golf with the Rockies as a backdrop'
    ],
    tips: [
      'Stay in Canmore — cheaper than Banff town, 20 min away',
      'Book rafting in advance in summer',
      'The Icefields Parkway is worth the detour'
    ],
    spending: null
  };

  try {
    // Check if already exists
    const { data: existing } = await getTrip(banff.slug);
    if (!existing) {
      const { error } = await saveTrip(banff);
      if (!error) {
        localStorage.setItem(SEED_FLAG, '1');
        // Reload trips to include seed
        await loadAndRenderTrips();
        initGlobeSection();
      }
    } else {
      localStorage.setItem(SEED_FLAG, '1');
    }
  } catch (err) {
    // Silently skip seed if Supabase isn't ready
    console.warn('[App] Could not seed data:', err.message);
  }
}

/* ══════════════════════════════════════════════════════════════
   UTILITIES
   ══════════════════════════════════════════════════════════════ */

function generateSlug(destination, date) {
  const base = destination
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const datePart = date ? '-' + date : '';
  return base + datePart;
}

function formatDateRange(start, end) {
  if (!start) return '';
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  const s = new Date(start + 'T12:00:00').toLocaleDateString('en-US', opts);
  if (!end) return s;
  const e = new Date(end + 'T12:00:00').toLocaleDateString('en-US', opts);
  if (s === e) return s;
  // Same year — drop year from start
  const startYear = new Date(start + 'T12:00:00').getFullYear();
  const endYear   = new Date(end   + 'T12:00:00').getFullYear();
  if (startYear === endYear) {
    const shortOpts = { month: 'short', day: 'numeric' };
    const ss = new Date(start + 'T12:00:00').toLocaleDateString('en-US', shortOpts);
    return `${ss} – ${e}`;
  }
  return `${s} – ${e}`;
}

function showFieldError(fieldId, message) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  field.classList.add('error');
  const errEl = field.parentElement.querySelector('.form-error');
  if (errEl) {
    errEl.textContent = message;
    errEl.classList.add('visible');
  }
  field.addEventListener('input', () => {
    field.classList.remove('error');
    if (errEl) errEl.classList.remove('visible');
  }, { once: true });
}

function showToast(message, type = 'default') {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast ${type}`;

  // Animate in
  requestAnimationFrame(() => {
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2800);
  });
}

/**
 * Slightly adjust a hex color brightness
 */
function hexAdjust(hex, amount) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c+c).join('');
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);
  r = Math.min(255, Math.max(0, r + amount));
  g = Math.min(255, Math.max(0, g + amount));
  b = Math.min(255, Math.max(0, b + amount));
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}
