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
    req.on("data", chunk => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}
function verifyDiscordRequest(
  rawBody,
  signature,
  timestamp
) {
  try {
    if (!PUBLIC_KEY) {
      return false;
    }
    const publicKeyDer = Buffer.concat([
      Buffer.from(
        "302a300506032b6570032100",
        "hex"
      ),
      Buffer.from(PUBLIC_KEY, "hex")
    ]);
    const publicKey = crypto.createPublicKey({
      key: publicKeyDer,
      format: "der",
      type: "spki"
    });
    return crypto.verify(
      null,
      Buffer.from(
        timestamp + rawBody.toString()
      ),
      publicKey,
      Buffer.from(signature, "hex")
    );
  } catch (error) {
    console.error(
      "Discord verification error:",
      error
    );
    return false;
  }
}
export default async function handler(req, res) {
  // =========================
  // BROWSER TEST
  // =========================
  if (req.method !== "POST") {
    return res.status(200).json({
      status:
        "Discord interactions endpoint is online."
    });
  }
  // =========================
  // CHECK PUBLIC KEY
  // =========================
  if (!PUBLIC_KEY) {
    return res.status(500).json({
      error:
        "DISCORD_PUBLIC_KEY is missing."
    });
  }
  const signature =
    req.headers["x-signature-ed25519"];
  const timestamp =
    req.headers["x-signature-timestamp"];
  if (!signature || !timestamp) {
    return res.status(401).json({
      error:
        "Missing Discord signature."
    });
  }
  // =========================
  // READ RAW BODY
  // =========================
  const rawBody =
    await getRawBody(req);
  // =========================
  // VERIFY DISCORD REQUEST
  // =========================
  if (
    !verifyDiscordRequest(
      rawBody,
      signature,
      timestamp
    )
  ) {
    return res.status(401).json({
      error:
        "Invalid Discord signature."
    });
  }
  // =========================
  // PARSE INTERACTION
  // =========================
  let interaction;
  try {
    interaction =
      JSON.parse(
        rawBody.toString()
      );
  } catch {
    return res.status(400).json({
      error:
        "Invalid JSON."
    });
  }
  // =========================
  // DISCORD PING
  // =========================
  if (interaction.type === 1) {
    return res.status(200).json({
      type: 1
    });
  }
  // =========================
  // ONLY BUTTONS
  // =========================
  if (
    interaction.type !== 3 ||
    !interaction.data ||
    !interaction.data.custom_id
  ) {
    return res.status(400).json({
      error:
        "Unsupported Discord interaction."
    });
  }
  const customId =
    interaction.data.custom_id;
  // =========================
  // CHECK BUTTON
  // =========================
  if (!customId.startsWith("mod_")) {
    return res.status(400).json({
      error:
        "Unknown moderation button."
    });
  }
  const parts =
    customId.split("_");
  const decision =
    parts[1];
  const actionId =
    parts[2];
  if (
    !["approve", "deny"].includes(
      decision
    ) ||
    !actionId
  ) {
    return res.status(400).json({
      error:
        "Invalid moderation button."
    });
  }
  // =========================
  // CHECK REVIEWER
  // =========================
  const member =
    interaction.member;
  if (
    !member ||
    !member.roles
  ) {
    return res.status(403).json({
      error:
        "Moderator information unavailable."
    });
  }
  const hasPermission =
    member.roles.some(
      roleId =>
        ALLOWED_ROLES.includes(
          roleId
        )
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
  // =========================
  // DATABASE
  // =========================
  try {
    const {
      default: sql
    } = await import(
      "../lib/db.js"
    );
    // =========================
    // MAKE SURE REQUIRED COLUMNS EXIST
    // =========================
    await sql`
      ALTER TABLE mod_actions
      ADD COLUMN IF NOT EXISTS
      status VARCHAR(20)
      DEFAULT 'pending'
    `;
    await sql`
      ALTER TABLE mod_actions
      ADD COLUMN IF NOT EXISTS
      reviewed_by VARCHAR(30)
    `;
    await sql`
      ALTER TABLE mod_actions
      ADD COLUMN IF NOT EXISTS
      reviewed_at TIMESTAMP
    `;
    await sql`
      ALTER TABLE mod_actions
      ADD COLUMN IF NOT EXISTS
      discord_message_id VARCHAR(30)
    `;
    await sql`
      ALTER TABLE mod_actions
      ADD COLUMN IF NOT EXISTS
      discord_channel_id VARCHAR(30)
    `;
    // =========================
    // GET MODERATION ACTION
    // =========================
    const actionRows = await sql`
      SELECT
        ma.id,
        ma.status,
        ma.action_type,
        ma.target_discord_id,
        ma.reason,
        m.id AS moderator_id,
        m.discord_id AS moderator_discord_id,
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
          content:
            "❌ This moderation log no longer exists.",
          flags: 64
        }
      });
    }
    const action =
      actionRows[0];
    // =========================
    // CHECK ALREADY REVIEWED
    // =========================
    if (
      action.status &&
      action.status !== "pending"
    ) {
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
    // =========================
    // UPDATE ACTION
    // =========================
    await sql`
      UPDATE mod_actions
      SET
        status = ${newStatus},
        reviewed_by = ${reviewerId},
        reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ${actionId}
    `;
    // =========================
    // UPDATE EMBED
    // =========================
    const statusText =
      newStatus === "approved"
        ? "✅ APPROVED"
        : "❌ DENIED";
    const originalMessage =
      interaction.message;
    const updatedEmbeds =
      (originalMessage.embeds || [])
        .map(embed => {
          const fields =
            [...(embed.fields || [])];
          const statusFieldIndex =
            fields.findIndex(
              field =>
                field.name === "Status"
            );
          if (
            statusFieldIndex >= 0
          ) {
            fields[
              statusFieldIndex
            ] = {
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
            value:
              `<@${reviewerId}>`,
            inline: false
          });
          return {
            ...embed,
            fields
          };
        });
    // =========================
    // APPROVE
    // =========================
    if (
      decision === "approve"
    ) {
      /*
       * POINTS SYSTEM
       *
       * The moderator who originally
       * created the moderation action
       * should receive 5 points.
       *
       * We are NOT creating a new
       * points table here because your
       * existing points system may use
       * a different table/structure.
       */
      console.log(
        `Approved moderation action ${actionId}. ` +
        `Moderator ${action.moderator_discord_id} ` +
        `should receive 5 points.`
      );
    }
    // =========================
    // DISABLE BUTTONS
    // =========================
    const disabledButton = {
      type: 2,
      style:
        decision === "approve"
          ? 3
          : 4,
      label:
        decision === "approve"
          ? "Approved"
          : "Denied",
      custom_id:
        `mod_${decision}_${actionId}`,
      disabled: true
    };
    return res.status(200).json({
      type: 7,
      data: {
        content:
          originalMessage.content || "",
        embeds:
          updatedEmbeds,
        components: [
          {
            type: 1,
            components: [
              disabledButton
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
        `Unable to process the moderation decision: ${
          error?.message ||
          String(error)
        }`
    });
  }
}
