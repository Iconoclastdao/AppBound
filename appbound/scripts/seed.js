
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
