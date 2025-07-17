const crypto = require("crypto");

exports.handler = async function (event, context) {
  console.log("Webhook received!");
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed",
    };
  }

  const secret = process.env.AIRTABLE_WEBFLOW_WEBHOOK_KEY;
  const signatureFromWebflow = event.headers["x-webflow-signature"];
  const rawBody = event.body;

  if (!signatureFromWebflow || !rawBody) {
    return {
      statusCode: 400,
      body: "Missing signature or body",
    };
  }

  // Step 1: Compute expected signature
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(rawBody, "utf8");
  const expectedSignature = hmac.digest("base64");

  const receivedBuffer = Buffer.from(signatureFromWebflow, "base64");
  const expectedBuffer = Buffer.from(expectedSignature, "base64");

  // Step 2: Safely compare signatures only if length matches
  const signaturesMatch =
    receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer);

  if (!signaturesMatch) {
    console.log("❌ Webhook signature invalid.");
    return {
      statusCode: 401,
      body: "Invalid signature",
    };
  }

  // ✅ Signature is valid
  const parsed = JSON.parse(rawBody);
  console.log("✅ Verified Webflow Webhook:", parsed);

  return {
    statusCode: 200,
    body: "Webhook received and verified",
  };
};
