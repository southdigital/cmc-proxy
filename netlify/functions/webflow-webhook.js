const crypto = require("crypto");

exports.handler = async function (event, context) {

  console.log("Webhook received");

  const clientSecret = process.env.WEBFLOW_CLIENT_SECRET;

  const signature = event.headers["x-webflow-signature"];
  const timestamp = event.headers["x-webflow-timestamp"];
  const rawBody = event.body;

  if (!signature || !timestamp || !rawBody) {
    return {
      statusCode: 400,
      body: "Missing signature, timestamp, or body",
    };
  }

  try {
    // Step 1: Recreate the signed data string
    const signedData = `${timestamp}:${rawBody}`;

    // Step 2: Create HMAC using client secret
    const expectedSignature = crypto
      .createHmac("sha256", clientSecret)
      .update(signedData)
      .digest("hex");

    // Step 3: Validate signature securely
    const validSignature =
      expectedSignature.length === signature.length &&
      crypto.timingSafeEqual(
        Buffer.from(expectedSignature, "hex"),
        Buffer.from(signature, "hex")
      );

    if (!validSignature) {
      console.warn("❌ Invalid signature");
      console.log("Expected:", expectedSignature);
      console.log("Received:", signature);
      return {
        statusCode: 401,
        body: "Invalid signature",
      };
    }

    // Step 4: Validate timestamp (within 5 minutes)
    const now = Date.now();
    const requestTime = parseInt(timestamp, 10);

    if (isNaN(requestTime) || now - requestTime > 5 * 60 * 1000) {
      return {
        statusCode: 408,
        body: "Webhook request expired",
      };
    }

    // ✅ Signature and timestamp are valid — parse payload
    const payload = JSON.parse(rawBody);
    console.log("✅ Webhook verified:", payload);

    // You can now forward to Airtable or handle accordingly

    return {
      statusCode: 200,
      body: "Webhook received and verified",
    };
  } catch (err) {
    console.error("Webhook processing error:", err.message);
    return {
      statusCode: 500,
      body: "Internal Server Error",
    };
  }
};
