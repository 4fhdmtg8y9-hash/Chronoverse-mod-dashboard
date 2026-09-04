import Busboy from "busboy";
import sql from "../lib/db.js";
export const config = {
  api: {
    bodyParser: false
  }
};
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed."
    });
  }
  // =========================
  // DISCORD SETTINGS
  // =========================
  const guildId = "1538324229114695753";
  const logChannelId = "1545249591526555658";
  const allowedRoleIds = [
    "1538324425546666114",
    "1538505102644740167",
    "1543383003445723159",
    "1538626569831055390",
    "1538626890649174170",
    "1538534696483426365",
    "1538569564340879420",
    "1538569917471916083"
  ];
  const overseerRoleId = "1538505102644740167";
  const executiveRoleId = "1543383003445723159";
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    return res.status(500).json({
      error: "DISCORD_BOT_TOKEN is missing."
    });
  }
  // =========================
  // CHECK LOGIN
  // =========================
  const cookies = req.headers.cookie || "";
  const tokenMatch = cookies.match(
    /discord_access_token=([^;]+)/
  );
  if (!tokenMatch) {
    return res.status(401).json({
      error: "You are not logged in."
    });
  }
  const accessToken = decodeURIComponent(
    tokenMatch[1]
  );
  // =========================
  // GET DISCORD USER
  // =========================
  let moderatorUser;
  try {
    const userResponse = await fetch(
      "https://discord.com/api/users/@me",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );
    if (!userResponse.ok) {
      return res.status(401).json({
        error: "Your Discord session has expired."
      });
    }
    moderatorUser = await userResponse.json();
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Unable to retrieve your Discord account."
    });
  }
  // =========================
  // CHECK DISCORD SERVER ROLES
  // =========================
  try {
    const memberResponse = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${moderatorUser.id}`,
      {
        headers: {
          Authorization: `Bot ${botToken}`
        }
      }
    );
    if (!memberResponse.ok) {
      return res.status(403).json({
        error:
          "You are not a member of the Chronoverse Discord server."
      });
    }
    const member = await memberResponse.json();
    const hasPermission = member.roles.some(
      roleId => allowedRoleIds.includes(roleId)
    );
    if (!hasPermission) {
      return res.status(403).json({
        error:
          "You do not have permission to use the moderator dashboard."
      });
    }
  } catch (error) {
    console.error(
      "Role check error:",
      error
    );
    return res.status(500).json({
      error:
        "Unable to verify your Discord permissions."
    });
  }
  // =========================
  // READ FORM DATA
  // =========================
  const fields = {};
  let uploadedFile = null;
  try {
    const busboy = Busboy({
      headers: req.headers,
      limits: {
        fileSize: 8 * 1024 * 1024
      }
    });
    busboy.on(
      "field",
      (name, value) => {
        fields[name] = value;
      }
    );
    busboy.on(
      "file",
      (name, file, info) => {
        const chunks = [];
        const filename =
          info.filename || "evidence.png";
        const mimeType =
          info.mimeType || "image/png";
        file.on(
          "data",
          chunk => {
            chunks.push(chunk);
          }
        );
        file.on(
          "end",
          () => {
            if (chunks.length > 0) {
              uploadedFile = {
                buffer: Buffer.concat(chunks),
                filename,
                mimeType
              };
            }
          }
        );
      }
    );
    await new Promise(
      (resolve, reject) => {
        busboy.on(
          "finish",
          resolve
        );
        busboy.on(
          "error",
          reject
        );
        req.pipe(busboy);
      }
    );
  } catch (error) {
    console.error(
      "Busboy error:",
      error
    );
    return res.status(400).json({
      error:
        "Could not process the submitted form."
    });
  }
  // =========================
  // GET FIELDS
  // =========================
  const action = fields.action;
  const userId = fields.userId;
  const username = fields.username;
  const reason = fields.reason;
  if (!userId) {
    return res.status(400).json({
      error: "User ID is required."
    });
  }
  if (!username) {
    return res.status(400).json({
      error: "Username is required."
    });
  }
  if (!reason) {
    return res.status(400).json({
      error: "Reason is required."
    });
  }
  // =========================
  // VALIDATE ACTION
  // =========================
  const allowedActions = [
    "Warn",
    "Kick",
    "Ban",
    "Unban",
    "Timeout",
    "Note"
  ];
  if (!allowedActions.includes(action)) {
    return res.status(400).json({
      error: "Invalid moderation action."
    });
  }
  // =========================
  // CASE ID
  // =========================
  const caseId =
    "CASE-" +
    Date.now()
      .toString()
      .slice(-8);
  // =========================
  // DATE + TIME
  // =========================
  const now = new Date();
  const date = now.toLocaleDateString(
    "en-US",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Europe/Paris"
    }
  );
  const time = now.toLocaleTimeString(
    "en-US",
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "Europe/Paris"
    }
  );
  // =========================
  // EMBED COLOR
  // =========================
  let color = 0x5865F2;
  switch (action) {
    case "Ban":
      color = 0xED4245;
      break;
    case "Warn":
      color = 0xFEE75C;
      break;
    case "Unban":
      color = 0x57F287;
      break;
    case "Timeout":
      color = 0xE67E22;
      break;
    case "Kick":
      color = 0x99AAB5;
      break;
    case "Note":
      color = 0x5865F2;
      break;
  }
  // =========================
  // GET / CREATE MODERATOR
  // =========================
  let moderatorRecord;
  try {
    moderatorRecord = await sql`
      SELECT id
      FROM moderators
      WHERE discord_id = ${moderatorUser.id}
      LIMIT 1
    `;
    if (moderatorRecord.length === 0) {
      moderatorRecord = await sql`
        INSERT INTO moderators (
          discord_id,
          username,
          avatar_url
        )
        VALUES (
          ${moderatorUser.id},
          ${moderatorUser.username},
          ${moderatorUser.avatar}
        )
        RETURNING id
      `;
    }
  } catch (error) {
    console.error(
      "Moderator database error:",
      error
    );
    return res.status(500).json({
      error:
        "Unable to save moderator information."
    });
  }
  // =========================
  // CREATE MODERATION ACTION
  // =========================
  let actionRecord;
  try {
    actionRecord = await sql`
      INSERT INTO mod_actions (
        moderator_id,
        action_type,
        target_discord_id,
        reason,
        case_id,
        status
      )
      VALUES (
        ${moderatorRecord[0].id},
        ${action},
        ${userId},
        ${reason},
        ${caseId},
        'pending'
      )
      RETURNING id
    `;
  } catch (error) {
    console.error(
      "Moderation action database error:",
      error
    );
    return res.status(500).json({
      error:
        "Unable to save the moderation action."
    });
  }
  const actionId = actionRecord[0].id;
  // =========================
  // CREATE EMBED
  // =========================
  const embed = {
    title:
      "🛡️ Moderation Action",
    color,
    fields: [
      {
        name: "Moderator",
        value:
          `\`${moderatorUser.username}\``,
        inline: true
      },
      {
        name: "Action",
        value:
          `\`${action}\``,
        inline: true
      },
      {
        name: "User",
        value:
          `\`${username}\``,
        inline: false
      },
      {
        name: "User ID",
        value:
          `\`${userId}\``,
        inline: false
      },
      {
        name: "Reason",
        value:
          reason,
        inline: false
      },
      {
        name: "Date",
        value:
          date,
        inline: true
      },
      {
        name: "Time",
        value:
          time,
        inline: true
      },
      {
        name: "Case ID",
        value:
          `\`${caseId}\``,
        inline: false
      },
      {
        name: "Status",
        value:
          "🟡 PENDING",
        inline: false
      }
    ],
    footer: {
      text:
        "Marvel Chronoverse • Moderator Dashboard"
    },
    timestamp:
      now.toISOString()
  };
  // =========================
  // ATTACH EVIDENCE
  // =========================
  if (uploadedFile) {
    embed.image = {
      url:
        `attachment://${uploadedFile.filename}`
    };
  }
  // =========================
  // SEND TO DISCORD
  // =========================
  try {
    const form = new FormData();
    const payload = {
      content:
        `<@&${overseerRoleId}> <@&${executiveRoleId}>`,
      embeds:
        [embed],
      // =========================
      // APPROVE / DENY BUTTONS
      // =========================
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 3,
              label: "Approve",
              custom_id:
                `mod_approve_${actionId}`
            },
            {
              type: 2,
              style: 4,
              label: "Deny",
              custom_id:
                `mod_deny_${actionId}`
            }
          ]
        }
      ],
      allowed_mentions: {
        roles: [
          overseerRoleId,
          executiveRoleId
        ]
      }
    };
    form.append(
      "payload_json",
      JSON.stringify(payload)
    );
    if (uploadedFile) {
      const blob = new Blob(
        [uploadedFile.buffer],
        {
          type:
            uploadedFile.mimeType
        }
      );
      form.append(
        "files[0]",
        blob,
        uploadedFile.filename
      );
    }
    const discordResponse =
      await fetch(
        `https://discord.com/api/v10/channels/${logChannelId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization:
              `Bot ${botToken}`
          },
          body:
            form
        }
      );
    const discordData =
      await discordResponse.json();
    if (!discordResponse.ok) {
      console.error(
        "Discord API error:",
        discordData
      );
      return res.status(500).json({
        error:
          discordData.message ||
          "Discord rejected the moderation log."
      });
    }
    // =========================
    // SAVE DISCORD MESSAGE INFO
    // =========================
    try {
      await sql`
        UPDATE mod_actions
        SET
          discord_message_id =
            ${discordData.id},
          discord_channel_id =
            ${logChannelId}
        WHERE id =
          ${actionId}
      `;
    } catch (error) {
      console.error(
        "Unable to save Discord message information:",
        error
      );
    }
    // =========================
    // SUCCESS
    // =========================
    return res.status(200).json({
      success:
        true,
      caseId,
      actionId
    });
  } catch (error) {
    console.error(
      "Discord sending error:",
      error
    );
    return res.status(500).json({
      error:
        "Failed to send the moderation log."
    });
  }
}
