const crypto = require("crypto");

exports.handler = async function (event, context) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed",
    };
  }

  const signatureFromWebflow = event.headers["x-webflow-signature"];
  const rawBody = event.body;
  const secret = process.env.AIRTABLE_WEBFLOW_WEBHOOK_KEY;

  if (!signatureFromWebflow || !rawBody) {
    console.warn("Missing signature or body");
    return {
      statusCode: 400,
      body: "Missing signature or body",
    };
  }

  // ✅ Compute signature as HEX (to match Webflow)
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  // ✅ Compare using timing-safe check
  const validSignature =
    expectedSignature.length === signatureFromWebflow.length &&
    crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "hex"),
      Buffer.from(signatureFromWebflow, "hex")
    );

  if (!validSignature) {
    console.warn("❌ Webhook signature invalid.");
    console.log("Expected:", expectedSignature);
    console.log("Received:", signatureFromWebflow);
    return {
      statusCode: 401,
      body: "Invalid signature",
    };
  }

  // ✅ Signature valid – parse body and handle event
  const payload = JSON.parse(rawBody);
  const eventType = payload.event;
  const formData = payload.data;

  console.log("✅ Webhook event:", eventType);
  console.log("📦 Form data:", formData);

  // You can now send formData to Airtable or process accordingly

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Webhook received and verified" }),
  };
};
