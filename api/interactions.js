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
      "SIGNATURE VERIFICATION ERROR:",
      error?.message || String(error)
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

  // =========================
  // DISCORD SIGNATURE
  // =========================

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

  let rawBody;

  try {

    rawBody =
      await getRawBody(req);

  } catch (error) {

    console.error(
      "RAW BODY ERROR:",
      error?.message || String(error)
    );

    return res.status(500).json({
      error:
        "Unable to read request body."
    });

  }

  // =========================
  // VERIFY DISCORD
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

  } catch (error) {

    console.error(
      "JSON PARSE ERROR:",
      error?.message || String(error)
    );

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
  // BUTTON INTERACTION
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

  console.log(
    "MODERATION BUTTON CLICKED:",
    customId
  );

  // =========================
  // CHECK BUTTON ID
  // =========================

  if (
    !customId.startsWith("mod_")
  ) {

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

  console.log(
    "Decision:",
    decision,
    "Action ID:",
    actionId
  );

  // =========================
  // CHECK MEMBER
  // =========================

  const member =
    interaction.member;

  if (
    !member ||
    !member.roles
  ) {

    return res.status(200).json({
      type: 4,
      data: {
        content:
          "❌ Moderator information unavailable.",
        flags: 64
      }
    });

  }

  // =========================
  // CHECK PERMISSION
  // =========================

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
  // ORIGINAL MESSAGE
  // =========================

  const originalMessage =
    interaction.message;

  if (!originalMessage) {

    return res.status(200).json({
      type: 4,
      data: {
        content:
          "❌ Original moderation message could not be found.",
        flags: 64
      }
    });

  }

  // =========================
  // DATABASE
  // =========================

  try {

    const { default: sql } =
      await import("../lib/db.js");

    // =========================
    // GET MODERATION ACTION
    // =========================

    const actionRows =
      await sql`

        SELECT
          ma.id,
          ma.status,
          ma.action_type,
          ma.target_discord_id,
          ma.reason,
          ma.case_id,
          ma.discord_message_id,
          ma.discord_channel_id,
          ma.points_awarded,
          m.id AS moderator_id,
          m.username AS moderator_username

        FROM mod_actions ma

        JOIN moderators m
          ON ma.moderator_id = m.id

        WHERE ma.id = ${actionId}

        LIMIT 1

      `;

    if (
      actionRows.length === 0
    ) {

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
    // PREVENT DOUBLE ACTION
    // =========================

    if (
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

    // =========================
    // NEW STATUS
    // =========================

    const newStatus =
      decision === "approve"
        ? "approved"
        : "denied";

    const reviewerId =
      interaction.member.user.id;

    // =========================
    // UPDATE MODERATION ACTION
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
    // AWARD 5 POINTS
    // =========================

    if (
      decision === "approve"
    ) {

      console.log(
        "Awarding 5 points to moderator:",
        action.moderator_id
      );

      await sql`

        UPDATE moderators

        SET
          points =
            COALESCE(points, 0) + 5,

          approved_actions =
            COALESCE(approved_actions, 0) + 1

        WHERE id =
          ${action.moderator_id}

      `;

      // Record that points were awarded
      await sql`

        UPDATE mod_actions

        SET
          points_awarded = 5

        WHERE id = ${actionId}

      `;

      console.log(
        "5 points awarded successfully."
      );

    }

    // =========================
    // STATUS TEXT
    // =========================

    const statusText =
      decision === "approve"
        ? "✅ APPROVED"
        : "❌ DENIED";

    // =========================
    // UPDATE EMBED
    // =========================

    const updatedEmbeds =
      (
        originalMessage.embeds || []
      ).map(embed => {

        let fields =
          [...(embed.fields || [])];

        // Find Status
        const statusIndex =
          fields.findIndex(
            field =>
              field.name === "Status"
          );

        if (
          statusIndex !== -1
        ) {

          fields[statusIndex] = {
            ...fields[statusIndex],

            name:
              "Status",

            value:
              statusText
          };

        } else {

          fields.push({
            name:
              "Status",

            value:
              statusText,

            inline:
              false
          });

        }

        // Remove existing reviewer
        fields =
          fields.filter(
            field =>
              field.name !==
              "Reviewed By"
          );

        // Add reviewer
        fields.push({
          name:
            "Reviewed By",

          value:
            `<@${reviewerId}>`,

          inline:
            false
        });

        return {
          ...embed,
          fields
        };

      });

    // =========================
    // DISABLE BUTTONS
    // =========================

    const updatedComponents = [
      {
        type: 1,

        components: [

          {
            type: 2,

            style: 3,

            label:
              decision === "approve"
                ? "Approved"
                : "Approve",

            custom_id:
              `mod_approve_${actionId}`,

            disabled:
              true
          },

          {
            type: 2,

            style: 4,

            label:
              decision === "deny"
                ? "Denied"
                : "Deny",

            custom_id:
              `mod_deny_${actionId}`,

            disabled:
              true
          }

        ]
      }
    ];

    // =========================
    // UPDATE DISCORD MESSAGE
    // =========================

    console.log(
      "Sending Discord message update..."
    );

    return res.status(200).json({

      type: 7,

      data: {

        content:
          originalMessage.content || "",

        embeds:
          updatedEmbeds,

        components:
          updatedComponents

      }

    });

  } catch (error) {

    console.error(
      "MODERATION INTERACTION ERROR:",
      error?.message || String(error),

      error?.stack || ""
    );

    return res.status(500).json({
      error:
        "Unable to process the moderation decision."
    });

  }

}
