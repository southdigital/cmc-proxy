const crypto = require("crypto");

exports.handler = async function (event, context) {
  const clientSecret = process.env.WEBFLOW_CLIENT_SECRET;
  const airtableApiKey = process.env.AIRTABLE_API_KEY;
  const airtableBaseId = process.env.AIRTABLE_BASE_ID;
  const airtableTable = process.env.AIRTABLE_TABLE;

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
    // Step 1: Verify signature
    const signedData = `${timestamp}:${rawBody}`;
    const expectedSignature = crypto
      .createHmac("sha256", clientSecret)
      .update(signedData)
      .digest("hex");

    const validSignature =
      expectedSignature.length === signature.length &&
      crypto.timingSafeEqual(
        Buffer.from(expectedSignature, "hex"),
        Buffer.from(signature, "hex")
      );

    if (!validSignature) {
      console.warn("❌ Invalid signature");
      return {
        statusCode: 401,
        body: "Invalid signature",
      };
    }

    // Step 2: Check timestamp freshness (within 5 minutes)
    const now = Date.now();
    const requestTime = parseInt(timestamp, 10);
    if (isNaN(requestTime) || now - requestTime > 5 * 60 * 1000) {
      return {
        statusCode: 408,
        body: "Webhook request expired",
      };
    }

    // Step 3: Parse body
    const body = JSON.parse(rawBody);
    const formData = body?.payload?.data;

    if (!formData || !formData.recordid || !formData.email) {
      return {
        statusCode: 400,
        body: "Missing record ID or email in form data",
      };
    }

    const recordIdFromForm = formData.recordid;
    const emailToUpdate = formData["Email Address"];

    console.log("📦 Updating record with session ID:", recordIdFromForm);

    // Step 4: Find the Airtable record with matching session ID
    const findUrl = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(
      airtableTable
    )}?filterByFormula=${encodeURIComponent(`{Session ID} = "${recordIdFromForm}"`)}`;

    const findResponse = await fetch(findUrl, {
      headers: {
        Authorization: `Bearer ${airtableApiKey}`,
      },
    });

    const findResult = await findResponse.json();

    if (!findResult.records || findResult.records.length === 0) {
      return {
        statusCode: 404,
        body: "No record found with the provided session ID",
      };
    }

    const airtableRecordId = findResult.records[0].id;

    // Step 5: Update the record with the email
    const updateResponse = await fetch(
      `https://api.airtable.com/v0/${airtableBaseId}/${airtableTable}/${airtableRecordId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${airtableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            Email: emailToUpdate,
          },
        }),
      }
    );

    const updateResult = await updateResponse.json();

    if (!updateResponse.ok) {
      throw new Error(updateResult?.error?.message || "Failed to update Airtable");
    }

    console.log("✅ Email updated in Airtable:", updateResult);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Email updated in Airtable", recordId: airtableRecordId }),
    };
  } catch (err) {
    console.error("Error handling newsletter webhook:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
