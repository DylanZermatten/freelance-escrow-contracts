const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFixture, usdc } = require("../helpers");

describe("FreelanceEscrow — completeMilestone", function () {
  async function withProject() {
    const fixture = await loadFixture(deployFixture);
    await fixture.escrow.connect(fixture.client).createProject(
      fixture.freelancer.address,
      ["Design", "Build"],
      [usdc(100), usdc(200)]
    );
    return fixture;
  }

  it("marks milestone as Completed and emits event", async function () {
    const { escrow, freelancer } = await withProject();

    await expect(escrow.connect(freelancer).completeMilestone(0, 0))
      .to.emit(escrow, "MilestoneCompleted")
      .withArgs(0n, 0n, (ts) => ts > 0n);

    const m = await escrow.getMilestone(0, 0);
    expect(m.status).to.equal(1n); // Completed
    expect(m.completedAt).to.be.gt(0n);
  });

  it("can complete milestones in any order", async function () {
    const { escrow, freelancer } = await withProject();
    await escrow.connect(freelancer).completeMilestone(0, 1);
    const m = await escrow.getMilestone(0, 1);
    expect(m.status).to.equal(1n);
  });

  it("reverts if caller is not the freelancer", async function () {
    const { escrow, client } = await withProject();
    await expect(
      escrow.connect(client).completeMilestone(0, 0)
    ).to.be.revertedWithCustomError(escrow, "Unauthorized");
  });

  it("reverts if milestone is already Completed", async function () {
    const { escrow, freelancer } = await withProject();
    await escrow.connect(freelancer).completeMilestone(0, 0);
    await expect(
      escrow.connect(freelancer).completeMilestone(0, 0)
    ).to.be.revertedWithCustomError(escrow, "InvalidMilestoneStatus");
  });

  it("reverts if milestoneIdx is out of bounds", async function () {
    const { escrow, freelancer } = await withProject();
    await expect(
      escrow.connect(freelancer).completeMilestone(0, 99)
    ).to.be.revertedWithCustomError(escrow, "InvalidMilestones");
  });

  it("reverts if project does not exist", async function () {
    const { escrow, freelancer } = await withProject();
    await expect(
      escrow.connect(freelancer).completeMilestone(99, 0)
    ).to.be.revertedWithCustomError(escrow, "ProjectNotFound");
  });
});
