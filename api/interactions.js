import crypto from "crypto";
import sql from "../lib/db.js";

export const runtime = "nodejs";

export const config = {
  api: {
    bodyParser: false,
  },
};

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

const ALLOWED_ROLE_IDS = [
  "1538324425546666114",
  "1538505102644740167",
  "1543383003445723159",
  "1538626569831055390",
  "1538626890649174170",
  "1538534696483426365",
  "1538569564340879420",
  "1538569917471916083",
];

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.setEncoding("utf8");

    req.on("data", (chunk) => {
      data += chunk;
    });

    req.on("end", () => {
      resolve(data);
    });

    req.on("error", reject);
  });
}

function verifyDiscordRequest(rawBody, signature, timestamp) {
  if (!signature || !timestamp || !PUBLIC_KEY) {
    console.error(
      "Missing Discord verification headers or public key"
    );
    return false;
  }

  try {
    const message = Buffer.from(timestamp + rawBody);

    const signatureBuffer = Buffer.from(
      signature,
      "hex"
    );

    const publicKeyBuffer = Buffer.from(
      PUBLIC_KEY,
      "hex"
    );

    return crypto.verify(
      null,
      message,
      {
        key: publicKeyBuffer,
        format: "der",
        type: "spki",
      },
      signatureBuffer
    );
  } catch (error) {
    console.error(
      "Discord signature verification error:",
      error?.message || error
    );

    return false;
  }
}

export default async function handler(req, res) {
  // Browser test
  if (req.method === "GET") {
    return res.status(200).json({
      status: "Discord interactions endpoint is online.",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const rawBody = await getRawBody(req);

    const signature =
      req.headers["x-signature-ed25519"];

    const timestamp =
      req.headers["x-signature-timestamp"];

    // Verify the request came from Discord
    const verified = verifyDiscordRequest(
      rawBody,
      signature,
      timestamp
    );

    if (!verified) {
      console.error("Invalid Discord signature");

      return res
        .status(401)
        .send("Invalid request signature");
    }

    const interaction = JSON.parse(rawBody);

    // Discord Ping
    if (interaction.type === 1) {
      return res.status(200).json({
        type: 1,
      });
    }

    // Discord button/component interaction
    if (interaction.type === 3) {
      const customId =
        interaction.data?.custom_id || "";

      // Only handle moderation buttons
      if (
        !customId.startsWith("mod_approve_") &&
        !customId.startsWith("mod_deny_")
      ) {
        return res.status(200).json({
          type: 6,
        });
      }

      const isApprove =
        customId.startsWith("mod_approve_");

      const actionId = customId.replace(
        isApprove
          ? "mod_approve_"
          : "mod_deny_",
        ""
      );

      if (!actionId) {
        return res.status(400).json({
          error: "Missing action ID",
        });
      }

      // Check moderator roles
      const memberRoles =
        interaction.member?.roles || [];

      const hasPermission =
        memberRoles.some((roleId) =>
          ALLOWED_ROLE_IDS.includes(roleId)
        );

      if (!hasPermission) {
        return res.status(200).json({
          type: 4,
          data: {
            content:
              "❌ You do not have permission to review moderation actions.",
            flags: 64,
          },
        });
      }

      // Find moderation action
      const result = await sql`
        SELECT
          ma.id,
          ma.moderator_id,
          ma.action_type,
          ma.target_discord_id,
          ma.reason,
          ma.created_at,
          ma.case_id,
          ma.status,
          ma.points_awarded,
          m.discord_id AS moderator_discord_id
        FROM mod_actions ma
        LEFT JOIN moderators m
          ON ma.moderator_id = m.id
        WHERE ma.id = ${actionId}
        LIMIT 1
      `;

      if (!result || result.length === 0) {
        return res.status(200).json({
          type: 4,
          data: {
            content:
              "❌ This moderation action could not be found.",
            flags: 64,
          },
        });
      }

      const action = result[0];

      // Prevent double verification
      if (action.status !== "pending") {
        return res.status(200).json({
          type: 4,
          data: {
            content:
              `⚠️ This case has already been ${action.status}.`,
            flags: 64,
          },
        });
      }

      const newStatus = isApprove
        ? "approved"
        : "denied";

      const reviewerId =
        interaction.member?.user?.id ||
        interaction.user?.id ||
        "unknown";

      // Update case status
      await sql`
        UPDATE mod_actions
        SET
          status = ${newStatus},
          reviewed_by = ${reviewerId},
          reviewed_at = NOW()
        WHERE id = ${actionId}
          AND status = 'pending'
      `;

      // APPROVED = +5 POINTS
      if (isApprove) {
        await sql`
          UPDATE moderators
          SET
            points = COALESCE(points, 0) + 5,
            approved_actions =
              COALESCE(approved_actions, 0) + 1
          WHERE id = ${action.moderator_id}
        `;

        await sql`
          UPDATE mod_actions
          SET points_awarded = 5
          WHERE id = ${actionId}
        `;
      } else {
        await sql`
          UPDATE mod_actions
          SET points_awarded = 0
          WHERE id = ${actionId}
        `;
      }

      // Get the existing Discord embed
      const existingEmbeds =
        interaction.message?.embeds || [];

      let embed = existingEmbeds[0]
        ? {
            ...existingEmbeds[0],
          }
        : {
            title: "🛡️ Moderation Action",
          };

      // Update Status field
      const oldFields = embed.fields || [];

      const fields = oldFields.map((field) => {
        if (field.name === "Status") {
          return {
            ...field,
            value: isApprove
              ? "🟢 APPROVED"
              : "🔴 DENIED",
          };
        }

        return field;
      });

      // Add reviewer
      fields.push({
        name: "Reviewed By",
        value: `<@${reviewerId}>`,
        inline: true,
      });

      // Add points
      fields.push({
        name: "Points",
        value: isApprove
          ? "⭐ +5 points awarded"
          : "0 points awarded",
        inline: true,
      });

      embed.fields = fields;

      // Disable buttons
      const disabledComponents = (
        interaction.message?.components || []
      ).map((row) => ({
        ...row,
        components: (row.components || []).map(
          (button) => ({
            ...button,
            disabled: true,
          })
        ),
      }));

      // Update the original Discord message
      return res.status(200).json({
        type: 7,
        data: {
          embeds: [embed],
          components: disabledComponents,
        },
      });
    }

    return res.status(200).json({
      type: 6,
    });
  } catch (error) {
    console.error(
      "MODERATION INTERACTION ERROR:",
      error?.message || String(error),
      error?.stack || ""
    );

    return res.status(200).json({
      type: 4,
      data: {
        content:
          "❌ Something went wrong while processing this moderation action.",
        flags: 64,
      },
    });
  }
}
