#!/usr/bin/env node
/**
 * bootstrap-mvp.js
 * Production-ready scaffolding for AppBound MVP.
 * Usage: node bootstrap-mvp.js
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// Helpers
function safeMkdir(dir) { if (!existsSync(dir)) mkdirSync(dir, { recursive: true }); }
function write(path, content) { writeFileSync(path, content, { encoding: "utf8" }); console.log("WROTE:", path); }

// Directory structure
const root = process.cwd();
[
  "contracts",
  "scripts",
  "backend",
  "frontend",
  "frontend/pages",
  "frontend/styles"
].forEach(d => safeMkdir(join(root, d)));

/* Root package.json */
write(join(root, "package.json"), JSON.stringify({
  name: "appbound-mvp",
  version: "0.1.0",
  private: true,
  scripts: {
    "install:all": "npm install && (cd frontend && npm install) && (cd backend && npm install)",
    "hardhat:compile": "npx hardhat compile",
    "hardhat:node": "npx hardhat node",
    "deploy:local": "npx hardhat run scripts/deploy.js --network localhost",
    "seed:local": "npx hardhat run scripts/seed.js --network localhost",
    "start:backend": "node backend/index.js",
    "start:frontend": "cd frontend && npm run dev",
    "dev:all": "concurrently \"npx hardhat node\" \"node backend/index.js\" \"cd frontend && npm run dev\""
  },
  dependencies: {
    ethers: "^6.7.0",
    dotenv: "^16.0.0",
    express: "^4.18.2",
    cors: "^2.8.5",
    jsonwebtoken: "^9.0.0",
    axios: "^1.4.0"
  },
  devDependencies: {
    hardhat: "^2.16.0",
    "@nomicfoundation/hardhat-toolbox": "^2.0.0",
    "@openzeppelin/contracts": "^4.9.0",
    concurrently: "^8.2.0"
  }
}, null, 2));

/* Hardhat config */
write(join(root, "hardhat.config.js"), `
import "@nomicfoundation/hardhat-toolbox";
module.exports = {
  solidity: "0.8.21",
  networks: {
    hardhat: {},
    localhost: { url: "http://127.0.0.1:8545" }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};
`);

/* Solidity contract */
write(join(root, "contracts", "AppBoundLicense.sol"), `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract AppBoundLicense is ERC721URIStorage, ERC2981, Ownable, ReentrancyGuard {
    uint256 public nextTokenId;
    struct License { string appId; uint64 expiry; }
    mapping(uint256 => License) public licenses;
    mapping(address => mapping(bytes32 => uint256)) public userAppToken;
    event LicenseMinted(address indexed to, uint256 indexed tokenId, string appId, uint64 expiry);
    event LicenseBurned(address indexed owner, uint256 indexed tokenId);

    constructor() ERC721("AppBoundLicense", "ABND") {}

    function mintTo(address to, string calldata appId, string calldata tokenURI, uint64 expiry) external onlyOwner returns (uint256) {
        bytes32 aHash = keccak256(bytes(appId));
        require(userAppToken[to][aHash] == 0, "ALREADY_OWN_THIS_APP");
        uint256 tokenId = ++nextTokenId;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI);
        licenses[tokenId] = License(appId, expiry);
        userAppToken[to][aHash] = tokenId;
        emit LicenseMinted(to, tokenId, appId, expiry);
        return tokenId;
    }

    function burn(uint256 tokenId) external nonReentrant {
        require(ownerOf(tokenId) == msg.sender, "NOT_OWNER");
        bytes32 aHash = keccak256(bytes(licenses[tokenId].appId));
        delete licenses[tokenId];
        delete userAppToken[msg.sender][aHash];
        _burn(tokenId);
        emit LicenseBurned(msg.sender, tokenId);
    }

    function _beforeTokenTransfer(address from, address to, uint256 tokenId) internal override {
        super._beforeTokenTransfer(from, to, tokenId);
        if (from != address(0) && to != address(0)) {
            bytes32 aHash = keccak256(bytes(licenses[tokenId].appId));
            if (userAppToken[from][aHash] == tokenId) delete userAppToken[from][aHash];
            userAppToken[to][aHash] = tokenId;
        }
    }

    function checkLicense(address user, string calldata appId) external view returns (uint256 tokenId, string memory metadataURI, uint64 expiry) {
        bytes32 aHash = keccak256(bytes(appId));
        tokenId = userAppToken[user][aHash];
        if (tokenId != 0) {
            metadataURI = tokenURI(tokenId);
            expiry = licenses[tokenId].expiry;
        }
    }
}
`);

/* scripts/deploy.js */
write(join(root, "scripts", "deploy.js"), `
import { ethers, artifacts } from "hardhat";
import fs from "fs";
async function main() {
  console.log("Compiling + deploying...");
  const License = await ethers.getContractFactory("AppBoundLicense");
  const license = await License.deploy();
  await license.waitForDeployment();
  const address = await license.getAddress();
  console.log("✅ Deployed AppBoundLicense at:", address);
  const artifact = await artifacts.readArtifact("AppBoundLicense");
  fs.writeFileSync("./backend/AppBoundLicenseABI.json", JSON.stringify(artifact.abi, null, 2));
  console.log("\\nAdd to your backend/.env: CONTRACT_ADDRESS=" + address);
}
main().catch((e) => { console.error(e); process.exit(1); });
`);

/* scripts/seed.js */
write(join(root, "scripts", "seed.js"), `
import { ethers } from "hardhat";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();
async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress) throw new Error("CONTRACT_ADDRESS not set in .env");
  const [deployer, user] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("User (demo recipient):", user.address);
  const License = await ethers.getContractFactory("AppBoundLicense");
  const license = License.attach(contractAddress);
  const tx = await license.connect(deployer).mintTo(
    user.address,
    "demo-app",
    "ipfs://demo-metadata",
    0
  );
  await tx.wait();
  console.log("✅ Minted demo license to", user.address);
}
main().catch((e)=>{ console.error(e); process.exit(1); });
`);

/* backend/package.json */
write(join(root, "backend", "package.json"), JSON.stringify({
  name: "appbound-backend",
  version: "0.1.0",
  private: true,
  scripts: { start: "node index.js" },
  dependencies: {
    dotenv: "^16.0.0",
    ethers: "^6.7.0",
    express: "^4.18.2",
    cors: "^2.8.5",
    jsonwebtoken: "^9.0.0"
  }
}, null, 2));

/* backend/index.js */
write(join(root, "backend", "index.js"), `
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
app.listen(port, () => console.log(\`Backend listening on http://localhost:\${port}\`));
`);

/* backend/.env.example */
write(join(root, "backend", ".env.example"), `# Backend environment variables
# Copy this file to backend/.env and fill values (do NOT commit .env)
PROVIDER_URL=http://127.0.0.1:8545
CONTRACT_ADDRESS=0xYourContractAddressAfterDeploy
JWT_SECRET=replace_with_strong_secret
`);

/* frontend/package.json */
write(join(root, "frontend", "package.json"), JSON.stringify({
  name: "appbound-frontend",
  version: "0.1.0",
  private: true,
  scripts: {
    dev: "next dev -p 3000",
    build: "next build",
    start: "next start -p 3000"
  },
  dependencies: {
    react: "18.2.0",
    "react-dom": "18.2.0",
    next: "14.1.0",
    axios: "^1.4.0",
    wagmi: "^1.5.0",
    viem: "^1.3.0"
  }
}, null, 2));

/* frontend/pages/index.js */
write(join(root, "frontend", "pages", "index.js"), `
// frontend/pages/index.js
import React, { useState } from "react";
import axios from "axios";

export default function Home() {
  const [address, setAddress] = useState(null);
  const [message, setMessage] = useState("");

  async function connectWallet() {
    if (!window.ethereum) return alert("Install MetaMask");
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    setAddress(accounts[0]);
  }

  async function checkAccess() {
    if (!address) return alert("Connect wallet first");
    try {
      const res = await axios.post("http://localhost:5000/api/auth", { wallet: address, appId: "demo-app" });
      if (res.data.success) setMessage("✅ Access granted — token: " + res.data.accessToken);
      else setMessage("❌ No license");
    } catch (e) {
      setMessage("❌ Error: " + (e.response?.data?.error || e.message));
    }
  }

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <h1>AppBound — Demo</h1>
      {!address ? (
        <button onClick={connectWallet}>Connect MetaMask</button>
      ) : (
        <div>
          <p>Connected: {address}</p>
          <button onClick={checkAccess}>Check Demo License</button>
        </div>
      )}
      <pre style={{ marginTop: 20 }}>{message}</pre>
      <p style={{ marginTop: 40, color: "#666" }}>
        For local testing: run Hardhat node, deploy contract (scripts/deploy.js), run scripts/seed.js to mint demo license.
      </p>
    </div>
  );
}
`);

/* frontend/.env.example */
write(join(root, "frontend", ".env.example"), `# Frontend config (if needed)
NEXT_PUBLIC_API_URL=http://localhost:5000
`);

/* README.md */
write(join(root, "README.md"), `# AppBound — MVP Bootstrap

This repository was generated by \`bootstrap-mvp.js\`. It contains a minimal production-minded scaffold for the AppBound MVP: smart contract, backend, frontend, and deploy/seed scripts.

## What was created

- \`contracts/AppBoundLicense.sol\` — ERC721 license contract (one license per user per \`appId\`).
- \`scripts/deploy.js\` — Hardhat deploy script (prints deployed address).
- \`scripts/seed.js\` — Mint a demo license to a test account (uses CONTRACT_ADDRESS in .env).
- \`backend/\` — Express backend that validates license on-chain and issues ephemeral JWT tokens.
- \`frontend/\` — Minimal Next.js app to connect MetaMask and check access.
- Root \`package.json\` with helper scripts.

## Required setup (do NOT skip)

1. Install dependencies:
   \`\`\`bash
   npm install
   cd frontend && npm install
   cd ../backend && npm install
   \`\`\`
   Or run root helper:
   \`\`\`bash
   npm run install:all
   \`\`\`

2. Start a local Hardhat node in a separate terminal:
   \`\`\`bash
   npx hardhat node
   \`\`\`

3. Deploy the contract to the local node (in a separate terminal — after step 2):
   \`\`\`bash
   npx hardhat run scripts/deploy.js --network localhost
   \`\`\`
   This prints the deployed address. Copy that address into \`backend/.env\` as \`CONTRACT_ADDRESS\`.

4. Seed a demo license (optional, mints to the second Hardhat account):
   \`\`\`bash
   npx hardhat run scripts/seed.js --network localhost
   \`\`\`
   Make sure \`CONTRACT_ADDRESS\` is set in backend environment.

5. Start backend:
   \`\`\`bash
   node backend/index.js
   \`\`\`

6. Start frontend (in another terminal):
   \`\`\`bash
   cd frontend
   npm run dev
   # open http://localhost:3000
   \`\`\`

## Notes & Production Hardening

* **DO NOT** store private keys in plaintext. Use KMS/HSM for any signing operations in production.
* Add DB-backed nonces, signature flows, rate limiting, and CAPTCHA before enabling public minting or relayer services.
* Add HTTPS, helmet, CORS rules, logging, and monitoring to backend.
* Consider Wallet-as-a-Service (Web3Auth, Magic) or custodial workflows for non-crypto onboarding.
* Add tests: Hardhat unit tests, backend integration tests, and frontend E2E tests.

## Next steps (recommended)

* Add EIP-712 gasless mint (mintWithSig) + relayer.
* Add ERC-2981 royalty defaults and marketplace integration.
* Implement per-token AI instance provisioning or a shared backend with per-token quotas.
* Build SDK for third-party devs to integrate AppBound into their apps.

Happy building! — AppBound bootstrap
`);

/* .gitignore */
write(join(root, ".gitignore"), `
node_modules
.env
backend/.env
frontend/.env.local
artifacts
cache
dist
.env.local
`);

/* Final message */
console.log("\n✅ Scaffolding complete — production-ready template created.");
console.log("\nNEXT STEPS:");
console.log("1) Review and edit backend/.env.example → backend/.env (set CONTRACT_ADDRESS after deploy).");
console.log("2) Run npm install (root) and install frontend/backend deps:");
console.log("   npm run install:all");
console.log("3) Start a local Hardhat node: npx hardhat node");
console.log("4) Deploy contract: npx hardhat run scripts/deploy.js --network localhost");
console.log("   (Copy printed CONTRACT_ADDRESS into backend/.env and restart backend if needed)");
console.log("5) Seed demo license: npx hardhat run scripts/seed.js --network localhost");
console.log("6) Start backend: node backend/index.js");
console.log("7) Start frontend: cd frontend && npm run dev (open http://localhost:3000)");
console.log("\nSecurity reminder: NEVER commit your .env files or private keys to source control. Use KMS for production secrets.\n");
