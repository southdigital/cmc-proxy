exports.handler = async function (event, context) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed",
    };
  }

  try {
    const body = JSON.parse(event.body);

    console.log("Received Webflow webhook:", body);

    // Map and send to Airtable (same as before)
    const mappedFields = {
      "Email": body.data.email,
      "Zipcode": body.data.zipcode,
      "City": body.data.city,
      "Do you believe animals deserve stronger protection laws?": body.data["question1"],
      "Which issue do you care about most?": body.data["question2"],
    };

    // Send to Airtable (code omitted here — same as your existing POST logic)

    return {
      statusCode: 200,
      body: "Webhook received",
    };
  } catch (err) {
    console.error("Webhook Error:", err.message);
    return {
      statusCode: 500,
      body: "Server Error",
    };
  }
};
