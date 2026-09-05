export default function handler(req, res) {
  res.status(200).json({
    success: true,
    message: "Leaderboard API is working!"
  });
}
