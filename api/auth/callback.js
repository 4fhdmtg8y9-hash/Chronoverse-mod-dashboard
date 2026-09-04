export default async function handler(req, res) {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send("Missing Discord authorization code.");
  }
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri =
    "https://chronoverse-mod-dashboard.vercel.app/api/auth/callback";
  const guildId = "1538324229114695753";
  const allowedRoles = [
    "1538324425546666114", // Founder
    "1538505102644740167", // Chronarch Overseer
    "1543383003445723159", // Executive Division
    "1538626569831055390", // Nexus Director
    "1538626890649174170", // Administrator
    "1538534696483426365", // Lead Moderator
    "1538569564340879420", // Senior Moderator
    "1538569917471916083"  // Moderator
  ];
  try {
    // Exchange Discord authorization code for an access token
    const tokenResponse = await fetch(
      "https://discord.com/api/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri
        })
      }
    );
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      return res.status(400).json(tokenData);
    }
    const accessToken = tokenData.access_token;
    // Get the Discord user
    const userResponse = await fetch(
      "https://discord.com/api/users/@me",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );
    if (!userResponse.ok) {
      return res.status(401).send("Unable to retrieve your Discord account.");
    }
    const user = await userResponse.json();
    // Check Chronoverse membership
    const memberResponse = await fetch(
      `https://discord.com/api/users/@me/guilds/${guildId}/member`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );
    if (!memberResponse.ok) {
      return res
        .status(403)
        .send("Access denied. You are not a member of the Chronoverse server.");
    }
    const member = await memberResponse.json();
    // Check approved staff role
    const isModerator = member.roles.some(roleId =>
      allowedRoles.includes(roleId)
    );
    if (!isModerator) {
      return res
        .status(403)
        .send("Access denied. You do not have an approved moderator role.");
    }
    /*
      Store the Discord access token in an HttpOnly cookie.
      The browser cannot read this cookie with JavaScript,
      but your server-side API routes can use it to identify
      the logged-in moderator.
    */
    const cookie = [
      `discord_access_token=${encodeURIComponent(accessToken)}`,
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      "Path=/",
      "Max-Age=604800"
    ].join("; ");
    res.setHeader("Set-Cookie", cookie);
    // Send the approved moderator to the dashboard
    return res.redirect(302, "/dashboard.html");
  } catch (error) {
    console.error(error);
    return res.status(500).send(
      "Something went wrong while signing you in."
    );
  }
}
