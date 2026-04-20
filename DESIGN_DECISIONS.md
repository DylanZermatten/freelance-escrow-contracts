# Design Decisions

This document explains the main architectural and product decisions behind the `FreelanceEscrow` smart contract.

Its goal is twofold:

- document why the current design was chosen for the capstone MVP
- provide clear technical justification for integration work and jury questions

## 1. Payments use ERC-20, not native ETH

### Decision

The escrow uses a single ERC-20 payment token set at deployment time.

On Sepolia, this is the deployed `MockUSDC` token used for demos and integration.

### Why

- milestone payments are easier to reason about in stable-value units than in volatile ETH
- the project specification evolved toward stablecoin-based flows
- ERC-20 payments are more representative of a realistic escrow product than a custom course token
- frontend and backend integration are clearer when payment amounts stay stable

### Trade-off

- users must call `approve()` before `createProject()`
- ERC-20 handling is slightly more complex than using native ETH

This trade-off was accepted because the clarity of stablecoin-denominated payments was more important than reducing one transaction.

## 2. A single immutable payment token

### Decision

The contract stores `paymentToken` as an immutable address set once in the constructor.

### Why

- avoids mixing projects across multiple tokens inside the same contract
- simplifies accounting for fees and escrow balances
- removes admin risk around changing payment assets after deployment
- keeps the integration surface smaller for the frontend team

### Trade-off

- supporting multiple payment tokens would require either multiple deployments or a more complex architecture

For this MVP, simplicity and predictability were preferred.

## 3. Milestone-based escrow instead of one-shot project settlement

### Decision

Each project is split into multiple milestones, each with its own description, amount, and status.

### Why

- milestone-based work matches real freelance collaboration better than full upfront or full final payment
- each milestone can progress independently through completion, approval, auto-release, dispute, or refund
- this gives the frontend and testing flows a richer but still understandable state machine

### Trade-off

- the contract has more state and more transitions to validate
- loops over milestones exist in several paths

This complexity is intentionally bounded by `MAX_MILESTONES = 20`.

## 4. Escrow is fully funded upfront

### Decision

At `createProject()`, the client transfers the full sum of milestone amounts into the contract.

### Why

- ensures funds are already locked before the freelancer starts work
- removes counterparty risk where a client approves work but lacks funds later
- makes milestone release logic deterministic

### Trade-off

- the client must lock the whole project amount at creation time

This was accepted because it is the core trust guarantee of the escrow model.

## 5. Platform fee is locked at project creation

### Decision

Each project stores its own `platformFeeBps` at creation, copied from the current default fee.

### Why

- prevents retroactive fee changes from affecting existing deals
- makes project economics stable and predictable for both client and freelancer
- avoids governance surprises after work has already started

### Trade-off

- changing the default fee only affects future projects

This is intentional and fairer than applying live admin fee changes to in-flight projects.

## 6. Auto-release after 14 days

### Decision

Once a freelancer marks a milestone as completed, the client has a review window. If the client stays inactive for `14 days`, the freelancer can call `claimExpiredMilestone()`.

### Why

- protects the freelancer from indefinite client silence
- prevents funds from being locked forever after work has been completed
- gives a clear and easy-to-explain rule for manual demos and integration

### Trade-off

- the contract relies on `block.timestamp`
- an honest review window must be long enough to reduce accidental claims

`14 days` was chosen as a human-scale delay where minor timestamp drift is irrelevant.

## 7. Cancellation only refunds untouched milestones

### Decision

If the client cancels a project, only `Pending` milestones are refunded. Milestones already marked `Completed` remain claimable by the freelancer.

### Why

- protects work that has already been delivered
- avoids a client canceling after a milestone was completed just to reclaim funds
- keeps cancellation behavior aligned with the milestone lifecycle

### Trade-off

- cancellation is not a full rollback of project history

This is intentional: completed work and untouched work should not be treated the same way.

## 8. Centralized dispute resolution for the MVP

### Decision

Disputes are raised by the client or freelancer, but resolved by the contract owner through `resolveDispute()`.

### Why

- the capstone MVP needed a clear and testable arbitration mechanism
- owner-based arbitration is straightforward to explain, implement, and integrate
- it supports partial split outcomes instead of only binary win/lose outcomes

### Trade-off

- dispute resolution is centralized
- if the owner is unavailable, a disputed milestone can remain blocked

This limitation is accepted for the MVP. A production-ready version could replace this with multisig, DAO governance, or third-party arbitration.

## 9. Dispute resolution supports split outcomes

### Decision

`resolveDispute()` allows the owner to split a disputed milestone between freelancer and client as long as both parts sum exactly to the milestone amount.

### Why

- real disputes are often not binary
- partial compensation is more realistic than forcing a full refund or full payout
- this gave the team a stronger demo and richer test coverage

### Trade-off

- owner decisions require more judgment than a simple boolean resolution

This trade-off was worth it because split resolution better matches real freelance disputes.

## 10. Emergency pause is included

### Decision

The owner can `pause()` and `unpause()` the contract.

### Why

- provides an operational safety lever during demos and integration
- allows the team to stop state-changing actions if a serious issue is discovered
- is a standard defensive control for a contract with live escrowed funds

### Trade-off

- introduces an admin power over availability

For the MVP, this was considered safer than having no emergency stop at all.

## 11. No upgradeability / proxy pattern

### Decision

The contract is deployed as a regular non-upgradeable contract, not behind a proxy.

### Why

- easier to audit, explain, and test in an academic setting
- smaller attack surface
- fewer moving parts for deployment and verification
- better fit for a capstone MVP with limited time and no external audit budget

### Trade-off

- fixes require redeployment instead of implementation upgrades

This trade-off was accepted because correctness, transparency, and simplicity mattered more than post-deployment flexibility.

## 12. Sepolia instead of mainnet

### Decision

The reference deployment and smoke tests run on Sepolia.

### Why

- real on-chain behavior can be demonstrated without financial risk
- deployment, testing, and debugging are much cheaper and safer
- the team can share addresses and run manual integration flows freely

### Trade-off

- Sepolia is not a production environment
- the deployed token is a mock token, not real USDC

For a capstone deliverable, Sepolia is the right environment to prove live smart-contract behavior while keeping costs and risk near zero.

## 13. MockUSDC exists only for testing and demos

### Decision

The repository includes `MockUSDC`, an ERC-20 token with a public faucet for local use and Sepolia demos.

### Why

- team members need a frictionless way to fund test accounts
- manual demos should not depend on external token providers
- local tests and Sepolia integration can use the same 6-decimal token model

### Trade-off

- `MockUSDC` is intentionally not production-safe because anyone can mint through the faucet

This is acceptable because it is a testnet/demo asset, not the production payment token.

## 14. Bounded loops are accepted

### Decision

The contract iterates over milestones in a few places such as project creation, cancellation, and project-resolution checks.

### Why

- these loops make the logic easier to read and reason about
- milestone counts are capped by `MAX_MILESTONES = 20`
- the gas cost remains acceptable within the expected MVP scope

### Trade-off

- the contract is not optimized for arbitrarily large project structures

That is a deliberate product constraint, not an accident.

## Summary

The design favors:

- clarity over maximal flexibility
- stable-value ERC-20 payments over volatile native ETH
- fairness protections for both client and freelancer
- bounded complexity that can be tested, audited, and demonstrated live

For this capstone, the chosen architecture is intentionally conservative: simple enough to be reliable, but rich enough to model realistic escrow behavior.
