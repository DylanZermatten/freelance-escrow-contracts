const { expect } = require("chai");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFixture, usdc } = require("../helpers");

const FOURTEEN_DAYS = 14 * 24 * 60 * 60;

describe("FreelanceEscrow — claimExpiredMilestone (auto-release)", function () {
  async function withCompletedMilestone() {
    const fixture = await loadFixture(deployFixture);
    await fixture.escrow.connect(fixture.client).createProject(
      fixture.freelancer.address,
      ["Work"],
      [usdc(100)]
    );
    await fixture.escrow.connect(fixture.freelancer).completeMilestone(0, 0);
    return fixture;
  }

  it("reverts if called before 14-day deadline", async function () {
    const { escrow, freelancer } = await withCompletedMilestone();
    const milestone = await escrow.getMilestone(0, 0);
    await time.increaseTo(Number(milestone.completedAt) + FOURTEEN_DAYS - 2);
    await expect(
      escrow.connect(freelancer).claimExpiredMilestone(0, 0)
    ).to.be.revertedWithCustomError(escrow, "AutoReleaseNotReached");
  });

  it("succeeds exactly after 14 days and pays net amount", async function () {
    const { escrow, usdc: token, freelancer } = await withCompletedMilestone();
    await time.increase(FOURTEEN_DAYS + 1);

    const before = await token.balanceOf(freelancer.address);
    await escrow.connect(freelancer).claimExpiredMilestone(0, 0);
    const after = await token.balanceOf(freelancer.address);

    // 100 - 2% fee = 98
    expect(after - before).to.equal(usdc(98));
  });

  it("emits MilestoneClaimed with correct amounts", async function () {
    const { escrow, freelancer } = await withCompletedMilestone();
    await time.increase(FOURTEEN_DAYS + 1);
    await expect(escrow.connect(freelancer).claimExpiredMilestone(0, 0))
      .to.emit(escrow, "MilestoneClaimed")
      .withArgs(0n, 0n, usdc(98), usdc(2));
  });

  it("sets milestone status to Claimed", async function () {
    const { escrow, freelancer } = await withCompletedMilestone();
    await time.increase(FOURTEEN_DAYS + 1);
    await escrow.connect(freelancer).claimExpiredMilestone(0, 0);
    const m = await escrow.getMilestone(0, 0);
    expect(m.status).to.equal(3n); // Claimed
  });

  it("reverts if milestone is under dispute (project Disputed)", async function () {
    const { escrow, client, freelancer } = await withCompletedMilestone();
    await escrow.connect(client).raiseDispute(0, 0, "Not satisfied");
    await time.increase(FOURTEEN_DAYS + 1);
    await expect(
      escrow.connect(freelancer).claimExpiredMilestone(0, 0)
    ).to.be.revertedWithCustomError(escrow, "InvalidProjectStatus");
  });

  it("reverts if caller is not the freelancer", async function () {
    const { escrow, client } = await withCompletedMilestone();
    await time.increase(FOURTEEN_DAYS + 1);
    await expect(
      escrow.connect(client).claimExpiredMilestone(0, 0)
    ).to.be.revertedWithCustomError(escrow, "Unauthorized");
  });

  it("reverts if milestone is still Pending", async function () {
    const { escrow, client, freelancer } = await loadFixture(deployFixture);
    await escrow.connect(client).createProject(
      freelancer.address,
      ["Work"],
      [usdc(100)]
    );

    await time.increase(FOURTEEN_DAYS + 1);
    await expect(
      escrow.connect(freelancer).claimExpiredMilestone(0, 0)
    ).to.be.revertedWithCustomError(escrow, "InvalidMilestoneStatus");
  });

  it("reverts if milestoneIdx is out of bounds", async function () {
    const { escrow, freelancer } = await withCompletedMilestone();
    await time.increase(FOURTEEN_DAYS + 1);

    await expect(
      escrow.connect(freelancer).claimExpiredMilestone(0, 99)
    ).to.be.revertedWithCustomError(escrow, "InvalidMilestones");
  });

  it("reverts when paused", async function () {
    const { escrow, freelancer, owner } = await withCompletedMilestone();
    await time.increase(FOURTEEN_DAYS + 1);
    await escrow.connect(owner).pause();

    await expect(
      escrow.connect(freelancer).claimExpiredMilestone(0, 0)
    ).to.be.revertedWithCustomError(escrow, "EnforcedPause");
  });
});
