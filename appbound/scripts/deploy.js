
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
  console.log("\nAdd to your backend/.env: CONTRACT_ADDRESS=" + address);
}
main().catch((e) => { console.error(e); process.exit(1); });
