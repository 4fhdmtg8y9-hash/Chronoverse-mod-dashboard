export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    action,
    userId,
    username,
    reason
  } = req.body || {};

  if (!action || !userId || !reason) {
    return res.status(400).json({
      error: "Action, user ID, and reason are required."
    });
  }

  const botToken = process.env.DISCORD_BOT_TOKEN;
  const channelId = "1545249591526555658";

  if (!botToken) {
    return res.status(500).json({
      error: "Discord bot token is not configured."
    });
  }

  // Get the logged-in moderator from their Discord login
  const cookies = req.headers.cookie || "";

  const tokenMatch = cookies.match(
    /discord_access_token=([^;]+)/
  );

  if (!tokenMatch) {
    return res.status(401).json({
      error: "You are not logged in with Discord."
    });
  }

  const accessToken = decodeURIComponent(tokenMatch[1]);

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
        error: "Your Discord session has expired. Please log in again."
      });
    }

    const moderatorUser = await userResponse.json();

    const moderatorName =
      moderatorUser.global_name ||
      moderatorUser.username;

    // Roles to ping
    const pingRoles =
      "<@&1538505102644740167> <@&1543383003445723159>";

    const colors = {
      Ban: 0xED4245,
      Warn: 0xFEE75C,
      Unban: 0x57F287,
      Timeout: 0xE67E22,
      Kick: 0x99AAB5,
      Note: 0x5865F2
    };

    const embedColor = colors[action] || 0x5865F2;

    const caseId =
      `#${Date.now().toString().slice(-6)}`;

    const now = new Date();

    const date = now.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "Europe/Paris"
    });

    const time = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Paris"
    });

    const message = {
      content: pingRoles,

      allowed_mentions: {
        roles: [
          "1538505102644740167",
          "1543383003445723159"
        ]
      },

      embeds: [
        {
          title: "🛡️ Moderation Action",
          color: embedColor,

          fields: [
            {
              name: "Moderator",
              value: moderatorName,
              inline: false
            },
            {
              name: "Action",
              value: action,
              inline: false
            },
            {
              name: "User",
              value: username || "Unknown",
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
              value: caseId,
              inline: true
            }
          ],

          footer: {
            text: "Chronoverse Moderator Dashboard"
          }
        }
      ]
    };

    const response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        method: "POST",

        headers: {
          "Authorization": `Bot ${botToken}`,
          "Content-Type": "application/json"
        },

        body: JSON.stringify(message)
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).send(error);
    }

    return res.status(200).json({
      success: true,
      message: "Moderation log sent successfully.",
      caseId
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Failed to send moderation log."
    });
  }
}
