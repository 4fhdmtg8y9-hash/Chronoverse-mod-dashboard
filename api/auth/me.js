export default async function handler(req, res) {
  const cookies = req.headers.cookie || "";

  const match = cookies.match(
    /discord_access_token=([^;]+)/
  );

  if (!match) {
    return res.status(401).json({
      error: "Not logged in."
    });
  }

  const accessToken = decodeURIComponent(match[1]);

  try {
    const response = await fetch(
      "https://discord.com/api/users/@me",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    if (!response.ok) {
      return res.status(401).json({
        error: "Discord session expired."
      });
    }

    const user = await response.json();

    return res.status(200).json({
      id: user.id,
      username: user.username,
      global_name: user.global_name || user.username,
      avatar: user.avatar
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Failed to retrieve Discord account."
    });
  }
}
