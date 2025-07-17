const querystring = require("querystring");

exports.handler = async function (event, context) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: "Method Not Allowed" }),
    };
  }

  try {
    // Parse form data sent from Webflow (URL-encoded)
    const rawBody = querystring.parse(event.body);

    // Log incoming Webflow data (view in Netlify dashboard > Functions > airtable-post)
    console.log("Webflow Form Data:", rawBody);

    // Map Webflow field names to exact Airtable field names
    const mappedFields = {
      "Email": rawBody.email,
      "Zipcode": rawBody.zipcode,
      "City": rawBody.city,
      "Do you believe animals deserve stronger protection laws?": rawBody["question-1"],
      "Which issue do you care about most?": rawBody["question-2"]
    };

    const airtableApiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;
    const tableName = process.env.AIRTABLE_TABLE;

    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${airtableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: mappedFields }),
    });

    const result = await response.json();

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error("Error:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Server Error", error: err.message }),
    };
  }
};
