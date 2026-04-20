# Handoff for Integration

## Goal

This document is for the person wiring the frontend to the contracts.

## Main contracts

- `FreelanceEscrow`
- `MockUSDC`

## Core write functions

### Client actions

- `createProject(address freelancer, string[] descriptions, uint256[] amounts)`
- `approveMilestone(uint256 projectId, uint256 milestoneIdx)`
- `cancelProject(uint256 projectId)`
- `raiseDispute(uint256 projectId, uint256 milestoneIdx, string reason)`

### Freelancer actions

- `completeMilestone(uint256 projectId, uint256 milestoneIdx)`
- `claimExpiredMilestone(uint256 projectId, uint256 milestoneIdx)`
- `raiseDispute(uint256 projectId, uint256 milestoneIdx, string reason)`

### Owner actions

- `resolveDispute(uint256 projectId, uint256 milestoneIdx, uint256 amountToFreelancer, uint256 amountToClient)`
- `withdrawFees(address to)`
- `pause()`
- `unpause()`

## Read functions

- `getProject(uint256 projectId)`
- `getMilestone(uint256 projectId, uint256 milestoneIdx)`
- `getAllMilestones(uint256 projectId)`
- `getProjectsByClient(address client)`
- `getProjectsByFreelancer(address freelancer)`

## Events to listen to

### ProjectCreated

- indexed: `projectId`, `client`, `freelancer`
- extra fields: `totalAmount`, `milestoneCount`, `platformFeeBps`

### MilestoneCompleted

- indexed: `projectId`, `milestoneIdx`

### MilestoneApproved

- indexed: `projectId`, `milestoneIdx`
- extra fields: `amountToFreelancer`, `platformFee`

### MilestoneClaimed

- indexed: `projectId`, `milestoneIdx`
- extra fields: `amountToFreelancer`, `platformFee`

### ProjectCancelled

- indexed: `projectId`
- extra field: `refundedAmount`

### DisputeRaised

- indexed: `projectId`, `milestoneIdx`, `raiser`
- extra field: `reason`

### DisputeResolved

- indexed: `projectId`, `milestoneIdx`
- extra fields: `amountToFreelancer`, `amountToClient`

## ABI location

After compilation:

- `artifacts/contracts/FreelanceEscrow.sol/FreelanceEscrow.json`
- `artifacts/contracts/mocks/MockUSDC.sol/MockUSDC.json`

## Important integration notes

- token is ERC-20, not native ETH
- token decimals are `6`
- project creation requires ERC-20 `approve` first
- on local setup, the test fixture pre-mints `10,000` mUSDC to the client
- dispute blocks normal active flow until owner resolution
- dispute resolution closes the milestone as `Approved`; the project may become `Completed` if no unresolved milestones remain

## Suggested integration order

1. Read-only project pages
2. `approve` + `createProject`
3. `completeMilestone`
4. `approveMilestone`
5. dispute and cancel flows
6. auto-release handling
