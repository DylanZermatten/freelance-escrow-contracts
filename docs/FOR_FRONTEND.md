# Handoff for Frontend

## Goal

This contract layer is ready enough for frontend work to start.

The frontend can already implement:

- wallet connection
- project creation flow
- client dashboard
- freelancer dashboard
- dispute and cancel actions

## Contracts

On local development, the deployment script creates:

- `MockUSDC`
- `FreelanceEscrow`

Sepolia addresses should later be stored in `deployments/sepolia.json`.

## UX flow

### Client creates a project

1. Connect wallet
2. Get or verify mUSDC balance
3. Approve escrow contract on `MockUSDC`
4. Call `createProject(freelancer, descriptions[], amounts[])`
5. Read emitted `ProjectCreated` event or query project lists

### Freelancer completes work

1. Open assigned project
2. Call `completeMilestone(projectId, milestoneIdx)`

### Client approves work

1. Open completed milestone
2. Call `approveMilestone(projectId, milestoneIdx)`

### Auto-release

If the client does not approve within 14 days after completion:

1. Freelancer opens milestone
2. Call `claimExpiredMilestone(projectId, milestoneIdx)`

### Cancel flow

Client can call `cancelProject(projectId)` and get refunded for still pending milestones.

### Dispute flow

Client or freelancer can call `raiseDispute(projectId, milestoneIdx, reason)`.

## Read functions

Useful for UI rendering:

- `getProject(projectId)`
- `getMilestone(projectId, milestoneIdx)`
- `getAllMilestones(projectId)`
- `getProjectsByClient(address)`
- `getProjectsByFreelancer(address)`

## Status mapping

### ProjectStatus

- `0 = Active`
- `1 = Cancelled`
- `2 = Completed`
- `3 = Disputed`

### MilestoneStatus

- `0 = Pending`
- `1 = Completed`
- `2 = Approved`
- `3 = Claimed`
- `4 = Refunded`
- `5 = Disputed`

## Token format

`MockUSDC` uses `6` decimals.

Examples with ethers v6:

```js
const amount = ethers.parseUnits("100", 6);
const human = Number(rawAmount) / 1e6;
```

## Frontend gotchas

- `approve` and `createProject` are two separate transactions
- amounts must be sent in 6-decimal token units
- transaction state handling matters for UX
- dispute and cancel should be shown only when the current status allows them
