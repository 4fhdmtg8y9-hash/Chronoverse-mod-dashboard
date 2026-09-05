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

    req.on("error", (error) => {
      reject(error);
    });
  });
}

function verifyDiscordRequest(rawBody, signature, timestamp) {
  if (!signature) {
    console.error("Missing Discord signature");
    return false;
  }

  if (!timestamp) {
    console.error("Missing Discord timestamp");
    return false;
  }

  if (!PUBLIC_KEY) {
    console.error("DISCORD_PUBLIC_KEY is missing");
    return false;
  }

  try {
    /*
     * Discord gives us the Ed25519 public key as
     * 32 raw bytes.
     *
     * Node crypto expects an SPKI DER key.
     *
     * This is the standard Ed25519 SPKI prefix.
     */
    const publicKey = Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      Buffer.from(PUBLIC_KEY, "hex"),
    ]);

    const message = Buffer.from(
      timestamp + rawBody,
      "utf8"
    );

    const signatureBuffer = Buffer.from(
      signature,
      "hex"
    );

    return crypto.verify(
      null,
      message,
      {
        key: publicKey,
        format: "der",
        type: "spki",
      },
      signatureBuffer
    );
  } catch (error) {
    console.error(
      "Discord signature verification error:",
      error?.message || String(error)
    );

    return false;
  }
}

export default async function handler(req, res) {
  // --------------------------------
  // Browser test
  // --------------------------------

  if (req.method === "GET") {
    return res.status(200).json({
      status: "Discord interactions endpoint is online.",
    });
  }

  // --------------------------------
  // Only allow POST
  // --------------------------------

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    // --------------------------------
    // Get Discord's ORIGINAL raw body
    // --------------------------------

    const rawBody = await getRawBody(req);

    const signature =
      req.headers["x-signature-ed25519"];

    const timestamp =
      req.headers["x-signature-timestamp"];

    // --------------------------------
    // Verify Discord request
    // --------------------------------

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

    // --------------------------------
    // Parse interaction
    // --------------------------------

    const interaction = JSON.parse(rawBody);

    // --------------------------------
    // Discord Ping
    // --------------------------------

    if (interaction.type === 1) {
      return res.status(200).json({
        type: 1,
      });
    }

    // --------------------------------
    // Button interaction
    // --------------------------------

    if (interaction.type === 3) {
      const customId =
        interaction.data?.custom_id || "";

      console.log(
        "BUTTON INTERACTION:",
        customId
      );

      // --------------------------------
      // Only moderation buttons
      // --------------------------------

      if (
        !customId.startsWith("mod_approve_") &&
        !customId.startsWith("mod_deny_")
      ) {
        return res.status(200).json({
          type: 6,
        });
      }

      // --------------------------------
      // Determine approval / denial
      // --------------------------------

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

      // --------------------------------
      // Check moderator permissions
      // --------------------------------

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

      // --------------------------------
      // Get moderation action
      // --------------------------------

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

      // --------------------------------
      // Prevent double review
      // --------------------------------

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

      // --------------------------------
      // Update moderation case
      // --------------------------------

      const updated = await sql`
        UPDATE mod_actions
        SET
          status = ${newStatus},
          reviewed_by = ${reviewerId},
          reviewed_at = NOW()
        WHERE id = ${actionId}
          AND status = 'pending'
        RETURNING id
      `;

      // Someone else may have reviewed it
      if (!updated || updated.length === 0) {
        return res.status(200).json({
          type: 4,
          data: {
            content:
              "⚠️ This case has already been reviewed.",
            flags: 64,
          },
        });
      }

      // --------------------------------
      // APPROVED
      // +5 POINTS
      // --------------------------------

      if (isApprove) {
        await sql`
          UPDATE moderators
          SET
            points =
              COALESCE(points, 0) + 5,
            approved_actions =
              COALESCE(approved_actions, 0) + 1
          WHERE id = ${action.moderator_id}
        `;

        await sql`
          UPDATE mod_actions
          SET points_awarded = 5
          WHERE id = ${actionId}
        `;
      }

      // --------------------------------
      // DENIED
      // --------------------------------

      else {
        await sql`
          UPDATE mod_actions
          SET points_awarded = 0
          WHERE id = ${actionId}
        `;
      }

      // --------------------------------
      // Get original Discord embed
      // --------------------------------

      const existingEmbeds =
        interaction.message?.embeds || [];

      let embed;

      if (existingEmbeds.length > 0) {
        embed = {
          ...existingEmbeds[0],
        };
      } else {
        embed = {
          title: "🛡️ Moderation Action",
        };
      }

      // --------------------------------
      // Update embed fields
      // --------------------------------

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

      // --------------------------------
      // Reviewed By
      // --------------------------------

      fields.push({
        name: "Reviewed By",
        value: `<@${reviewerId}>`,
        inline: true,
      });

      // --------------------------------
      // Points
      // --------------------------------

      fields.push({
        name: "Points",
        value: isApprove
          ? "⭐ +5 points awarded"
          : "0 points awarded",
        inline: true,
      });

      embed.fields = fields;

      // --------------------------------
      // Disable buttons
      // --------------------------------

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

      // --------------------------------
      // Update original Discord message
      // --------------------------------

      return res.status(200).json({
        type: 7,

        data: {
          embeds: [embed],
          components: disabledComponents,
        },
      });
    }

    // --------------------------------
    // Unknown interaction
    // --------------------------------

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
