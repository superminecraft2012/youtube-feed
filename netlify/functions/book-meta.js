export async function handler(event) {
  const { title, author } = event.queryStringParameters || {};

  if (!title) {
    return { statusCode: 400, body: "Missing title" };
  }

  try {
    // Try with author first; fall back to title-only if no results
    const queries = author
      ? [`intitle:${title}+inauthor:${author}`, `intitle:${title}`]
      : [`intitle:${title}`];

    let volume = null;
    for (const q of queries) {
      const res  = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=1`
      );
      const data = await res.json();
      volume = data.items?.[0]?.volumeInfo;
      if (volume) break;
    }

    if (!volume) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" },
        body: JSON.stringify(null),
      };
    }

    // thumbnail is the most reliably available size; zoom=1 is stable
    let cover = volume.imageLinks?.thumbnail || volume.imageLinks?.smallThumbnail || null;

    if (cover) {
      // Upgrade to HTTPS and strip the curl border effect
      cover = cover.replace(/^http:\/\//, "https://").replace(/&edge=curl/g, "");
      // zoom=1 → zoom=2 gives a larger image without breaking the URL
      cover = cover.replace(/zoom=1/, "zoom=2");
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=2592000", // cache 30 days at CDN
      },
      body: JSON.stringify({
        cover,
        description: volume.description || null,
        fetchedAt: Date.now(),
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: `Error: ${err.message}` };
  }
}
