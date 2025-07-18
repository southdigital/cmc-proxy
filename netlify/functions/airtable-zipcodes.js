const fetch = require("node-fetch");

exports.handler = async function (event, context) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE;

  const airtableUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;

  try {
    // 1. Fetch records from Airtable
    const response = await fetch(airtableUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const data = await response.json();
    const records = data.records;

    // 2. Count how many times each ZIP appears
    const zipCounts = {};
    records.forEach(record => {
      const zip = record.fields?.Zipcode?.trim();
      if (zip) {
        zipCounts[zip] = (zipCounts[zip] || 0) + 1;
      }
    });

    // 3. Fetch coordinates for each ZIP
    const features = [];

    for (const zip in zipCounts) {
      try {
        const zipRes = await fetch(`http://api.zippopotam.us/us/${zip}`);
        if (!zipRes.ok) continue;

        const zipData = await zipRes.json();
        const place = zipData.places?.[0];

        if (place) {
          const coordinates = [
            parseFloat(place.longitude),
            parseFloat(place.latitude)
          ];

          const count = zipCounts[zip];

          // 4. Repeat the point based on how many times the ZIP appears
          for (let i = 0; i < count; i++) {
            features.push({
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates
              }
            });
          }
        }
      } catch (err) {
        console.error(`Error with ZIP ${zip}:`, err.message);
      }
    }

    // 5. Return GeoJSON
    const geojson = {
      type: "FeatureCollection",
      features,
    };

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(geojson),
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
