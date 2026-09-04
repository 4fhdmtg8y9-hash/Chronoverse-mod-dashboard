import crypto from "crypto";
import sql from "../lib/db.js";

export const runtime = "nodejs";

export const config = {
  api: {
    bodyParser: false
  }
};

const GUILD_ID = "1538324229114695753";

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

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on("data", chunk => {
      chunks.push(chunk);
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    req.on("error", reject);
  });
}

function verifyDiscordRequest(rawBody, signature, timestamp) {
  try {
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
    console.error("Signature verification error:", error);
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed."
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

  const valid = verifyDiscordRequest(
    rawBody,
    signature,
    timestamp
  );

  if (!valid) {
    return res.status(401).json({
      error: "Invalid Discord signature."
    });
  }

  let interaction;

  try {
    interaction = JSON.parse(rawBody.toString());
  } catch {
    return res.status(400).json({
      error: "Invalid request body."
    });
  }

  // Discord verification request
  if (interaction.type === 1) {
    return res.status(200).json({
      type: 1
    });
  }

  // Button interaction
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
      error: "Unknown button."
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
    return res.status(403).json({
      error: "Moderator information unavailable."
    });
  }

  const hasPermission = member.roles.some(
    roleId => ALLOWED_ROLES.includes(roleId)
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

  try {
    const actionRows = await sql`
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

    if (actionRows.length === 0) {
      return res.status(200).json({
        type: 4,
        data: {
          content: "❌ This moderation log no longer exists.",
          flags: 64
        }
      });
    }

    const action = actionRows[0];

    if (action.status !== "pending") {
      return res.status(200).json({
        type: 4,
        data: {
          content:
            `⚠️ This case has already been **${action.status}**.`,
          flags: 64
        }
      });
    }

    const newStatus =
      decision === "approve"
        ? "approved"
        : "denied";

    const reviewerId =
      interaction.member.user.id;

    await sql`
      UPDATE mod_actions
      SET
        status = ${newStatus},
        reviewed_by = ${reviewerId},
        reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ${actionId}
    `;

    const statusText =
      newStatus === "approved"
        ? "✅ APPROVED"
        : "❌ DENIED";

    const originalMessage =
      interaction.message;

    const updatedEmbeds =
      originalMessage.embeds.map(embed => {

        const fields =
          embed.fields || [];

        const statusFieldIndex =
          fields.findIndex(
            field =>
              field.name === "Status"
          );

        if (statusFieldIndex >= 0) {
          fields[statusFieldIndex] = {
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

        fields.push({
          name: "Reviewed By",
          value: `<@${reviewerId}>`,
          inline: false
        });

        return {
          ...embed,
          fields
        };
      });

    return res.status(200).json({
      type: 7,
      data: {
        content:
          originalMessage.content || "",
        embeds: updatedEmbeds,
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: decision === "approve" ? 3 : 4,
                label:
                  decision === "approve"
                    ? "Approved"
                    : "Denied",
                custom_id:
                  `mod_${decision}_${actionId}`,
                disabled: true
              }
            ]
          }
        ]
      }
    });

  } catch (error) {
    console.error(
      "Moderation approval error:",
      error
    );

    return res.status(500).json({
      error:
        "Unable to process the moderation decision."
    });
  }
}
