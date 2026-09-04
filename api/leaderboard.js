import sql from "../lib/db.js";

export const runtime = "nodejs";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const moderators = await sql`
      SELECT
        id,
        discord_id,
        username,
        points,
        approved_actions
      FROM moderators
      ORDER BY
        COALESCE(points, 0) DESC,
        COALESCE(approved_actions, 0) DESC
    `;

    return res.status(200).json({
      success: true,
      leaderboard: moderators,
    });
  } catch (error) {
    console.error(
      "LEADERBOARD ERROR:",
      error?.message || String(error)
    );

    return res.status(500).json({
      success: false,
      error: "Failed to load leaderboard",
    });
  }
}
