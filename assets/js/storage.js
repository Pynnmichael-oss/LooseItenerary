/* ============================================================
   LOOSE ITINERARY — storage.js
   Clean data API over Supabase. All trip data goes through here.
   app.js and index.html never call Supabase directly.
   ============================================================ */

const STORAGE_BUCKET = 'trip-photos';

// ── Trips ────────────────────────────────────────────────────

/**
 * saveTrip(tripData)
 * Upsert a trip to the trips table (insert or update by slug).
 * Returns { data, error }
 */
async function saveTrip(tripData) {
  try {
    const client = getClient();
    const { data, error } = await client
      .from('trips')
      .upsert(tripData, { onConflict: 'slug' })
      .select()
      .single();
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * getTrip(slug)
 * Fetch a single trip by its slug.
 * Returns { data, error }
 */
async function getTrip(slug) {
  try {
    const client = getClient();
    const { data, error } = await client
      .from('trips')
      .select('*')
      .eq('slug', slug)
      .single();
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * getAllTrips()
 * Fetch all trips ordered by start_date descending.
 * Returns { data, error }
 */
async function getAllTrips() {
  try {
    const client = getClient();
    const { data, error } = await client
      .from('trips')
      .select('*')
      .order('start_date', { ascending: false });
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * deleteTrip(slug)
 * Delete a trip by slug. Photos cascade automatically via FK.
 * Returns { error }
 */
async function deleteTrip(slug) {
  try {
    const client = getClient();
    const { error } = await client
      .from('trips')
      .delete()
      .eq('slug', slug);
    return { error };
  } catch (err) {
    return { error: err };
  }
}

// ── Photos ───────────────────────────────────────────────────

/**
 * uploadPhoto(tripId, file, caption, dayIndex)
 * Upload a file to Supabase Storage, insert a row to photos table.
 * Returns { url, error }
 */
async function uploadPhoto(tripId, file, caption = '', dayIndex = null) {
  try {
    const client = getClient();

    // Build a unique storage path
    const ext  = file.name.split('.').pop().toLowerCase();
    const path = `${tripId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    // Upload to storage
    const { error: uploadError } = await client.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadError) return { url: null, error: uploadError };

    // Get public URL
    const { data: urlData } = client.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(path);

    const publicUrl = urlData.publicUrl;

    // Insert row in photos table
    const { error: insertError } = await client
      .from('photos')
      .insert({
        trip_id: tripId,
        storage_path: path,
        public_url: publicUrl,
        caption,
        day_index: dayIndex
      });

    if (insertError) return { url: publicUrl, error: insertError };

    return { url: publicUrl, error: null };
  } catch (err) {
    return { url: null, error: err };
  }
}

/**
 * getPhotos(tripId)
 * Fetch all photos for a given trip, ordered by uploaded_at.
 * Returns { data, error }
 */
async function getPhotos(tripId) {
  try {
    const client = getClient();
    const { data, error } = await client
      .from('photos')
      .select('*')
      .eq('trip_id', tripId)
      .order('uploaded_at', { ascending: true });
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * deletePhoto(photoId, storagePath)
 * Remove a photo from Storage and delete its row from the photos table.
 * Returns { error }
 */
async function deletePhoto(photoId, storagePath) {
  try {
    const client = getClient();
    if (storagePath) {
      await client.storage.from(STORAGE_BUCKET).remove([storagePath]);
    }
    const { error } = await client.from('photos').delete().eq('id', photoId);
    return { error };
  } catch (err) {
    return { error: err };
  }
}

/**
 * deleteCoverPhoto(tripId, coverUrl)
 * Finds the photo row matching coverUrl for tripId, removes it from Storage
 * and the photos table. Used when replacing a trip's cover photo.
 */
async function deleteCoverPhoto(tripId, coverUrl) {
  try {
    const client = getClient();
    const { data: rows } = await client
      .from('photos')
      .select('id, storage_path')
      .eq('trip_id', tripId)
      .eq('public_url', coverUrl)
      .limit(1);
    if (rows && rows.length > 0) {
      const { id, storage_path } = rows[0];
      if (storage_path) await client.storage.from(STORAGE_BUCKET).remove([storage_path]);
      await client.from('photos').delete().eq('id', id);
    }
  } catch (err) {
    console.warn('[Storage] deleteCoverPhoto failed:', err.message);
  }
}

// ── Import / Export ──────────────────────────────────────────

/**
 * exportAllData()
 * Fetch all trips + photos and trigger a JSON download.
 */
async function exportAllData() {
  try {
    const client = getClient();

    const [{ data: trips, error: tripsErr }, { data: photos, error: photosErr }] =
      await Promise.all([
        client.from('trips').select('*').order('start_date', { ascending: false }),
        client.from('photos').select('*').order('uploaded_at', { ascending: true })
      ]);

    if (tripsErr) throw tripsErr;
    if (photosErr) throw photosErr;

    const exportObj = {
      exported_at: new Date().toISOString(),
      version: 1,
      trips: trips || [],
      photos: photos || []
    };

    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `loose-itinerary-export-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    return { error: null };
  } catch (err) {
    return { error: err };
  }
}

/**
 * importData(json)
 * Parse an exported JSON string and upsert all trips + photos.
 * Returns { tripsImported, photosImported, error }
 */
async function importData(json) {
  try {
    const client = getClient();
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;

    if (!parsed.trips || !Array.isArray(parsed.trips)) {
      throw new Error('Invalid export format — missing trips array.');
    }

    let tripsImported  = 0;
    let photosImported = 0;

    // Upsert trips
    if (parsed.trips.length > 0) {
      const { error } = await client
        .from('trips')
        .upsert(parsed.trips, { onConflict: 'slug' });
      if (error) throw error;
      tripsImported = parsed.trips.length;
    }

    // Upsert photos
    if (parsed.photos && parsed.photos.length > 0) {
      const { error } = await client
        .from('photos')
        .upsert(parsed.photos, { onConflict: 'id' });
      if (error) throw error;
      photosImported = parsed.photos.length;
    }

    return { tripsImported, photosImported, error: null };
  } catch (err) {
    return { tripsImported: 0, photosImported: 0, error: err };
  }
}
