// netlify/functions/airtable-get-full.js
exports.handler = async function (event, context) {
  // ----- CORS allowlist (add staging domains if needed) -----
  const ALLOWED_ORIGINS = new Set([
    'https://ethicsmap.org',
    'http://ethicsmap.org',
    'https://www.ethicsmap.org',
    'http://www.ethicsmap.org',
    'https://ethicsmap.webflow.io/',
    'http://ethicsmap.webflow.io/',
    'https://www.ethicsmap.webflow.io/',
    'http://www.ethicsmap.webflow.io/',
  ]);

  // Handle CORS preflight quickly
  if (event.httpMethod === 'OPTIONS') {
    const reqOrigin = event.headers.origin || '';
    const allowOrigin = ALLOWED_ORIGINS.has(reqOrigin) ? reqOrigin : 'null';
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Vary': 'Origin',
      },
      body: '',
    };
  }

  // ----- Reject non-GET -----
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // ----- Basic origin/referrer enforcement (blocks direct or other sites) -----
  // Browsers will send an Origin for cross-origin fetches; we also accept same-origin fetches.
  const reqOrigin = event.headers.origin || '';
  const referrer = event.headers.referer || event.headers.referrer || '';

  function isAllowedByReferrer(ref) {
    try {
      if (!ref) return false;
      const u = new URL(ref);
      return ALLOWED_ORIGINS.has(`${u.protocol}//${u.host}`);
    } catch { return false; }
  }

  const allowed =
    (reqOrigin && ALLOWED_ORIGINS.has(reqOrigin)) ||
    isAllowedByReferrer(referrer);

  if (!allowed) {
    return {
      statusCode: 403,
      headers: {
        'Access-Control-Allow-Origin': 'null',
        'Content-Type': 'application/json',
        'Vary': 'Origin',
      },
      body: JSON.stringify({ error: 'Forbidden' }),
    };
  }

  // ----- Standard CORS headers for allowed origins -----
  const corsHeaders = {
    'Access-Control-Allow-Origin': reqOrigin || 'https://ethicsmap.org',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };

  // ----- Airtable env -----
  const apiKey   = process.env.AIRTABLE_API_KEY;
  const baseId   = process.env.AIRTABLE_BASE_ID;
  const table    = process.env.AIRTABLE_TABLE;

  if (!apiKey || !baseId || !table) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Missing Airtable env vars' }),
    };
  }

  // ----- Fetch ALL pages (pagination) -----
  const baseUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;
  const headers = { Authorization: `Bearer ${apiKey}` };

  const allRecords = [];
  let offset = undefined;
  let safetyCounter = 0; // guard against infinite loops

  try {
    do {
      const url = new URL(baseUrl);
      // Pull the maximum page size; Airtable caps at 100
      url.searchParams.set('pageSize', '100');
      if (offset) url.searchParams.set('offset', offset);

      const res = await fetch(url.toString(), { headers });
      if (!res.ok) {
        const errTxt = await res.text().catch(() => '');
        return {
          statusCode: res.status,
          headers: corsHeaders,
          body: JSON.stringify({ error: `Airtable error`, detail: errTxt }),
        };
      }

      const json = await res.json();
      if (Array.isArray(json.records)) {
        allRecords.push(...json.records);
      }
      offset = json.offset;

      safetyCounter++;
      if (safetyCounter > 500) {
        // extremely defensive; prevents runaway in rare API bugs
        break;
      }
    } while (offset);

    // Return the SAME structure as your original endpoint: array of records
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(allRecords),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
