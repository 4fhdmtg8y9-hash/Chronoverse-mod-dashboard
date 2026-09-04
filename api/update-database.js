import sql from "../lib/db.js";

export default async function handler(req, res) {
  try {
    await sql`
      ALTER TABLE mod_actions
      ADD COLUMN IF NOT EXISTS case_id VARCHAR(30) UNIQUE
    `;

    return res.status(200).json({
      success: true,
      message: "Database updated successfully."
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
