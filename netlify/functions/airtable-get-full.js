// netlify/functions/airtable-get-full.js
exports.handler = async function (event, context) {
  // ---- Helpers ----
  const normOrigin = (o) => {
    try {
      if (!o) return '';
      const u = new URL(o);
      return `${u.protocol}//${u.host}`; // no trailing slash, no path
    } catch {
      return '';
    }
  };

  // ---- CORS allowlist (NO trailing slashes) ----
  const ALLOWED = new Set([
    'https://ethicsmap.org',
    'http://ethicsmap.org',
    'https://www.ethicsmap.org',
    'http://www.ethicsmap.org',
    'https://ethicsmap.webflow.io',
    'http://ethicsmap.webflow.io',
    'https://www.ethicsmap.webflow.io',
    'http://www.ethicsmap.webflow.io',
  ]);

  const reqOriginRaw = event.headers.origin || event.headers.Origin || '';
  const reqOrigin = normOrigin(reqOriginRaw);

  const refRaw = event.headers.referer || event.headers.referrer || '';
  const refOk = (() => {
    try {
      if (!refRaw) return false;
      const u = new URL(refRaw);
      return ALLOWED.has(`${u.protocol}//${u.host}`);
    } catch {
      return false;
    }
  })();

  const isAllowed = (reqOrigin && ALLOWED.has(reqOrigin)) || refOk;

  // ---- Handle CORS preflight quickly ----
  if (event.httpMethod === 'OPTIONS') {
    if (!isAllowed) {
      // Not allowed: fail cleanly without CORS headers so the browser doesn't "helpfully" cache bad CORS
      return { statusCode: 403, body: '' };
    }
    const allowReqHeaders =
      event.headers['access-control-request-headers'] ||
      event.headers['Access-Control-Request-Headers'] ||
      'Content-Type,Authorization';

    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': reqOrigin,       // echo the requester
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': allowReqHeaders,
        'Access-Control-Max-Age': '86400',              // cache preflight for 24h
        'Vary': 'Origin',
      },
      body: '',
    };
  }

  // ---- Reject non-GET ----
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // ---- Enforce origin/referrer ----
  if (!isAllowed) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  // ---- Standard CORS headers for allowed origins ----
  const corsHeaders = {
    'Access-Control-Allow-Origin': reqOrigin, // echo exact origin
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };

  // ---- Airtable env ----
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_TABLE;

  if (!apiKey || !baseId || !table) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Missing Airtable env vars' }),
    };
  }

  // ---- Fetch ALL pages (pagination) ----
  const baseUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;
  const headers = { Authorization: `Bearer ${apiKey}` };

  const allRecords = [];
  let offset;
  let safetyCounter = 0;

  try {
    do {
      const url = new URL(baseUrl);
      url.searchParams.set('pageSize', '100');
      if (offset) url.searchParams.set('offset', offset);

      const res = await fetch(url.toString(), { headers });
      if (!res.ok) {
        const errTxt = await res.text().catch(() => '');
        return {
          statusCode: res.status,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Airtable error', detail: errTxt }),
        };
      }

      const json = await res.json();
      if (Array.isArray(json.records)) allRecords.push(...json.records);
      offset = json.offset;

      if (++safetyCounter > 500) break;
    } while (offset);

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
