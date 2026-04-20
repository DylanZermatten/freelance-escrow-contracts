const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFixture, usdc } = require("../helpers");

describe("FreelanceEscrow — raiseDispute & resolveDispute", function () {
  async function withCompletedMilestone() {
    const fixture = await loadFixture(deployFixture);
    await fixture.escrow.connect(fixture.client).createProject(
      fixture.freelancer.address,
      ["Design"],
      [usdc(100)]
    );
    await fixture.escrow.connect(fixture.freelancer).completeMilestone(0, 0);
    return fixture;
  }

  // ── raiseDispute ─────────────────────────────────────────────────

  it("client can raise a dispute on a Completed milestone", async function () {
    const { escrow, client } = await withCompletedMilestone();
    await expect(escrow.connect(client).raiseDispute(0, 0, "Work is incomplete"))
      .to.emit(escrow, "DisputeRaised")
      .withArgs(0n, 0n, client.address, "Work is incomplete");

    const [, , , , , status] = await escrow.getProject(0);
    expect(status).to.equal(3n); // Disputed
  });

  it("freelancer can raise a dispute", async function () {
    const { escrow, freelancer } = await withCompletedMilestone();
    await expect(escrow.connect(freelancer).raiseDispute(0, 0, "Client is unresponsive"))
      .to.emit(escrow, "DisputeRaised");
  });

  it("sets milestone status to Disputed", async function () {
    const { escrow, client } = await withCompletedMilestone();
    await escrow.connect(client).raiseDispute(0, 0, "Bad work");
    const m = await escrow.getMilestone(0, 0);
    expect(m.status).to.equal(5n); // Disputed
  });

  it("reverts if caller is neither client nor freelancer", async function () {
    const { escrow, other } = await withCompletedMilestone();
    await expect(
      escrow.connect(other).raiseDispute(0, 0, "reason")
    ).to.be.revertedWithCustomError(escrow, "Unauthorized");
  });

  it("reverts if milestone is not Completed (still Pending)", async function () {
    const { escrow, client, freelancer } = await loadFixture(deployFixture);
    await escrow.connect(client).createProject(freelancer.address, ["Work"], [usdc(100)]);
    await expect(
      escrow.connect(client).raiseDispute(0, 0, "reason")
    ).to.be.revertedWithCustomError(escrow, "InvalidMilestoneStatus");
  });

  it("reverts if reason exceeds MAX_DESCRIPTION_LENGTH", async function () {
    const { escrow, client } = await withCompletedMilestone();
    const longReason = "x".repeat(201);
    await expect(
      escrow.connect(client).raiseDispute(0, 0, longReason)
    ).to.be.revertedWithCustomError(escrow, "DescriptionTooLong");
  });

  // ── resolveDispute ────────────────────────────────────────────────

  async function withDispute() {
    const fixture = await withCompletedMilestone();
    await fixture.escrow.connect(fixture.client).raiseDispute(0, 0, "Bad work");
    return fixture;
  }

  it("owner resolves dispute 100% to freelancer", async function () {
    const { escrow, usdc: token, owner, freelancer } = await withDispute();
    const before = await token.balanceOf(freelancer.address);

    await escrow.connect(owner).resolveDispute(0, 0, usdc(100), usdc(0));

    const after = await token.balanceOf(freelancer.address);
    // 100 - 2% fee = 98
    expect(after - before).to.equal(usdc(98));
  });

  it("owner resolves dispute 100% to client", async function () {
    const { escrow, usdc: token, owner, client } = await withDispute();
    const before = await token.balanceOf(client.address);

    await escrow.connect(owner).resolveDispute(0, 0, usdc(0), usdc(100));

    const after = await token.balanceOf(client.address);
    expect(after - before).to.equal(usdc(100));
  });

  it("owner resolves dispute 60/40 split correctly", async function () {
    const { escrow, usdc: token, owner, client, freelancer } = await withDispute();
    const clientBefore = await token.balanceOf(client.address);
    const freelancerBefore = await token.balanceOf(freelancer.address);

    await escrow.connect(owner).resolveDispute(0, 0, usdc(60), usdc(40));

    const clientAfter = await token.balanceOf(client.address);
    const freelancerAfter = await token.balanceOf(freelancer.address);

    // Freelancer gets 60 - 2% = 58.8 USDC
    expect(freelancerAfter - freelancerBefore).to.equal(usdc(58.8));
    // Client gets exactly 40 USDC
    expect(clientAfter - clientBefore).to.equal(usdc(40));
  });

  it("emits DisputeResolved event", async function () {
    const { escrow, owner } = await withDispute();
    await expect(escrow.connect(owner).resolveDispute(0, 0, usdc(60), usdc(40)))
      .to.emit(escrow, "DisputeResolved")
      .withArgs(0n, 0n, usdc(60), usdc(40));
  });

  it("restores project status to Active after resolution", async function () {
    const { escrow, owner } = await withDispute();
    await escrow.connect(owner).resolveDispute(0, 0, usdc(100), usdc(0));
    const [, , , , , status] = await escrow.getProject(0);
    expect(status).to.equal(0n); // Active
  });

  it("reverts if split does not sum to milestone amount", async function () {
    const { escrow, owner } = await withDispute();
    await expect(
      escrow.connect(owner).resolveDispute(0, 0, usdc(60), usdc(30)) // 60+30 != 100
    ).to.be.revertedWithCustomError(escrow, "DisputeSplitMismatch");
  });

  it("reverts if called by non-owner", async function () {
    const { escrow, client } = await withDispute();
    await expect(
      escrow.connect(client).resolveDispute(0, 0, usdc(100), usdc(0))
    ).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
  });

  it("reverts if milestone is not in Disputed status", async function () {
    const { escrow, owner } = await withCompletedMilestone();
    await expect(
      escrow.connect(owner).resolveDispute(0, 0, usdc(100), usdc(0))
    ).to.be.revertedWithCustomError(escrow, "InvalidMilestoneStatus");
  });
});
