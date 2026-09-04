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
  const logChannelId = "1545249591526555658";
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
  const accessToken = decodeURIComponent(tokenMatch[1]);
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
    busboy.on("field", (name, value) => {
      fields[name] = value;
    });
    busboy.on("file", (name, file, info) => {
      const chunks = [];
      const filename =
        info.filename || "evidence.png";
      const mimeType =
        info.mimeType || "image/png";
      file.on("data", (chunk) => {
        chunks.push(chunk);
      });
      file.on("end", () => {
        if (chunks.length > 0) {
          uploadedFile = {
            buffer: Buffer.concat(chunks),
            filename,
            mimeType
          };
        }
      });
    });
    await new Promise((resolve, reject) => {
      busboy.on("finish", resolve);
      busboy.on("error", reject);
      req.pipe(busboy);
    });
  } catch (error) {
    console.error("Busboy error:", error);
    return res.status(400).json({
      error: "Could not process the submitted form."
    });
  }
  // =========================
  // GET DASHBOARD FIELDS
  // =========================
  const action = fields.action;
  const userId = fields.userId;
  const username = fields.username;
  const reason = fields.reason;
  // These MUST exist
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
  // CASE ID
  // =========================
  const caseId =
    "CASE-" +
    Date.now().toString().slice(-8);
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
  // CREATE EMBED
  // =========================
  const embed = {
    title: "🛡️ Moderation Action",
    color: color,
    fields: [
      {
        name: "Moderator",
        value: `\`${moderatorUser.username}\``,
        inline: true
      },
      {
        name: "Action",
        value: `\`${action}\``,
        inline: true
      },
      {
        name: "User",
        value: `\`${username}\``,
        inline: false
      },
      {
        name: "User ID",
        value: `\`${userId}\``,
        inline: false
      },
      {
        name: "Reason",
        value: reason,
        inline: false
      },
      {
        name: "Date",
        value: date,
        inline: true
      },
      {
        name: "Time",
        value: time,
        inline: true
      },
      {
        name: "Case ID",
        value: `\`${caseId}\``,
        inline: false
      }
    ],
    footer: {
      text:
        "Marvel Chronoverse • Moderator Dashboard"
    },
    timestamp: now.toISOString()
  };
  // =========================
  // PUT PHOTO INSIDE EMBED
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
      embeds: [embed],
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
    // =========================
    // ATTACH PHOTO
    // =========================
    if (uploadedFile) {
      const blob = new Blob(
        [uploadedFile.buffer],
        {
          type: uploadedFile.mimeType
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
          body: form
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
    // SUCCESS
    // =========================
    return res.status(200).json({
      success: true,
      caseId: caseId
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
