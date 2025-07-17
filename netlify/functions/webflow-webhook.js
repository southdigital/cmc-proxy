const crypto = require("crypto");

exports.handler = async function (event, context) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed",
    };
  }

  const secret = process.env.AIRTABLE_WEBFLOW_WEBHOOK_KEY;
  const signatureFromWebflow = event.headers["x-webflow-signature"];
  const rawBody = event.body; // Webflow signs the raw string, not parsed JSON

  // Step 1: Compute HMAC SHA256 of raw body using your webhook secret
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(rawBody, "utf8");
  const expectedSignature = hmac.digest("base64");

  // Step 2: Compare with signature from Webflow
  const signaturesMatch = crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signatureFromWebflow || "")
  );

  if (!signaturesMatch) {
    console.warn("⚠️ Invalid webhook signature.");
    return {
      statusCode: 401,
      body: "Invalid signature",
    };
  }

  // ✅ Signature is valid — now parse and handle the webhook
  const body = JSON.parse(rawBody);
  console.log("✅ Verified Webflow Webhook:", body);

  // Now send data to Airtable or process it as needed...

  return {
    statusCode: 200,
    body: "Webhook received and verified",
  };
};
