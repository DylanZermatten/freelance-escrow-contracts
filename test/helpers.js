const { ethers } = require("hardhat");

async function deployFixture() {
  const [owner, client, freelancer, other] = await ethers.getSigners();

  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdcToken = await MockUSDC.deploy();
  await usdcToken.waitForDeployment();

  const FreelanceEscrow = await ethers.getContractFactory("FreelanceEscrow");
  const escrow = await FreelanceEscrow.deploy(await usdcToken.getAddress());
  await escrow.waitForDeployment();

  // Fund client with 10,000 mUSDC and pre-approve the escrow contract
  const initialBalance = usdc(10_000);
  await usdcToken.mint(client.address, initialBalance);
  await usdcToken.connect(client).approve(await escrow.getAddress(), initialBalance);

  return { escrow, usdc: usdcToken, owner, client, freelancer, other };
}

/** Parse a human-readable USDC amount to 6-decimal bigint. */
const usdc = (n) => ethers.parseUnits(n.toString(), 6);

module.exports = { deployFixture, usdc };
