import sql from "../lib/db.js";

export default async function handler(req, res) {
  try {
    await sql`
      ALTER TABLE mod_actions
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending'
    `;

    await sql`
      ALTER TABLE mod_actions
      ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(30)
    `;

    await sql`
      ALTER TABLE mod_actions
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP
    `;

    await sql`
      ALTER TABLE mod_actions
      ADD COLUMN IF NOT EXISTS discord_message_id VARCHAR(30)
    `;

    await sql`
      ALTER TABLE mod_actions
      ADD COLUMN IF NOT EXISTS discord_channel_id VARCHAR(30)
    `;

    return res.status(200).json({
      success: true,
      message: "Moderation approval system database updated."
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
