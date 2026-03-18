export async function handler(event) {
  const { handle } = event.queryStringParameters;

  if (!handle) {
    return { statusCode: 400, body: "Missing handle parameter" };
  }

  try {
    // Step 1: Fetch the channel page to extract the real channel ID
    const pageRes = await fetch(`https://www.youtube.com/@${handle}`, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const html = await pageRes.text();

    // Channel ID is embedded in the page source
    const match = html.match(/"channelId":"(UC[\w-]+)"/);
    if (!match) throw new Error("Channel ID not found");
    const channelId = match[1];

    // Step 2: Fetch the RSS feed using the real channel ID
    const rssRes = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
    );
    const xml = await rssRes.text();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, max-age=900"
      },
      body: xml
    };
  } catch (err) {
    return { statusCode: 500, body: `Error: ${err.message}` };
  }
}
