import sql from "../lib/db.js";

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  // =========================
  // DISCORD SETTINGS
  // =========================

  const guildId =
    "1538324229114695753";

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

  const botToken =
    process.env.DISCORD_BOT_TOKEN;


  if (!botToken) {
    return res.status(500).json({
      error: "DISCORD_BOT_TOKEN is missing."
    });
  }


  // =========================
  // CHECK LOGIN
  // =========================

  const cookies =
    req.headers.cookie || "";

  const tokenMatch =
    cookies.match(
      /discord_access_token=([^;]+)/
    );


  if (!tokenMatch) {
    return res.status(401).json({
      error: "You are not logged in."
    });
  }


  const accessToken =
    decodeURIComponent(
      tokenMatch[1]
    );


  // =========================
  // GET DISCORD USER
  // =========================

  let user;


  try {

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
          "Your Discord session has expired."
      });
    }


    user =
      await userResponse.json();


  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error:
        "Unable to retrieve your Discord account."
    });

  }


  // =========================
  // CHECK SERVER + ROLE
  // =========================

  try {

    const memberResponse =
      await fetch(
        `https://discord.com/api/v10/guilds/${guildId}/members/${user.id}`,
        {
          headers: {
            Authorization:
              `Bot ${botToken}`
          }
        }
      );


    if (!memberResponse.ok) {
      return res.status(403).json({
        error:
          "You are not a member of the Chronoverse server."
      });
    }


    const member =
      await memberResponse.json();


    const hasPermission =
      member.roles.some(
        roleId =>
          allowedRoleIds.includes(roleId)
      );


    if (!hasPermission) {
      return res.status(403).json({
        error:
          "You do not have permission to use this system."
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
  // READ REQUEST
  // =========================

  const {
    type,
    discordUserId,
    username,
    reason
  } = req.body || {};


  if (
    !type ||
    !discordUserId ||
    !reason
  ) {

    return res.status(400).json({
      error:
        "Request type, Discord user ID, and reason are required."
    });

  }


  // =========================
  // VALID REQUEST TYPES
  // =========================

  const allowedTypes = [
    "verification",
    "denial"
  ];


  if (
    !allowedTypes.includes(type)
  ) {

    return res.status(400).json({
      error:
        "Invalid request type."
    });

  }


  // =========================
  // SAVE REQUEST
  // =========================

  try {

    const result =
      await sql`

        INSERT INTO requests (

          type,
          discord_user_id,
          username,
          reason,
          status

        )

        VALUES (

          ${type},
          ${discordUserId},
          ${username || null},
          ${reason},
          'pending'

        )

        RETURNING
          id,
          type,
          discord_user_id,
          username,
          reason,
          status,
          created_at

      `;


    return res.status(200).json({

      success:
        true,

      request:
        result[0]

    });


  } catch (error) {

    console.error(error);

    return res.status(500).json({

      error:
        "Unable to create the request."

    });

  }

}
