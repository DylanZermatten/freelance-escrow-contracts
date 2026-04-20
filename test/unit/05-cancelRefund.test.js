const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFixture, usdc } = require("../helpers");

describe("FreelanceEscrow — cancelProject", function () {
  async function withProject() {
    const fixture = await loadFixture(deployFixture);
    await fixture.escrow.connect(fixture.client).createProject(
      fixture.freelancer.address,
      ["Design", "Build", "Deploy"],
      [usdc(100), usdc(200), usdc(300)]
    );
    return fixture;
  }

  it("refunds all Pending milestones to the client", async function () {
    const { escrow, usdc: token, client } = await withProject();
    const before = await token.balanceOf(client.address);

    await escrow.connect(client).cancelProject(0);

    const after = await token.balanceOf(client.address);
    expect(after - before).to.equal(usdc(600));
  });

  it("emits ProjectCancelled with total refund amount", async function () {
    const { escrow, client } = await withProject();
    await expect(escrow.connect(client).cancelProject(0))
      .to.emit(escrow, "ProjectCancelled")
      .withArgs(0n, usdc(600));
  });

  it("sets project status to Cancelled", async function () {
    const { escrow, client } = await withProject();
    await escrow.connect(client).cancelProject(0);
    const [, , , , , status] = await escrow.getProject(0);
    expect(status).to.equal(1n); // Cancelled
  });

  it("does not refund already Completed milestones (still claimable by freelancer)", async function () {
    const { escrow, usdc: token, client, freelancer } = await withProject();
    await escrow.connect(freelancer).completeMilestone(0, 0); // 100 USDC milestone completed

    const before = await token.balanceOf(client.address);
    await escrow.connect(client).cancelProject(0);
    const after = await token.balanceOf(client.address);

    // Only 200 + 300 = 500 USDC refunded (not the Completed 100)
    expect(after - before).to.equal(usdc(500));
  });

  it("sets Pending milestones to Refunded status", async function () {
    const { escrow, client } = await withProject();
    await escrow.connect(client).cancelProject(0);

    const m0 = await escrow.getMilestone(0, 0);
    const m1 = await escrow.getMilestone(0, 1);
    expect(m0.status).to.equal(4n); // Refunded
    expect(m1.status).to.equal(4n); // Refunded
  });

  it("reverts if caller is not the client", async function () {
    const { escrow, freelancer } = await withProject();
    await expect(
      escrow.connect(freelancer).cancelProject(0)
    ).to.be.revertedWithCustomError(escrow, "Unauthorized");
  });

  it("reverts if project is already Cancelled", async function () {
    const { escrow, client } = await withProject();
    await escrow.connect(client).cancelProject(0);
    await expect(
      escrow.connect(client).cancelProject(0)
    ).to.be.revertedWithCustomError(escrow, "InvalidProjectStatus");
  });

  it("reverts with NothingToRefund if all milestones are already Completed", async function () {
    const { escrow, client, freelancer } = await withProject();
    // Complete all milestones so nothing is Pending
    await escrow.connect(freelancer).completeMilestone(0, 0);
    await escrow.connect(freelancer).completeMilestone(0, 1);
    await escrow.connect(freelancer).completeMilestone(0, 2);

    await expect(
      escrow.connect(client).cancelProject(0)
    ).to.be.revertedWithCustomError(escrow, "NothingToRefund");
  });
});
