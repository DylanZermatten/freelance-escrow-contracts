const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFixture, usdc } = require("../helpers");

describe("FreelanceEscrow — createProject", function () {
  describe("Success cases", function () {
    it("creates a project with 1 milestone and emits ProjectCreated", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);

      await expect(
        escrow.connect(client).createProject(freelancer.address, ["Design logo"], [usdc(100)])
      )
        .to.emit(escrow, "ProjectCreated")
        .withArgs(0n, client.address, freelancer.address, usdc(100), 1n, 200n);

      const [c, f, total, feeBps, , status, count] = await escrow.getProject(0);
      expect(c).to.equal(client.address);
      expect(f).to.equal(freelancer.address);
      expect(total).to.equal(usdc(100));
      expect(feeBps).to.equal(200n);
      expect(status).to.equal(0n); // Active
      expect(count).to.equal(1n);
    });

    it("creates a project with 3 milestones", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);

      await escrow.connect(client).createProject(
        freelancer.address,
        ["Design", "Build", "Deploy"],
        [usdc(100), usdc(200), usdc(300)]
      );

      const [, , total, , , , count] = await escrow.getProject(0);
      expect(total).to.equal(usdc(600));
      expect(count).to.equal(3n);
    });

    it("transfers total tokens into escrow", async function () {
      const { escrow, usdc: token, client, freelancer } = await loadFixture(deployFixture);
      const escrowAddress = await escrow.getAddress();
      const before = await token.balanceOf(escrowAddress);

      await escrow.connect(client).createProject(
        freelancer.address,
        ["A", "B"],
        [usdc(100), usdc(200)]
      );

      expect(await token.balanceOf(escrowAddress) - before).to.equal(usdc(300));
    });

    it("locks the fee at creation time (owner change does not affect existing project)", async function () {
      const { escrow, client, freelancer, owner } = await loadFixture(deployFixture);

      await escrow.connect(client).createProject(freelancer.address, ["Work"], [usdc(100)]);
      await escrow.connect(owner).setDefaultPlatformFee(500); // change to 5%

      const [, , , feeBps] = await escrow.getProject(0);
      expect(feeBps).to.equal(200n); // still 2%
    });

    it("registers project in client and freelancer index", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);

      await escrow.connect(client).createProject(freelancer.address, ["Work"], [usdc(100)]);

      expect(await escrow.getProjectsByClient(client.address)).to.deep.equal([0n]);
      expect(await escrow.getProjectsByFreelancer(freelancer.address)).to.deep.equal([0n]);
    });

    it("increments projectCount for each new project", async function () {
      const { escrow, usdc: token, client, freelancer } = await loadFixture(deployFixture);

      await token.mint(client.address, usdc(1000));
      await token.connect(client).approve(await escrow.getAddress(), usdc(1000));

      await escrow.connect(client).createProject(freelancer.address, ["P1"], [usdc(100)]);
      await escrow.connect(client).createProject(freelancer.address, ["P2"], [usdc(100)]);

      expect(await escrow.projectCount()).to.equal(2n);
    });
  });

  describe("Failure cases", function () {
    it("reverts if freelancer is zero address", async function () {
      const { escrow, client } = await loadFixture(deployFixture);
      await expect(
        escrow.connect(client).createProject(ethers.ZeroAddress, ["Work"], [usdc(100)])
      ).to.be.revertedWithCustomError(escrow, "InvalidAddress");
    });

    it("reverts if freelancer == client", async function () {
      const { escrow, client } = await loadFixture(deployFixture);
      await expect(
        escrow.connect(client).createProject(client.address, ["Work"], [usdc(100)])
      ).to.be.revertedWithCustomError(escrow, "InvalidAddress");
    });

    it("reverts if descriptions and amounts have different lengths", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      await expect(
        escrow.connect(client).createProject(freelancer.address, ["A", "B"], [usdc(100)])
      ).to.be.revertedWithCustomError(escrow, "InvalidMilestones");
    });

    it("reverts if no milestones", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      await expect(
        escrow.connect(client).createProject(freelancer.address, [], [])
      ).to.be.revertedWithCustomError(escrow, "InvalidMilestones");
    });

    it("reverts if more than MAX_MILESTONES (20)", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      const descs = Array(21).fill("x");
      const amounts = Array(21).fill(usdc(1));
      await expect(
        escrow.connect(client).createProject(freelancer.address, descs, amounts)
      ).to.be.revertedWithCustomError(escrow, "InvalidMilestones");
    });

    it("reverts if a milestone amount is 0", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      await expect(
        escrow.connect(client).createProject(freelancer.address, ["Work"], [0])
      ).to.be.revertedWithCustomError(escrow, "InvalidAmount");
    });

    it("reverts if description exceeds MAX_DESCRIPTION_LENGTH", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      const longDesc = "x".repeat(201);
      await expect(
        escrow.connect(client).createProject(freelancer.address, [longDesc], [usdc(100)])
      ).to.be.revertedWithCustomError(escrow, "DescriptionTooLong");
    });

    it("reverts if client has not approved enough tokens", async function () {
      const { escrow, usdc: token, client, freelancer } = await loadFixture(deployFixture);
      await token.connect(client).approve(await escrow.getAddress(), 0);
      await expect(
        escrow.connect(client).createProject(freelancer.address, ["Work"], [usdc(100)])
      ).to.be.reverted;
    });

    it("reverts when paused", async function () {
      const { escrow, client, freelancer, owner } = await loadFixture(deployFixture);
      await escrow.connect(owner).pause();
      await expect(
        escrow.connect(client).createProject(freelancer.address, ["Work"], [usdc(100)])
      ).to.be.revertedWithCustomError(escrow, "EnforcedPause");
    });
  });
});
