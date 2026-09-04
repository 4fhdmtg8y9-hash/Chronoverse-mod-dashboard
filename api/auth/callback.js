export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send("Missing Discord authorization code.");
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  const redirectUri =
    "https://chronoverse-mod-dashboard.vercel.app/api/auth/callback";

  try {
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
          code: code,
          redirect_uri: redirectUri
        })
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      return res.status(400).json(tokenData);
    }

    const userResponse = await fetch(
      "https://discord.com/api/users/@me",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        }
      }
    );

    const user = await userResponse.json();

    res.status(200).send(`
      <html>
        <head>
          <title>Moderator Dashboard</title>
          <style>
            body {
              background: #0d0d12;
              color: white;
              font-family: Arial, sans-serif;
              text-align: center;
              padding-top: 100px;
            }
          </style>
        </head>
        <body>
          <h1>Welcome, ${user.global_name || user.username}!</h1>
          <p>Discord login successful.</p>
        </body>
      </html>
    `);

  } catch (error) {
    console.error(error);
    res.status(500).send("Something went wrong.");
  }
}
