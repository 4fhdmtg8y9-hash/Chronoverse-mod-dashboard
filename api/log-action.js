export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, userId, username, reason } = req.body || {};

  if (!action || !userId || !reason) {
    return res.status(400).json({
      error: "Action, user ID, and reason are required."
    });
  }

  const botToken = process.env.DISCORD_BOT_TOKEN;
  const channelId = "1545249591526555658";

  try {
    const message = {
      embeds: [
        {
          title: `🛡️ ${action}`,
          color: 0x5865F2,
          fields: [
            {
              name: "User",
              value: `${username || "Unknown"} (${userId})`,
              inline: false
            },
            {
              name: "Reason",
              value: reason,
              inline: false
            }
          ],
          timestamp: new Date().toISOString(),
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
      message: "Moderation action logged."
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Failed to send moderation log."
    });
  }
}
