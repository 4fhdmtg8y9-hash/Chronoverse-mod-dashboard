import sql from "../lib/db.js";

const GUILD_ID = "1538324229114695753";

const ALLOWED_ROLE_IDS = [
  "1538324425546666114",
  "1538505102644740167",
  "1543383003445723159",
  "1538626569831055390",
  "1538626890649174170",
  "1538534696483426365",
  "1538569564340879420",
  "1538569917471916083"
];

const BOT_TOKEN =
  process.env.DISCORD_BOT_TOKEN;


// =========================
// CHECK MODERATOR
// =========================

async function getModerator(req) {

  const cookies =
    req.headers.cookie || "";

  const tokenMatch =
    cookies.match(
      /discord_access_token=([^;]+)/
    );

  if (!tokenMatch) {
    throw new Error("NOT_LOGGED_IN");
  }

  const accessToken =
    decodeURIComponent(
      tokenMatch[1]
    );


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
    throw new Error("SESSION_EXPIRED");
  }


  const user =
    await userResponse.json();


  const memberResponse =
    await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${user.id}`,
      {
        headers: {
          Authorization:
            `Bot ${BOT_TOKEN}`
        }
      }
    );


  if (!memberResponse.ok) {
    throw new Error("NOT_MEMBER");
  }


  const member =
    await memberResponse.json();


  const hasPermission =
    member.roles.some(
      roleId =>
        ALLOWED_ROLE_IDS.includes(roleId)
    );


  if (!hasPermission) {
    throw new Error("NO_PERMISSION");
  }


  return user;
}


// =========================
// API
// =========================

export default async function handler(req, res) {

  if (!BOT_TOKEN) {
    return res.status(500).json({
      error:
        "DISCORD_BOT_TOKEN is missing."
    });
  }


  // =========================
  // AUTHORIZATION
  // =========================

  let moderator;


  try {

    moderator =
      await getModerator(req);

  } catch (error) {

    if (
      error.message ===
      "NOT_LOGGED_IN"
    ) {

      return res.status(401).json({
        error:
          "You are not logged in."
      });

    }


    if (
      error.message ===
      "SESSION_EXPIRED"
    ) {

      return res.status(401).json({
        error:
          "Your Discord session has expired."
      });

    }


    if (
      error.message ===
      "NOT_MEMBER"
    ) {

      return res.status(403).json({
        error:
          "You are not a member of the Chronoverse server."
      });

    }


    if (
      error.message ===
      "NO_PERMISSION"
    ) {

      return res.status(403).json({
        error:
          "You do not have permission to manage requests."
      });

    }


    console.error(error);

    return res.status(500).json({
      error:
        "Unable to verify your permissions."
    });

  }


  // =========================
  // GET REQUESTS
  // =========================

  if (req.method === "GET") {

    try {

      const requests =
        await sql`

          SELECT
            id,
            type,
            discord_user_id,
            username,
            reason,
            status,
            reviewed_by,
            reviewed_at,
            created_at

          FROM requests

          ORDER BY
            created_at DESC

        `;


      return res.status(200).json({

        success:
          true,

        requests

      });


    } catch (error) {

      console.error(error);

      return res.status(500).json({

        error:
          "Unable to load requests."

      });

    }

  }


  // =========================
  // APPROVE / DENY
  // =========================

  if (req.method === "PATCH") {

    try {

      const {
        id,
        status
      } = req.body || {};


      if (!id) {

        return res.status(400).json({
          error:
            "Request ID is required."
        });

      }


      if (
        status !== "approved" &&
        status !== "denied"
      ) {

        return res.status(400).json({
          error:
            "Status must be approved or denied."
        });

      }


      const result =
        await sql`

          UPDATE requests

          SET
            status = ${status},
            reviewed_by = ${moderator.id},
            reviewed_at = CURRENT_TIMESTAMP

          WHERE id = ${id}

          RETURNING
            id,
            type,
            discord_user_id,
            username,
            reason,
            status,
            reviewed_by,
            reviewed_at,
            created_at

        `;


      if (
        result.length === 0
      ) {

        return res.status(404).json({
          error:
            "Request not found."
        });

      }


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
          "Unable to update the request."

      });

    }

  }


  return res.status(405).json({
    error:
      "Method not allowed."
  });

}
