import sql from "../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  const cookies = req.headers.cookie || "";

  const tokenMatch = cookies.match(
    /discord_access_token=([^;]+)/
  );

  if (!tokenMatch) {
    return res.status(401).json({
      error: "You are not logged in."
    });
  }

  const accessToken =
    decodeURIComponent(tokenMatch[1]);

  try {
    const userResponse = await fetch(
      "https://discord.com/api/users/@me",
      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`
        }
      }
    );

    if (!userResponse.ok) {
      return res.status(401).json({
        error: "Your Discord session has expired."
      });
    }

    const user =
      await userResponse.json();

    const {
      type,
      discordUserId,
      username,
      reason
    } = req.body || {};

    if (!type || !discordUserId || !reason) {
      return res.status(400).json({
        error:
          "Request type, Discord user ID, and reason are required."
      });
    }

    const result = await sql`
      INSERT INTO requests (
        type,
        discord_user_id,
        username,
        reason,
        status
      )
      VALUES (
        ${type},
        ${discordUserId},
        ${username || null},
        ${reason},
        'pending'
      )
      RETURNING id, type, discord_user_id, username, reason, status, created_at
    `;

    return res.status(200).json({
      success: true,
      request: result[0],
      submittedBy: user.username
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error:
        "Unable to create the request."
    });
  }
}
