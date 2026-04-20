const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFixture, usdc } = require("../helpers");

describe("FreelanceEscrow — approveMilestone", function () {
  async function withCompletedMilestone() {
    const fixture = await loadFixture(deployFixture);
    await fixture.escrow.connect(fixture.client).createProject(
      fixture.freelancer.address,
      ["Design", "Build"],
      [usdc(100), usdc(200)]
    );
    await fixture.escrow.connect(fixture.freelancer).completeMilestone(0, 0);
    return fixture;
  }

  it("releases net payment to freelancer (2% fee deducted)", async function () {
    const { escrow, usdc: token, client, freelancer } = await withCompletedMilestone();
    const before = await token.balanceOf(freelancer.address);

    await escrow.connect(client).approveMilestone(0, 0);

    const after = await token.balanceOf(freelancer.address);
    // 100 USDC - 2% = 98 USDC
    expect(after - before).to.equal(usdc(98));
  });

  it("accumulates platform fee correctly", async function () {
    const { escrow, client } = await withCompletedMilestone();
    await escrow.connect(client).approveMilestone(0, 0);
    // 2% of 100 = 2 USDC
    expect(await escrow.accumulatedFees()).to.equal(usdc(2));
  });

  it("emits MilestoneApproved with correct amounts", async function () {
    const { escrow, client } = await withCompletedMilestone();
    await expect(escrow.connect(client).approveMilestone(0, 0))
      .to.emit(escrow, "MilestoneApproved")
      .withArgs(0n, 0n, usdc(98), usdc(2));
  });

  it("sets milestone status to Approved", async function () {
    const { escrow, client } = await withCompletedMilestone();
    await escrow.connect(client).approveMilestone(0, 0);
    const m = await escrow.getMilestone(0, 0);
    expect(m.status).to.equal(2n); // Approved
    expect(m.approvedAt).to.be.gt(0n);
  });

  it("marks project as Completed when all milestones approved", async function () {
    const { escrow, client, freelancer } = await withCompletedMilestone();
    // Complete and approve milestone 1 also
    await escrow.connect(freelancer).completeMilestone(0, 1);
    await escrow.connect(client).approveMilestone(0, 0);
    await escrow.connect(client).approveMilestone(0, 1);

    const [, , , , , status] = await escrow.getProject(0);
    expect(status).to.equal(2n); // Completed
  });

  it("does NOT mark project Completed if one milestone is still Pending", async function () {
    const { escrow, client } = await withCompletedMilestone();
    await escrow.connect(client).approveMilestone(0, 0);

    const [, , , , , status] = await escrow.getProject(0);
    expect(status).to.equal(0n); // Still Active
  });

  it("reverts if caller is not the client", async function () {
    const { escrow, freelancer } = await withCompletedMilestone();
    await expect(
      escrow.connect(freelancer).approveMilestone(0, 0)
    ).to.be.revertedWithCustomError(escrow, "Unauthorized");
  });

  it("reverts if milestone is still Pending (not Completed)", async function () {
    const { escrow, client, freelancer } = await loadFixture(deployFixture);
    await escrow.connect(client).createProject(
      freelancer.address,
      ["Work"],
      [usdc(100)]
    );

    await expect(
      escrow.connect(client).approveMilestone(0, 0)
    ).to.be.revertedWithCustomError(escrow, "InvalidMilestoneStatus");
  });

  it("reverts if milestone is already Approved", async function () {
    const { escrow, client } = await withCompletedMilestone();
    await escrow.connect(client).approveMilestone(0, 0);
    await expect(
      escrow.connect(client).approveMilestone(0, 0)
    ).to.be.revertedWithCustomError(escrow, "InvalidMilestoneStatus");
  });

  it("reverts if project is not Active", async function () {
    const { escrow, client, freelancer } = await withCompletedMilestone();
    await escrow.connect(client).cancelProject(0);

    await expect(
      escrow.connect(client).approveMilestone(0, 0)
    ).to.be.revertedWithCustomError(escrow, "InvalidProjectStatus");
  });

  it("reverts if milestoneIdx is out of bounds", async function () {
    const { escrow, client } = await withCompletedMilestone();

    await expect(
      escrow.connect(client).approveMilestone(0, 99)
    ).to.be.revertedWithCustomError(escrow, "InvalidMilestones");
  });

  it("reverts when paused", async function () {
    const { escrow, client, owner } = await withCompletedMilestone();
    await escrow.connect(owner).pause();

    await expect(
      escrow.connect(client).approveMilestone(0, 0)
    ).to.be.revertedWithCustomError(escrow, "EnforcedPause");
  });
});
