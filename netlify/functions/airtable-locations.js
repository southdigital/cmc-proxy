// netlify/functions/airtable-locations.js
exports.handler = async function () {
  // 🌟 Customize these to match your Airtable schema
  const FIELD_LAT = process.env.AIRTABLE_FIELD_LAT || "lat";
  const FIELD_LNG = process.env.AIRTABLE_FIELD_LNG || "lng";
  const FIELD_TITLE = process.env.AIRTABLE_FIELD_TITLE || "City"; // optional, for popup/labels

  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE;

  if (!apiKey || !baseId || !tableName) {
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error:
          "Missing env vars. Expect AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE",
      }),
    };
  }

  const baseUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(
    tableName
  )}`;

  const headers = {
    Authorization: `Bearer ${apiKey}`,
  };

  const allRecords = [];
  let url = baseUrl;
  let safetyCounter = 0;

  try {
    // 🔁 Fetch all pages
    while (url && safetyCounter < 100) {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Airtable error ${res.status}: ${text}`);
      }

      const json = await res.json();
      allRecords.push(...(json.records || []));

      // Airtable pagination
      if (json.offset) {
        const sep = url.includes("?") ? "&" : "?";
        url = `${baseUrl}${sep}offset=${json.offset}`;
      } else {
        url = null;
      }

      safetyCounter++;
    }

    // ➡️ Convert to GeoJSON features
    const features = [];
    for (const rec of allRecords) {
      const latRaw = rec.fields?.[FIELD_LAT];
      const lngRaw = rec.fields?.[FIELD_LNG];

      if (latRaw == null || lngRaw == null) continue;

      const lat = Number(latRaw);
      const lng = Number(lngRaw);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      // Mapbox expects [lng, lat]
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng, lat] },
        properties: {
          id: rec.id,
          title: rec.fields?.[FIELD_TITLE] || "",
          // Include everything if you want
          // ...rec.fields
        },
      });
    }

    const geojson = { type: "FeatureCollection", features };

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
        // Optional: cache at the edge for a bit
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
      body: JSON.stringify(geojson),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};


