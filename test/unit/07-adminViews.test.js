const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFixture, usdc } = require("../helpers");

describe("FreelanceEscrow — admin, constructor & views", function () {
  async function withProjectAndFees() {
    const fixture = await loadFixture(deployFixture);

    await fixture.escrow.connect(fixture.client).createProject(
      fixture.freelancer.address,
      ["Design"],
      [usdc(100)]
    );
    await fixture.escrow.connect(fixture.freelancer).completeMilestone(0, 0);
    await fixture.escrow.connect(fixture.client).approveMilestone(0, 0);

    return fixture;
  }

  describe("constructor", function () {
    it("reverts if payment token address is zero", async function () {
      const FreelanceEscrow = await ethers.getContractFactory("FreelanceEscrow");

      await expect(FreelanceEscrow.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        FreelanceEscrow,
        "InvalidAddress"
      );
    });
  });

  describe("withdrawFees", function () {
    it("owner can withdraw accumulated fees", async function () {
      const { escrow, usdc: token, owner } = await withProjectAndFees();
      const before = await token.balanceOf(owner.address);

      await expect(escrow.connect(owner).withdrawFees(owner.address))
        .to.emit(escrow, "FeesWithdrawn")
        .withArgs(owner.address, usdc(2));

      const after = await token.balanceOf(owner.address);
      expect(after - before).to.equal(usdc(2));
      expect(await escrow.accumulatedFees()).to.equal(0n);
    });

    it("reverts if called by non-owner", async function () {
      const { escrow, client } = await withProjectAndFees();
      await expect(
        escrow.connect(client).withdrawFees(client.address)
      ).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
    });

    it("reverts if recipient is zero address", async function () {
      const { escrow, owner } = await withProjectAndFees();
      await expect(
        escrow.connect(owner).withdrawFees(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(escrow, "InvalidAddress");
    });

    it("reverts if there are no fees to withdraw", async function () {
      const { escrow, owner } = await loadFixture(deployFixture);
      await expect(
        escrow.connect(owner).withdrawFees(owner.address)
      ).to.be.revertedWithCustomError(escrow, "NothingToRefund");
    });
  });

  describe("setDefaultPlatformFee", function () {
    it("owner can update the default platform fee", async function () {
      const { escrow, owner } = await loadFixture(deployFixture);

      await expect(escrow.connect(owner).setDefaultPlatformFee(350))
        .to.emit(escrow, "DefaultFeeUpdated")
        .withArgs(200n, 350n);

      expect(await escrow.defaultPlatformFeeBps()).to.equal(350n);
    });

    it("reverts if new fee is above MAX_FEE_BPS", async function () {
      const { escrow, owner } = await loadFixture(deployFixture);
      await expect(
        escrow.connect(owner).setDefaultPlatformFee(1001)
      ).to.be.revertedWithCustomError(escrow, "FeeTooHigh");
    });

    it("reverts if called by non-owner", async function () {
      const { escrow, client } = await loadFixture(deployFixture);
      await expect(
        escrow.connect(client).setDefaultPlatformFee(300)
      ).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
    });
  });

  describe("pause and unpause", function () {
    it("reverts if pause is called by non-owner", async function () {
      const { escrow, client } = await loadFixture(deployFixture);
      await expect(escrow.connect(client).pause()).to.be.revertedWithCustomError(
        escrow,
        "OwnableUnauthorizedAccount"
      );
    });

    it("reverts if unpause is called by non-owner", async function () {
      const { escrow, owner, client } = await loadFixture(deployFixture);
      await escrow.connect(owner).pause();

      await expect(escrow.connect(client).unpause()).to.be.revertedWithCustomError(
        escrow,
        "OwnableUnauthorizedAccount"
      );
    });
  });

  describe("view functions", function () {
    it("returns all milestones for a project", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      await escrow.connect(client).createProject(
        freelancer.address,
        ["Design", "Build"],
        [usdc(100), usdc(200)]
      );

      const milestones = await escrow.getAllMilestones(0);
      expect(milestones).to.have.length(2);
      expect(milestones[0].description).to.equal("Design");
      expect(milestones[1].amount).to.equal(usdc(200));
    });

    it("getProject reverts if project does not exist", async function () {
      const { escrow } = await loadFixture(deployFixture);
      await expect(escrow.getProject(999)).to.be.revertedWithCustomError(
        escrow,
        "ProjectNotFound"
      );
    });

    it("getMilestone reverts if project does not exist", async function () {
      const { escrow } = await loadFixture(deployFixture);
      await expect(escrow.getMilestone(999, 0)).to.be.revertedWithCustomError(
        escrow,
        "ProjectNotFound"
      );
    });

    it("getMilestone reverts if milestoneIdx is out of bounds", async function () {
      const { escrow, client, freelancer } = await loadFixture(deployFixture);
      await escrow.connect(client).createProject(
        freelancer.address,
        ["Design"],
        [usdc(100)]
      );

      await expect(escrow.getMilestone(0, 1)).to.be.revertedWithCustomError(
        escrow,
        "InvalidMilestones"
      );
    });

    it("getAllMilestones reverts if project does not exist", async function () {
      const { escrow } = await loadFixture(deployFixture);
      await expect(escrow.getAllMilestones(999)).to.be.revertedWithCustomError(
        escrow,
        "ProjectNotFound"
      );
    });
  });

  describe("MockUSDC", function () {
    it("uses 6 decimals", async function () {
      const { usdc: token } = await loadFixture(deployFixture);
      expect(await token.decimals()).to.equal(6n);
    });

    it("faucet mints the fixed faucet amount to caller", async function () {
      const { usdc: token, other } = await loadFixture(deployFixture);
      const before = await token.balanceOf(other.address);

      await token.connect(other).faucet();

      const after = await token.balanceOf(other.address);
      expect(after - before).to.equal(await token.FAUCET_AMOUNT());
    });
  });
});
