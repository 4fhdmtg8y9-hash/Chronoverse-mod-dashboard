import crypto from "crypto";

export const runtime = "nodejs";

export const config = {
  api: {
    bodyParser: false
  }
};

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

const ALLOWED_ROLES = [
  "1538324425546666114",
  "1538505102644740167",
  "1543383003445723159",
  "1538626569831055390",
  "1538626890649174170",
  "1538534696483426365",
  "1538569564340879420",
  "1538569917471916083"
];

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function verifyDiscordRequest(rawBody, signature, timestamp) {
  try {
    if (!PUBLIC_KEY) return false;

    const publicKeyDer = Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      Buffer.from(PUBLIC_KEY, "hex")
    ]);

    const publicKey = crypto.createPublicKey({
      key: publicKeyDer,
      format: "der",
      type: "spki"
    });

    return crypto.verify(
      null,
      Buffer.from(timestamp + rawBody.toString()),
      publicKey,
      Buffer.from(signature, "hex")
    );

  } catch (error) {
    console.error("Discord verification error:", error);
    return false;
  }
}

export default async function handler(req, res) {

  // Browser test
  if (req.method !== "POST") {
    return res.status(200).json({
      status: "Discord interactions endpoint is online."
    });
  }

  if (!PUBLIC_KEY) {
    return res.status(500).json({
      error: "DISCORD_PUBLIC_KEY is missing."
    });
  }

  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];

  if (!signature || !timestamp) {
    return res.status(401).json({
      error: "Missing Discord signature."
    });
  }

  const rawBody = await getRawBody(req);

  if (!verifyDiscordRequest(
    rawBody,
    signature,
    timestamp
  )) {
    return res.status(401).json({
      error: "Invalid Discord signature."
    });
  }

  let interaction;

  try {
    interaction = JSON.parse(rawBody.toString());
  } catch {
    return res.status(400).json({
      error: "Invalid JSON."
    });
  }

  // Discord verification ping
  if (interaction.type === 1) {
    return res.status(200).json({
      type: 1
    });
  }

  // Only button interactions
  if (
    interaction.type !== 3 ||
    !interaction.data ||
    !interaction.data.custom_id
  ) {
    return res.status(400).json({
      error: "Unsupported Discord interaction."
    });
  }

  const customId = interaction.data.custom_id;

  if (!customId.startsWith("mod_")) {
    return res.status(400).json({
      error: "Unknown moderation button."
    });
  }

  const parts = customId.split("_");

  const decision = parts[1];
  const actionId = parts[2];

  if (
    !["approve", "deny"].includes(decision) ||
    !actionId
  ) {
    return res.status(400).json({
      error: "Invalid moderation button."
    });
  }

  const member = interaction.member;

  if (!member || !member.roles) {
    return res.status(200).json({
      type: 4,
      data: {
        content: "❌ Moderator information unavailable.",
        flags: 64
      }
    });
  }

  const hasPermission = member.roles.some(roleId =>
    ALLOWED_ROLES.includes(roleId)
  );

  if (!hasPermission) {
    return res.status(200).json({
      type: 4,
      data: {
        content:
          "❌ You do not have permission to review moderation logs.",
        flags: 64
      }
    });
  }

  /*
   * ACKNOWLEDGE IMMEDIATELY
   */
  res.status(200).json({
    type: 6
  });

  /*
   * PROCESS AFTER ACKNOWLEDGEMENT
   */

  try {

    const { default: sql } =
      await import("../lib/db.js");

    /*
     * Make sure the database columns exist.
     */

    await sql`
      ALTER TABLE mod_actions
      ADD COLUMN IF NOT EXISTS status VARCHAR(20)
      DEFAULT 'pending'
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
      ADD COLUMN IF NOT EXISTS case_id VARCHAR(30)
    `;

    /*
     * Find the moderation action.
     */

    const rows = await sql`
      SELECT
        ma.id,
        ma.status,
        ma.action_type,
        ma.target_discord_id,
        ma.reason,
        ma.case_id,
        ma.discord_message_id,
        ma.discord_channel_id,
        m.username AS moderator_username
      FROM mod_actions ma
      JOIN moderators m
        ON ma.moderator_id = m.id
      WHERE ma.id = ${actionId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      console.error(
        "Moderation action not found:",
        actionId
      );

      return;
    }

    const action = rows[0];

    /*
     * Don't allow a case to be reviewed twice.
     */

    if (action.status !== "pending") {
      console.log(
        `Case ${actionId} already ${action.status}`
      );

      return;
    }

    const newStatus =
      decision === "approve"
        ? "approved"
        : "denied";

    const reviewerId =
      interaction.member.user.id;

    /*
     * Update database.
     */

    await sql`
      UPDATE mod_actions
      SET
        status = ${newStatus},
        reviewed_by = ${reviewerId},
        reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ${actionId}
    `;

    /*
     * Get the Discord message information.
     */

    const messageId =
      interaction.message.id;

    const channelId =
      interaction.channel_id;

    const botToken =
      process.env.DISCORD_BOT_TOKEN;

    if (!botToken) {
      console.error(
        "DISCORD_BOT_TOKEN is missing."
      );

      return;
    }

    /*
     * Build the updated embeds.
     */

    const originalEmbeds =
      interaction.message.embeds || [];

    const updatedEmbeds =
      originalEmbeds.map(embed => {

        const fields =
          [...(embed.fields || [])];

        const statusText =
          newStatus === "approved"
            ? "✅ APPROVED"
            : "❌ DENIED";

        const statusIndex =
          fields.findIndex(
            field =>
              field.name === "Status"
          );

        if (statusIndex !== -1) {

          fields[statusIndex] = {
            name: "Status",
            value: statusText,
            inline: false
          };

        } else {

          fields.push({
            name: "Status",
            value: statusText,
            inline: false
          });

        }

        /*
         * Remove an old Reviewed By field
         * if one somehow exists.
         */

        const filteredFields =
          fields.filter(
            field =>
              field.name !== "Reviewed By"
          );

        filteredFields.push({
          name: "Reviewed By",
          value: `<@${reviewerId}>`,
          inline: false
        });

        return {
          ...embed,
          fields: filteredFields
        };
      });

    /*
     * Disable the buttons.
     */

    const components = [
      {
        type: 1,
        components: [
          {
            type: 2,
            style:
              newStatus === "approved"
                ? 3
                : 4,
            label:
              newStatus === "approved"
                ? "Approved"
                : "Denied",
            custom_id:
              `mod_${decision}_${actionId}`,
            disabled: true
          }
        ]
      }
    ];

    /*
     * EDIT THE DISCORD MESSAGE
     * DIRECTLY THROUGH THE BOT API.
     */

    const discordResponse =
      await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
        {
          method: "PATCH",

          headers: {
            "Authorization":
              `Bot ${botToken}`,

            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            content:
              interaction.message.content || "",

            embeds:
              updatedEmbeds,

            components
          })
        }
      );

    if (!discordResponse.ok) {

      const errorText =
        await discordResponse.text();

      console.error(
        "Discord message update failed:",
        discordResponse.status,
        errorText
      );

      return;
    }

    console.log(
      `Successfully ${newStatus} moderation action ${actionId}.`
    );

  } catch (error) {

    console.error(
      "Moderation interaction error:",
      error
    );
  }
}
