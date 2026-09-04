import sql from "../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
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
    const discordResponse = await fetch(
      "https://discord.com/api/users/@me",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    if (!discordResponse.ok) {
      return res.status(401).json({
        error: "Your Discord session has expired."
      });
    }

    const moderator =
      await discordResponse.json();

    const actions = await sql`
      SELECT
        ma.id,
        ma.action_type,
        ma.target_discord_id,
        ma.reason,
        ma.case_id,
        ma.created_at
      FROM mod_actions ma
      JOIN moderators m
        ON ma.moderator_id = m.id
      WHERE m.discord_id = ${moderator.id}
      ORDER BY ma.created_at DESC
    `;

    return res.status(200).json({
      success: true,
      actions
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error: "Unable to load moderation history."
    });
  }
}
