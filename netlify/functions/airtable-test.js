// netlify/functions/airtable-test.js
exports.handler = async function (event) {
  // read + trim env
  const FIELD_LAT   = (process.env.AIRTABLE_FIELD_LAT   || "lat").trim();
  const FIELD_LNG   = (process.env.AIRTABLE_FIELD_LNG   || "lng").trim();
  const FIELD_TITLE = (process.env.AIRTABLE_FIELD_TITLE || "City").trim();

  const apiKeyRaw = process.env.AIRTABLE_API_KEY || "";
  const baseIdRaw = process.env.AIRTABLE_BASE_ID || "";
  const tableRaw  = process.env.AIRTABLE_TABLE   || "";

  const apiKey = apiKeyRaw.trim();
  const baseId = baseIdRaw.trim();
  const table  = tableRaw.trim();

  // allow tiny overrides via query (no token override for safety)
  const qs = new URLSearchParams(event?.rawQuery || "");
  const limit = Math.max(1, Math.min(100, Number(qs.get("limit") || 5)));
  const useFields = qs.get("fields") !== "false"; // ?fields=false to disable
  const withHeaders = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

  // early check
  if (!apiKey || !baseId || !table) {
    return {
      statusCode: 200,
      headers: withHeaders,
      body: JSON.stringify({
        ok: false,
        reason: "Missing required env vars",
        expected: ["AIRTABLE_API_KEY", "AIRTABLE_BASE_ID", "AIRTABLE_TABLE"],
        snapshot: {
          AIRTABLE_API_KEY_present: Boolean(apiKeyRaw),
          AIRTABLE_BASE_ID_len: baseIdRaw.length,
          AIRTABLE_TABLE_len: tableRaw.length,
          AIRTABLE_BASE_ID_raw: JSON.stringify(baseIdRaw),
          AIRTABLE_TABLE_raw: JSON.stringify(tableRaw),
        },
      }),
    };
  }

  const tokenTail = apiKey.slice(-6);
  const tableEncoded = encodeURIComponent(table);

  // base URL
  const baseUrl = `https://api.airtable.com/v0/${baseId}/${tableEncoded}`;

  // optional fields filter (keeps payloads small, mirrors your prod code)
  const params = new URLSearchParams();
  params.set("pageSize", String(limit));
  if (useFields) {
    [FIELD_LAT, FIELD_LNG, FIELD_TITLE].forEach((f) => params.append("fields[]", f));
  }

  const testUrl = `${baseUrl}?${params.toString()}`;
  const headers = { Authorization: `Bearer ${apiKey}` };

  // perform the call, but never throw—always return a diagnostic JSON
  let status = null;
  let bodyText = null;
  let bodyJson = null;
  let errMsg = null;
  let respHeaders = {};

  try {
    const res = await fetch(testUrl, { headers });
    status = res.status;
    // capture a few response headers that help debugging
    ["content-type", "airtable-application-id", "airtable-content-length"].forEach((h) => {
      const v = res.headers.get(h);
      if (v != null) respHeaders[h] = v;
    });

    // try json first; fall back to text
    const ctype = res.headers.get("content-type") || "";
    if (ctype.includes("application/json")) {
      bodyJson = await res.json();
    } else {
      bodyText = await res.text();
    }
  } catch (e) {
    errMsg = String(e && e.message ? e.message : e);
  }

  // Summarize any Airtable error blob for easier reading
  let airtableErrorSummary = null;
  if (bodyJson && bodyJson.error) {
    airtableErrorSummary = {
      type: bodyJson.error.type,
      message: bodyJson.error.message,
    };
  } else if (bodyText && bodyText.length) {
    airtableErrorSummary = bodyText.slice(0, 500);
  }

  return {
    statusCode: 200,
    headers: withHeaders,
    body: JSON.stringify({
      ok: status === 200,
      request: {
        method: "GET",
        url: testUrl,
        note: "This mirrors the production /v0/{baseId}/{table} List Records call.",
      },
      env_snapshot: {
        FIELD_LAT,
        FIELD_LNG,
        FIELD_TITLE,
        AIRTABLE_BASE_ID_len: baseId.length,
        AIRTABLE_TABLE_len: table.length,
        AIRTABLE_BASE_ID_raw: JSON.stringify(baseIdRaw), // shows hidden whitespace
        AIRTABLE_TABLE_raw: JSON.stringify(tableRaw),
        AIRTABLE_API_KEY_present: Boolean(apiKey),
        AIRTABLE_API_KEY_tail: tokenTail,
      },
      response: {
        status,
        headers: respHeaders,
        sample_json: bodyJson && bodyJson.records ? {
          records_count: Array.isArray(bodyJson.records) ? bodyJson.records.length : null,
          first_record_fields: bodyJson.records?.[0]?.fields || null,
          has_offset: Boolean(bodyJson.offset),
        } : null,
        sample_text: bodyText ? bodyText.slice(0, 500) : null,
        airtable_error_summary: airtableErrorSummary,
      },
      error: errMsg,
      tips: [
        "Ensure AIRTABLE_API_KEY is a PAT that has data.records:read and access to this base.",
        "Prefer AIRTABLE_TABLE to be the tblXXXXXXXX… ID to avoid name/encoding mismatches.",
        "Watch for trailing spaces in env vars—see *_raw fields above.",
      ],
    }),
  };
};
