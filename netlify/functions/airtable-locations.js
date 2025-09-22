// netlify/functions/airtable-locations.js
exports.handler = async function (event) {
  // Read + trim envs (catch invisible whitespace issues)
  const FIELD_LAT   = (process.env.AIRTABLE_FIELD_LAT   || "lat").trim();
  const FIELD_LNG   = (process.env.AIRTABLE_FIELD_LNG   || "lng").trim();
  const FIELD_TITLE = (process.env.AIRTABLE_FIELD_TITLE || "City").trim();

  const apiKey = (process.env.AIRTABLE_API_KEY || "").trim();
  const baseId = (process.env.AIRTABLE_BASE_ID || "").trim();
  const table  = (process.env.AIRTABLE_TABLE   || "").trim();

  const headersBase = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  if (!apiKey || !baseId || !table) {
    return resp(500, {
      error: "Missing env vars. Expect AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE",
      env_snapshot: {
        AIRTABLE_API_KEY_present: Boolean(apiKey),
        AIRTABLE_BASE_ID_len: baseId.length,
        AIRTABLE_TABLE_len: table.length,
        AIRTABLE_BASE_ID_raw: JSON.stringify(process.env.AIRTABLE_BASE_ID || ""),
        AIRTABLE_TABLE_raw: JSON.stringify(process.env.AIRTABLE_TABLE || ""),
      },
    });
  }

  const authHeaders = { Authorization: `Bearer ${apiKey}` };

  // Build base URL and default fields filter (reduces payload and matches your schema)
  const baseUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;
  const params = new URLSearchParams();
  [FIELD_LAT, FIELD_LNG, FIELD_TITLE].forEach((f) => params.append("fields[]", f));
  // Optional: allow pageSize override via query (?pageSize=50) for debugging
  const qs = new URLSearchParams(event?.rawQuery || "");
  const pageSize = Math.max(1, Math.min(100, Number(qs.get("pageSize") || 100)));
  params.set("pageSize", String(pageSize));

  let url = `${baseUrl}?${params.toString()}`;
  const allRecords = [];
  let safetyCounter = 0;

  try {
    while (url && safetyCounter < 100) {
      const res = await fetch(url, { headers: authHeaders });
      const ctype = res.headers.get("content-type") || "";

      // Capture both JSON and text bodies for better debugging
      let body;
      if (ctype.includes("application/json")) {
        body = await res.json();
      } else {
        body = await res.text();
      }

      if (!res.ok) {
        // Bubble up Airtable's exact status + error payload so we can see 403/422/etc.
        return resp(res.status, {
          error: "Airtable request failed",
          details: typeof body === "string" ? body : body?.error || body,
          debug: {
            attempted_url: url,
            baseId,
            table_raw: JSON.stringify(process.env.AIRTABLE_TABLE || ""),
            table_encoded: encodeURIComponent(table),
            field_keys: { FIELD_LAT, FIELD_LNG, FIELD_TITLE },
          },
        });
      }

      // Normal happy path
      const json = typeof body === "string" ? JSON.parse(body) : body;
      allRecords.push(...(json.records || []));

      // Preserve the same base query params when paginating
      if (json.offset) {
        const next = new URL(baseUrl);
        next.search = params.toString();
        next.searchParams.set("offset", json.offset);
        url = next.toString();
      } else {
        url = null;
      }

      safetyCounter++;
    }

    // Convert to GeoJSON
    const features = [];
    for (const rec of allRecords) {
      const lat = Number(rec.fields?.[FIELD_LAT]);
      const lng = Number(rec.fields?.[FIELD_LNG]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng, lat] }, // Mapbox expects [lng, lat]
        properties: {
          id: rec.id,
          title: rec.fields?.[FIELD_TITLE] || "",
        },
      });
    }

    return {
      statusCode: 200,
      headers: {
        ...headersBase,
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
      body: JSON.stringify({ type: "FeatureCollection", features }),
    };
  } catch (err) {
    // Catch network/parse errors and include context
    return resp(500, {
      error: (err && err.message) || String(err),
      debug: {
        baseId,
        table_raw: JSON.stringify(process.env.AIRTABLE_TABLE || ""),
        initial_url: `${baseUrl}?${params.toString()}`,
      },
    });
  }

  function resp(status, bodyObj) {
    return {
      statusCode: status,
      headers: headersBase,
      body: JSON.stringify(bodyObj),
    };
  }
};
