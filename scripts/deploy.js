const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH\n");

  // 1. Deploy MockUSDC
  console.log("Deploying MockUSDC...");
  const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("MockUSDC deployed:", usdcAddress);

  // 2. Deploy FreelanceEscrow
  console.log("Deploying FreelanceEscrow...");
  const FreelanceEscrow = await hre.ethers.getContractFactory("FreelanceEscrow");
  const escrow = await FreelanceEscrow.deploy(usdcAddress);
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log("FreelanceEscrow deployed:", escrowAddress);

  // 3. Etherscan verification (Sepolia only)
  if (hre.network.name === "sepolia") {
    console.log("\nWaiting for 5 confirmations before verification...");
    await escrow.deploymentTransaction().wait(5);

    console.log("Verifying MockUSDC on Etherscan...");
    try {
      await hre.run("verify:verify", { address: usdcAddress, constructorArguments: [] });
    } catch (e) {
      console.log("MockUSDC verify:", e.message);
    }

    console.log("Verifying FreelanceEscrow on Etherscan...");
    try {
      await hre.run("verify:verify", {
        address: escrowAddress,
        constructorArguments: [usdcAddress],
      });
    } catch (e) {
      console.log("FreelanceEscrow verify:", e.message);
    }
  }

  // 4. Save deployment info
  const deploymentDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentDir)) fs.mkdirSync(deploymentDir);

  const network = await hre.ethers.provider.getNetwork();
  const info = {
    network: hre.network.name,
    chainId: network.chainId.toString(),
    mockUSDC: usdcAddress,
    freelanceEscrow: escrowAddress,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    blockNumber: await hre.ethers.provider.getBlockNumber(),
  };

  const outPath = path.join(deploymentDir, `${hre.network.name}.json`);
  fs.writeFileSync(outPath, JSON.stringify(info, null, 2));
  console.log("\nDeployment info saved to deployments/" + hre.network.name + ".json");
  console.log(JSON.stringify(info, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
