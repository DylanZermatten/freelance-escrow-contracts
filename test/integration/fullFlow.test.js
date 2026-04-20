const { expect } = require("chai");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFixture, usdc } = require("../helpers");

const FOURTEEN_DAYS = 14 * 24 * 60 * 60;

describe("FreelanceEscrow — full integration flows", function () {
  // ── Flow 1: Happy path ────────────────────────────────────────────

  it("Flow 1 — happy path: 3 milestones, all approved", async function () {
    const { escrow, usdc: token, client, freelancer, owner } = await loadFixture(deployFixture);

    // Create
    await escrow.connect(client).createProject(
      freelancer.address,
      ["Design", "Build", "Deploy"],
      [usdc(100), usdc(200), usdc(300)]
    );

    const freelancerBefore = await token.balanceOf(freelancer.address);

    // Complete and approve each milestone in sequence
    for (let i = 0; i < 3; i++) {
      await escrow.connect(freelancer).completeMilestone(0, i);
      await escrow.connect(client).approveMilestone(0, i);
    }

    const freelancerAfter = await token.balanceOf(freelancer.address);
    // 600 USDC - 2% = 588 USDC
    expect(freelancerAfter - freelancerBefore).to.equal(usdc(588));

    // Project Completed
    const [, , , , , status] = await escrow.getProject(0);
    expect(status).to.equal(2n); // Completed

    // Fees accumulated = 2% of 600 = 12 USDC
    expect(await escrow.accumulatedFees()).to.equal(usdc(12));

    // Owner withdraws fees
    const ownerBefore = await token.balanceOf(owner.address);
    await escrow.connect(owner).withdrawFees(owner.address);
    expect(await token.balanceOf(owner.address) - ownerBefore).to.equal(usdc(12));
    expect(await escrow.accumulatedFees()).to.equal(0n);
  });

  // ── Flow 2: Auto-release ──────────────────────────────────────────

  it("Flow 2 — auto-release: client disappears, freelancer claims after 14 days", async function () {
    const { escrow, usdc: token, client, freelancer } = await loadFixture(deployFixture);

    await escrow.connect(client).createProject(
      freelancer.address,
      ["Work"],
      [usdc(500)]
    );
    await escrow.connect(freelancer).completeMilestone(0, 0);

    // Client does nothing for 14 days
    await time.increase(FOURTEEN_DAYS + 1);

    const before = await token.balanceOf(freelancer.address);
    await escrow.connect(freelancer).claimExpiredMilestone(0, 0);
    const after = await token.balanceOf(freelancer.address);

    // 500 - 2% = 490
    expect(after - before).to.equal(usdc(490));
  });

  // ── Flow 3: Cancel partial ────────────────────────────────────────

  it("Flow 3 — cancel: client cancels after first milestone completed", async function () {
    const { escrow, usdc: token, client, freelancer } = await loadFixture(deployFixture);

    await escrow.connect(client).createProject(
      freelancer.address,
      ["Phase 1", "Phase 2", "Phase 3"],
      [usdc(100), usdc(200), usdc(300)]
    );

    // Freelancer completes only first milestone
    await escrow.connect(freelancer).completeMilestone(0, 0);

    // Client cancels
    const clientBefore = await token.balanceOf(client.address);
    await escrow.connect(client).cancelProject(0);
    const clientAfter = await token.balanceOf(client.address);

    // Refund = 200 + 300 = 500 (phase 1 was Completed, stays in escrow for freelancer)
    expect(clientAfter - clientBefore).to.equal(usdc(500));

    // Freelancer can still claim phase 1 after deadline
    await time.increase(FOURTEEN_DAYS + 1);
    const freelancerBefore = await token.balanceOf(freelancer.address);
    await escrow.connect(freelancer).claimExpiredMilestone(0, 0);
    const freelancerAfter = await token.balanceOf(freelancer.address);
    // 100 - 2% = 98
    expect(freelancerAfter - freelancerBefore).to.equal(usdc(98));
  });

  // ── Flow 4: Dispute resolved with split ───────────────────────────

  it("Flow 4 — dispute: 60/40 split resolution", async function () {
    const { escrow, usdc: token, client, freelancer, owner } = await loadFixture(deployFixture);

    await escrow.connect(client).createProject(
      freelancer.address,
      ["Milestone A"],
      [usdc(200)]
    );
    await escrow.connect(freelancer).completeMilestone(0, 0);

    // Client raises dispute
    await escrow.connect(client).raiseDispute(0, 0, "Work partially done");

    // Auto-release should NOT work during dispute
    await time.increase(FOURTEEN_DAYS + 1);
    await expect(
      escrow.connect(freelancer).claimExpiredMilestone(0, 0)
    ).to.be.revertedWithCustomError(escrow, "InvalidProjectStatus");

    // Owner resolves: 120 to freelancer, 80 to client
    const freelancerBefore = await token.balanceOf(freelancer.address);
    const clientBefore = await token.balanceOf(client.address);

    await escrow.connect(owner).resolveDispute(0, 0, usdc(120), usdc(80));

    const freelancerAfter = await token.balanceOf(freelancer.address);
    const clientAfter = await token.balanceOf(client.address);

    // Freelancer: 120 - 2% = 117.6
    expect(freelancerAfter - freelancerBefore).to.equal(usdc(117.6));
    // Client: exactly 80
    expect(clientAfter - clientBefore).to.equal(usdc(80));

    // Project back to Active (not yet Completed — milestone resolved but could have more)
    const [, , , , , status] = await escrow.getProject(0);
    expect(status).to.equal(0n); // Active → Completed since only 1 milestone
  });

  // ── Flow 5: Emergency pause ───────────────────────────────────────

  it("Flow 5 — pause: owner pauses and unpauses, blocking all state changes", async function () {
    const { escrow, client, freelancer, owner } = await loadFixture(deployFixture);

    await escrow.connect(client).createProject(
      freelancer.address,
      ["Work"],
      [usdc(100)]
    );

    await escrow.connect(owner).pause();

    await expect(
      escrow.connect(freelancer).completeMilestone(0, 0)
    ).to.be.revertedWithCustomError(escrow, "EnforcedPause");

    await escrow.connect(owner).unpause();

    // Should work again after unpause
    await expect(escrow.connect(freelancer).completeMilestone(0, 0))
      .to.emit(escrow, "MilestoneCompleted");
  });
});
