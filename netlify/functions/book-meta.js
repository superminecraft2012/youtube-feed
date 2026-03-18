export async function handler(event) {
  const { title, author } = event.queryStringParameters || {};

  if (!title) {
    return { statusCode: 400, body: "Missing title" };
  }

  try {
    const q = encodeURIComponent(
      `intitle:${title}${author ? `+inauthor:${author}` : ""}`
    );
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1&langRestrict=en`
    );
    const data = await res.json();

    const volume = data.items?.[0]?.volumeInfo;
    if (!volume) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=2592000" },
        body: JSON.stringify(null),
      };
    }

    // Upgrade to HTTPS and get the largest available thumbnail
    let cover =
      volume.imageLinks?.extraLarge ||
      volume.imageLinks?.large ||
      volume.imageLinks?.medium ||
      volume.imageLinks?.thumbnail ||
      volume.imageLinks?.smallThumbnail ||
      null;

    if (cover) {
      cover = cover.replace(/^http:\/\//, "https://").replace(/&edge=curl/g, "");
      // Request a bigger image from Google's CDN
      cover = cover.replace(/zoom=\d/, "zoom=3");
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
