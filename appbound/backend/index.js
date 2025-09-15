
/**
 * backend/index.js
 * Minimal Express server: loads ABI, CONTRACT_ADDRESS from env.
 * Exposes /api/auth that issues ephemeral JWT on valid license.
 * Add DB, nonce-signature flows, rate limits, logging for production.
 */
import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import cors from "cors";
import jwt from "jsonwebtoken";
import { ethers } from "ethers";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PROVIDER_URL = process.env.PROVIDER_URL || "http://127.0.0.1:8545";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";
if (!CONTRACT_ADDRESS) {
  console.error("❌ CONTRACT_ADDRESS not set in backend/.env");
  process.exit(1);
}
const abiPath = "./AppBoundLicenseABI.json";
if (!fs.existsSync(abiPath)) {
  console.error("❌ ABI not found. Run the deploy script.");
  process.exit(1);
}
const abi = JSON.parse(fs.readFileSync(abiPath));
const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

app.post("/api/auth", async (req, res) => {
  const { wallet, appId } = req.body;
  if (!wallet || !appId) return res.status(400).json({ error: "wallet and appId required" });
  try {
    const tokenId = await contract.userAppToken(wallet, ethers.keccak256(ethers.toUtf8Bytes(appId)));
    if (tokenId == 0n) return res.status(403).json({ error: "No license for this wallet & appId" });
    const meta = await contract.checkLicense(wallet, appId);
    const expiry = meta.expiry ? Number(meta.expiry) : 0;
    if (expiry !== 0 && Math.floor(Date.now() / 1000) > expiry) return res.status(403).json({ error: "License expired" });
    const token = jwt.sign({ wallet, appId, tokenId: tokenId.toString() }, JWT_SECRET, { expiresIn: "15m" });
    return res.json({ success: true, accessToken: token, tokenId: tokenId.toString() });
  } catch (e) {
    console.error(e); return res.status(500).json({ error: "server error" });
  }
});
const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Backend listening on http://localhost:${port}`));
