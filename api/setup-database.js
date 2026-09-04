import sql from "../lib/db.js";

export default async function handler(req, res) {
  try {

    // =========================
    // MODERATORS
    // =========================

    await sql`
      CREATE TABLE IF NOT EXISTS moderators (
        id SERIAL PRIMARY KEY,
        discord_id VARCHAR(30) UNIQUE NOT NULL,
        username VARCHAR(100) NOT NULL,
        avatar_url TEXT,
        points INTEGER DEFAULT 0,
        approved_actions INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;


    // =========================
    // MODERATION ACTIONS
    // =========================

    await sql`
      CREATE TABLE IF NOT EXISTS mod_actions (
        id SERIAL PRIMARY KEY,
        moderator_id INTEGER REFERENCES moderators(id)
          ON DELETE CASCADE,

        action_type VARCHAR(30) NOT NULL,

        target_discord_id VARCHAR(30),

        reason TEXT,

        case_id VARCHAR(50),

        status VARCHAR(20) DEFAULT 'pending',

        reviewed_by VARCHAR(30),

        reviewed_at TIMESTAMP,

        discord_message_id VARCHAR(30),

        discord_channel_id VARCHAR(30),

        points_awarded INTEGER DEFAULT 0,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;


    // =========================
    // REQUESTS
    // =========================

    await sql`
      CREATE TABLE IF NOT EXISTS requests (
        id SERIAL PRIMARY KEY,

        type VARCHAR(30) NOT NULL,

        discord_user_id VARCHAR(30) NOT NULL,

        username VARCHAR(100),

        reason TEXT,

        status VARCHAR(20) DEFAULT 'pending',

        reviewed_by VARCHAR(30),

        reviewed_at TIMESTAMP,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;


    // =========================
    // INACTIVITY NOTICES
    // =========================

    await sql`
      CREATE TABLE IF NOT EXISTS inactivity_notices (
        id SERIAL PRIMARY KEY,

        discord_user_id VARCHAR(30) NOT NULL,

        username VARCHAR(100),

        reason TEXT NOT NULL,

        start_date DATE,

        end_date DATE,

        status VARCHAR(20) DEFAULT 'pending',

        reviewed_by VARCHAR(30),

        reviewed_at TIMESTAMP,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;


    // =========================
    // ADD MISSING COLUMNS
    // =========================

    await sql`
      ALTER TABLE moderators
      ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0
    `;

    await sql`
      ALTER TABLE moderators
      ADD COLUMN IF NOT EXISTS approved_actions INTEGER DEFAULT 0
    `;

    await sql`
      ALTER TABLE mod_actions
      ADD COLUMN IF NOT EXISTS status VARCHAR(20)
      DEFAULT 'pending'
    `;

    await sql`
      ALTER TABLE mod_actions
      ADD COLUMN IF NOT EXISTS case_id VARCHAR(50)
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

    await sql`
      ALTER TABLE mod_actions
      ADD COLUMN IF NOT EXISTS points_awarded INTEGER DEFAULT 0
    `;


    return res.status(200).json({
      success: true,
      message:
        "Chronoverse database updated successfully."
    });

  } catch (error) {

    console.error(
      "DATABASE SETUP ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "Database setup failed."
    });
  }
}
