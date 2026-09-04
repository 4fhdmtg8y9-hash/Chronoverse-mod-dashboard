export default function handler(req, res) {
  const clientId = process.env.DISCORD_CLIENT_ID;

  const redirectUri =
    "https://chronoverse-mod-dashboard.vercel.app/api/auth/callback";

  const discordUrl =
    "https://discord.com/oauth2/authorize" +
    "?client_id=" + encodeURIComponent(clientId) +
    "&response_type=code" +
    "&redirect_uri=" + encodeURIComponent(redirectUri) +
    "&scope=identify%20guilds.members.read";

  res.redirect(302, discordUrl);
}
