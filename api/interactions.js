import crypto from "crypto";

export const runtime = "nodejs";

export const config = {
  api: {
    bodyParser: false
  }
};

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function verifyDiscordRequest(rawBody, signature, timestamp) {
  try {
    if (!PUBLIC_KEY) return false;

    const publicKeyDer = Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      Buffer.from(PUBLIC_KEY, "hex")
    ]);

    const publicKey = crypto.createPublicKey({
      key: publicKeyDer,
      format: "der",
      type: "spki"
    });

    return crypto.verify(
      null,
      Buffer.from(timestamp + rawBody.toString()),
      publicKey,
      Buffer.from(signature, "hex")
    );
  } catch (error) {
    console.error("Verification error:", error);
    return false;
  }
}

export default async function handler(req, res) {

  // Browser test
  if (req.method !== "POST") {
    return res.status(200).json({
      status: "Discord interactions endpoint is online."
    });
  }

  if (!PUBLIC_KEY) {
    return res.status(500).json({
      error: "DISCORD_PUBLIC_KEY is missing."
    });
  }

  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];

  if (!signature || !timestamp) {
    return res.status(401).json({
      error: "Missing Discord signature."
    });
  }

  const rawBody = await getRawBody(req);

  if (!verifyDiscordRequest(rawBody, signature, timestamp)) {
    return res.status(401).json({
      error: "Invalid Discord signature."
    });
  }

  let interaction;

  try {
    interaction = JSON.parse(rawBody.toString());
  } catch {
    return res.status(400).json({
      error: "Invalid JSON."
    });
  }

  // Discord Ping
  if (interaction.type === 1) {
    return res.status(200).json({
      type: 1
    });
  }

  return res.status(200).json({
    type: 4,
    data: {
      content: "Interaction received.",
      flags: 64
    }
  });
}
