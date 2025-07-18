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
    // ✅ Verify signature
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

    // ✅ Check timestamp freshness (within 5 minutes)
    const now = Date.now();
    const requestTime = parseInt(timestamp, 10);

    if (isNaN(requestTime) || now - requestTime > 5 * 60 * 1000) {
      return {
        statusCode: 408,
        body: "Webhook request expired",
      };
    }

    // ✅ Parse webhook payload
    const body = JSON.parse(rawBody);


    console.log("📦 Raw Webhook Payload:", body);

    const formData = body?.payload?.data;

    console.log("✅ Webflow verified:", formData);


    if (formData.recordid) {
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

    } else {
      // ✅ Map Webflow fields to Airtable fields (ensure they match exactly)

      const zipCode = formData.zipcode;
      let city = "";

      try {
        const response = await fetch(`https://api.zippopotam.us/us/${zipCode}`);
        if (response.ok) {
          const data = await response.json();
          city = data.places[0]['place name'];
        } else {
          console.warn("ZIP code not found, proceeding without city");
        }
      } catch (error) {
        console.error("Error fetching city:", error.message);
      }

      const airtableFields = {
        "Zipcode": zipCode,
        "Do you believe animals deserve stronger protection laws?": formData["Do you believe animals deserve stronger protection laws?"],
        "Which issue do you care about most?": formData["Which issue do you care about most?"],
        "Which issue do you care about most? (Please specify)": formData["Which issue do you care about most? Please specify"],
        "Session ID": formData.sessionid,
        "City": city,
      };

      const url = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(airtableTable)}`;

      const airtableResponse = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${airtableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields: airtableFields }),
      });

      const result = await airtableResponse.json();

      if (!airtableResponse.ok) {
        throw new Error(result?.error?.message || "Unknown Airtable error");
      }

      console.log("✅ Sent to Airtable:", result);

      return {
        statusCode: 200,
        body: JSON.stringify({ message: "Webhook verified and data stored in Airtable" }),
      };
    }
  } catch (err) {
    console.error("Error handling webhook:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
