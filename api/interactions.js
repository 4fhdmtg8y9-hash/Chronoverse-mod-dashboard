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
    console.error(
      "SIGNATURE VERIFICATION ERROR:",
      error?.message || String(error),
      error?.stack || ""
    );

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

  // Check public key
  if (!PUBLIC_KEY) {
    console.error(
      "DISCORD_PUBLIC_KEY is missing."
    );

    return res.status(500).json({
      error: "DISCORD_PUBLIC_KEY is missing."
    });
  }

  // Discord signature headers
  const signature =
    req.headers["x-signature-ed25519"];

  const timestamp =
    req.headers["x-signature-timestamp"];

  if (!signature || !timestamp) {
    console.error(
      "Missing Discord signature."
    );

    return res.status(401).json({
      error: "Missing Discord signature."
    });
  }

  // Read raw request body
  let rawBody;

  try {
    rawBody = await getRawBody(req);
  } catch (error) {
    console.error(
      "RAW BODY ERROR:",
      error?.message || String(error),
      error?.stack || ""
    );

    return res.status(500).json({
      error: "Unable to read request body."
    });
  }

  // Verify Discord request
  if (
    !verifyDiscordRequest(
      rawBody,
      signature,
      timestamp
    )
  ) {
    console.error(
      "Invalid Discord signature."
    );

    return res.status(401).json({
      error: "Invalid Discord signature."
    });
  }

  // Parse JSON
  let interaction;

  try {
    interaction =
      JSON.parse(rawBody.toString());
  } catch (error) {
    console.error(
      "JSON PARSE ERROR:",
      error?.message || String(error),
      error?.stack || ""
    );

    return res.status(400).json({
      error: "Invalid JSON."
    });
  }

  // Discord verification ping
  if (interaction.type === 1) {
    console.log(
      "Discord verification ping received."
    );

    return res.status(200).json({
      type: 1
    });
  }

  // Only handle component/button interactions
  if (
    interaction.type !== 3 ||
    !interaction.data ||
    !interaction.data.custom_id
  ) {
    console.error(
      "Unsupported interaction:",
      JSON.stringify(interaction)
    );

    return res.status(400).json({
      error: "Unsupported Discord interaction."
    });
  }

  const customId =
    interaction.data.custom_id;

  console.log(
    "MODERATION BUTTON CLICKED:",
    customId
  );

  // Check moderation button
  if (!customId.startsWith("mod_")) {
    console.error(
      "Unknown moderation button:",
      customId
    );

    return res.status(400).json({
      error: "Unknown moderation button."
    });
  }

  const parts =
    customId.split("_");

  const decision = parts[1];
  const actionId = parts[2];

  console.log(
    "Decision:",
    decision,
    "Action ID:",
    actionId
  );

  if (
    !["approve", "deny"].includes(decision) ||
    !actionId
  ) {
    console.error(
      "Invalid moderation button:",
      customId
    );

    return res.status(400).json({
      error: "Invalid moderation button."
    });
  }

  // Get Discord member
  const member =
    interaction.member;

  if (!member || !member.roles) {

    console.error(
      "Moderator information unavailable."
    );

    return res.status(200).json({
      type: 4,
      data: {
        content:
          "❌ Moderator information unavailable.",
        flags: 64
      }
    });
  }

  // Check moderator role
  const hasPermission =
    member.roles.some(roleId =>
      ALLOWED_ROLES.includes(roleId)
    );

  if (!hasPermission) {

    console.log(
      "User attempted moderation review without permission:",
      interaction.member.user?.id
    );

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
   * Get the original Discord message.
   *
   * The actual embed was created by
   * api/log-actions.js.
   */

  const originalMessage =
    interaction.message;

  if (!originalMessage) {

    console.error(
      "Original Discord message is missing."
    );

    return res.status(200).json({
      type: 4,
      data: {
        content:
          "❌ Original moderation message could not be found.",
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

// Award 5 points ONLY when approved
if (decision === "approve") {
  await sql`
    UPDATE moderators
    SET
      points = points + 5,
      approved_actions = approved_actions + 1
    WHERE id = (
      SELECT moderator_id
      FROM mod_actions
      WHERE id = ${actionId}
    )
  `;

  await sql`
    UPDATE mod_actions
    SET points_awarded = 5
    WHERE id = ${actionId}
  `;
}
  const statusText =
    decision === "approve"
      ? "✅ APPROVED"
      : "❌ DENIED";

  const reviewerId =
    interaction.member.user.id;

  /*
   * Create updated embeds from the
   * existing log-actions.js embed.
   */

  const updatedEmbeds =
    (originalMessage.embeds || []).map(
      embed => {

        let fields =
          [...(embed.fields || [])];

        // Find Status field
        const statusIndex =
          fields.findIndex(
            field =>
              field.name === "Status"
          );

        if (statusIndex !== -1) {

          fields[statusIndex] = {
            ...fields[statusIndex],
            name: "Status",
            value: statusText
          };

        } else {

          fields.push({
            name: "Status",
            value: statusText,
            inline: false
          });
        }

        // Remove old Reviewed By fields
        fields =
          fields.filter(
            field =>
              field.name !== "Reviewed By"
          );

        // Add reviewer
        fields.push({
          name: "Reviewed By",
          value: `<@${reviewerId}>`,
          inline: false
        });

        return {
          ...embed,
          fields
        };
      }
    );

  /*
   * Keep both buttons but disable them.
   */

  const updatedComponents = [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 3,
          label: "Approve",
          custom_id:
            `mod_approve_${actionId}`,
          disabled: true
        },
        {
          type: 2,
          style: 4,
          label: "Deny",
          custom_id:
            `mod_deny_${actionId}`,
          disabled: true
        }
      ]
    }
  ];

  /*
   * IMPORTANT:
   *
   * We respond directly with Type 7.
   *
   * This tells Discord:
   * "Update the message that contains
   * the button that was clicked."
   *
   * No database query happens before
   * Discord receives this response.
   */

  console.log(
    "Sending Discord message update response..."
  );

  try {

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
      "DISCORD RESPONSE ERROR:",
      error?.message || String(error),
      error?.stack || ""
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Unable to update moderation message."
    });
  }
}
