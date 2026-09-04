import Busboy from "busboy";

export const config = {
  api: {
    bodyParser: false
  }
};


export default async function handler(req, res) {

  if (req.method !== "POST") {

    return res.status(405).json({
      error: "Method not allowed"
    });

  }


  const botToken =
    process.env.DISCORD_BOT_TOKEN;

  const channelId =
    "1545249591526555658";


  if (!botToken) {

    return res.status(500).json({
      error: "Discord bot token is not configured."
    });

  }


  // Get logged-in moderator
  const cookies =
    req.headers.cookie || "";


  const tokenMatch =
    cookies.match(
      /discord_access_token=([^;]+)/
    );


  if (!tokenMatch) {

    return res.status(401).json({
      error: "You are not logged in with Discord."
    });

  }


  const accessToken =
    decodeURIComponent(tokenMatch[1]);


  try {

    // Get moderator's Discord account
    const userResponse =
      await fetch(
        "https://discord.com/api/users/@me",
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`
          }
        }
      );


    if (!userResponse.ok) {

      return res.status(401).json({
        error:
          "Your Discord session has expired. Please log in again."
      });

    }


    const moderatorUser =
      await userResponse.json();


    // Actual Discord username
    const moderatorName =
      moderatorUser.username;


    // Read multipart form
    const fields = {};
    let evidenceFile = null;


    await new Promise(
      (resolve, reject) => {

        const busboy =
          Busboy({
            headers: req.headers,
            limits: {
              fileSize:
                8 * 1024 * 1024
            }
          });


        busboy.on(
          "field",
          (name, value) => {

            fields[name] =
              value;

          }
        );


        busboy.on(
          "file",
          (
            name,
            file,
            info
          ) => {

            const chunks = [];

            const {
              filename,
              mimeType
            } = info;


            file.on(
              "data",
              chunk => {

                chunks.push(chunk);

              }
            );


            file.on(
              "end",
              () => {

                if (
                  name === "evidence" &&
                  filename
                ) {

                  evidenceFile = {

                    filename,

                    mimeType,

                    buffer:
                      Buffer.concat(chunks)

                  };

                }

              }
            );

          }
        );


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


    const action =
      fields.action;

    const userId =
      fields.userId;

    const username =
      fields.username;

    const reason =
      fields.reason;


    if (
      !action ||
      !userId ||
      !reason
    ) {

      return res.status(400).json({
        error:
          "Action, user ID, and reason are required."
      });

    }


    // Allowed actions
    const validActions = [
      "Warn",
      "Kick",
      "Ban",
      "Unban",
      "Timeout",
      "Note"
    ];


    if (!validActions.includes(action)) {

      return res.status(400).json({
        error:
          "Invalid moderation action."
      });

    }


    // Embed colors
    const colors = {

      Ban:
        0xED4245,

      Warn:
        0xFEE75C,

      Unban:
        0x57F287,

      Timeout:
        0xE67E22,

      Kick:
        0x99AAB5,

      Note:
        0x5865F2

    };


    const embedColor =
      colors[action] ||
      0x5865F2;


    // Automatic Case ID
    const caseId =
      `#${Date.now().toString().slice(-6)}`;


    const now =
      new Date();


    const date =
      now.toLocaleDateString(
        "en-US",
        {
          month: "long",
          day: "numeric",
          year: "numeric",
          timeZone:
            "Europe/Paris"
        }
      );


    const time =
      now.toLocaleTimeString(
        "en-US",
        {
          hour: "2-digit",
          minute: "2-digit",
          timeZone:
            "Europe/Paris"
        }
      );


    const fields = [

      {
        name:
          "Moderator",

        value:
          moderatorName,

        inline:
          false
      },


      {
        name:
          "Action",

        value:
          action,

        inline:
          false
      },


      {
        name:
          "User",

        value:
          username ||
          "Unknown",

        inline:
          false
      },


      {
        name:
          "User ID",

        value:
          `\`${userId}\``,

        inline:
          false
      },


      {
        name:
          "Reason",

        value:
          reason,

        inline:
          false
      }

    ];


    // Add evidence information
    if (evidenceFile) {

      fields.push({

        name:
          "📸 Evidence",

        value:
          "Evidence attached below.",

        inline:
          false

      });

    } else {

      fields.push({

        name:
          "📸 Evidence",

        value:
          "No evidence provided.",

        inline:
          false

      });

    }


    fields.push(

      {
        name:
          "Date",

        value:
          date,

        inline:
          true
      },


      {
        name:
          "Time",

        value:
          time,

        inline:
          true
      },


      {
        name:
          "Case ID",

        value:
          caseId,

        inline:
          true
      }

    );


    // Ping roles
    const pingRoles =
      "<@&1538505102644740167> <@&1543383003445723159>";


    const message = {

      content:
        pingRoles,


      allowed_mentions: {

        roles: [
          "1538505102644740167",
          "1543383003445723159"
        ]

      },


      embeds: [

        {

          title:
            "🛡️ Moderation Action",

          color:
            embedColor,

          fields:
            fields,

          footer: {

            text:
              "Chronoverse Moderator Dashboard"

          }

        }

      ]

    };


    // Send message with optional image attachment
    let response;


    if (evidenceFile) {

      const form =
        new FormData();


      form.append(
        "payload_json",
        JSON.stringify(message)
      );


      const blob =
        new Blob(
          [
            evidenceFile.buffer
          ],
          {
            type:
              evidenceFile.mimeType
          }
        );


      form.append(
        "files[0]",
        blob,
        evidenceFile.filename
      );


      response =
        await fetch(
          `https://discord.com/api/v10/channels/${channelId}/messages`,
          {
            method:
              "POST",

            headers: {
              "Authorization":
                `Bot ${botToken}`
            },

            body:
              form
          }
        );

    } else {

      response =
        await fetch(
          `https://discord.com/api/v10/channels/${channelId}/messages`,
          {
            method:
              "POST",

            headers: {

              "Authorization":
                `Bot ${botToken}`,

              "Content-Type":
                "application/json"

            },

            body:
              JSON.stringify(message)

          }
        );

    }


    if (!response.ok) {

      const error =
        await response.text();


      console.error(
        "Discord error:",
        error
      );


      return res
        .status(response.status)
        .send(error);

    }


    return res.status(200).json({

      success:
        true,

      message:
        "Moderation log sent successfully.",

      caseId

    });


  } catch (error) {

    console.error(error);


    return res.status(500).json({

      error:
        "Failed to send moderation log."

    });

  }

}
