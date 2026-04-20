# Handoff for Testing and Documentation

## Current contract status

The local Hardhat test suite passes fully.

- `64 passing`

## Main end-to-end scenarios already covered

1. Happy path: create -> complete -> approve
2. Auto-release after 14 days
3. Cancel with refund of pending milestones
4. Dispute then owner split resolution
5. Emergency pause / unpause

## Suggested manual test scenarios

### Scenario 1

Client creates a project with 2 or 3 milestones and approves them one by one.

### Scenario 2

Freelancer completes milestone, client stays inactive, freelancer claims after delay.

### Scenario 3

Client cancels after one milestone is completed and checks refund only applies to pending work.

### Scenario 4

Client raises dispute and owner resolves with a split such as `60 / 40`.

### Scenario 5

Owner pauses contract and all state-changing calls revert until unpaused.

## Questions the slides can answer

### Why use ERC-20 instead of ETH?

Stablecoin-style payments are easier to reason about for milestone work and avoid native ETH volatility.

### What happens if the client disappears?

The freelancer can claim a completed milestone after the auto-release delay of 14 days.

### What happens in a dispute?

Client or freelancer raises a dispute, then the owner resolves it by splitting the milestone amount.

### How are fees handled?

The contract keeps a platform fee in basis points, locked at project creation time.

## Useful commands

Run tests:

```bash
npx hardhat test
```

Run coverage:

```bash
npm run coverage
```

Local deployment:

```bash
npx hardhat run scripts/deploy.js
```
