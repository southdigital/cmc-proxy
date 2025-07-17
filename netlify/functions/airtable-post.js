const querystring = require("querystring");

exports.handler = async function (event, context) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: "Method Not Allowed" }),
    };
  }

  try {
    const rawBody = querystring.parse(event.body);

    const mappedFields = {
      "Zipcode": rawBody.zipcode,
      "Do you believe animals deserve stronger protection laws?": rawBody["Do-you-believe-animals-deserve-stronger-protection-laws"],
      "Which issue do you care about most?": rawBody["Which-issue-do-you-care-about-most"],
      // Optional: include the optional open-text field if you want
      "Which issue do you care about most? (Please specify)": rawBody["Which-issue-do-you-care-about-most-Please-specify"],
      // "Email": rawBody.email, // uncomment if you add an email field to your form
      // "City": rawBody.city,   // uncomment if you add a city field
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
