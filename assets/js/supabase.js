/* ============================================================
   LOOSE ITINERARY — supabase.js
   Supabase client initialization and connection utilities.

   Credentials are NEVER hardcoded — they come from localStorage.
   User enters them in the Settings panel.

   ──────────────────────────────────────────────────────────────
   SQL SETUP — Run in your Supabase SQL Editor:
   ──────────────────────────────────────────────────────────────

   CREATE TABLE trips (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     slug TEXT UNIQUE NOT NULL,
     destination TEXT NOT NULL,
     cities TEXT[],
     start_date DATE,
     end_date DATE,
     tagline TEXT,
     vibe_tags TEXT[],
     cover_photo_url TEXT,
     accent_color TEXT DEFAULT '#c4732a',
     points_used INTEGER,
     cash_spent DECIMAL,
     days JSONB,
     highlights JSONB,
     tips JSONB,
     spending JSONB,
     created_at TIMESTAMPTZ DEFAULT now()
   );

   CREATE TABLE photos (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
     storage_path TEXT NOT NULL,
     public_url TEXT NOT NULL,
     caption TEXT,
     day_index INTEGER,
     uploaded_at TIMESTAMPTZ DEFAULT now()
   );

   -- Enable public read access on trips and photos
   ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
   ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "Public read" ON trips FOR SELECT USING (true);
   CREATE POLICY "Public read" ON photos FOR SELECT USING (true);
   CREATE POLICY "Anon insert" ON trips FOR INSERT WITH CHECK (true);
   CREATE POLICY "Anon insert" ON photos FOR INSERT WITH CHECK (true);
   CREATE POLICY "Anon update" ON trips FOR UPDATE USING (true);
   CREATE POLICY "Anon delete" ON trips FOR DELETE USING (true);
   CREATE POLICY "Anon delete" ON photos FOR DELETE USING (true);

   -- Create storage bucket (or do this in the Supabase dashboard):
   -- INSERT INTO storage.buckets (id, name, public)
   -- VALUES ('trip-photos', 'trip-photos', true);

   ============================================================ */

const SUPABASE_URL_KEY  = 'li_supabase_url';
const SUPABASE_KEY_KEY  = 'li_supabase_anon_key';

// Internal client reference — do not access directly outside this module
let _client = null;

/**
 * initSupabase()
 * Reads credentials from localStorage and initializes the Supabase client.
 * Returns the client if credentials exist, or null if not configured.
 */
function initSupabase() {
  const url    = localStorage.getItem(SUPABASE_URL_KEY);
  const anonKey = localStorage.getItem(SUPABASE_KEY_KEY);

  if (!url || !anonKey) {
    _client = null;
    return null;
  }

  try {
    // Supabase JS v2 loaded from CDN (global: supabase)
    if (typeof supabase === 'undefined' || !supabase.createClient) {
      console.warn('[Supabase] SDK not loaded yet.');
      _client = null;
      return null;
    }
    _client = supabase.createClient(url, anonKey);
    return _client;
  } catch (err) {
    console.error('[Supabase] Failed to initialize:', err);
    _client = null;
    return null;
  }
}

/**
 * getClient()
 * Returns the active client, initializing if needed.
 * Throws if credentials aren't set.
 */
function getClient() {
  if (_client) return _client;
  const client = initSupabase();
  if (!client) throw new Error('Supabase not configured. Add your URL and anon key in Settings.');
  return client;
}

/**
 * testConnection()
 * Pings Supabase by querying the trips table with limit 1.
 * Returns { ok: true } or { ok: false, message: string }
 */
async function testConnection() {
  try {
    const client = getClient();
    const { error } = await client.from('trips').select('id').limit(1);
    if (error) {
      return { ok: false, message: error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

/**
 * isConfigured()
 * Quick check — are credentials stored?
 */
function isConfigured() {
  return !!(localStorage.getItem(SUPABASE_URL_KEY) && localStorage.getItem(SUPABASE_KEY_KEY));
}

/**
 * saveCredentials(url, anonKey)
 * Stores credentials in localStorage and re-initializes the client.
 */
function saveCredentials(url, anonKey) {
  localStorage.setItem(SUPABASE_URL_KEY, url.trim());
  localStorage.setItem(SUPABASE_KEY_KEY, anonKey.trim());
  _client = null; // force re-init
  return initSupabase();
}

// Auto-initialize on load if credentials exist
initSupabase();
