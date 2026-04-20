# Sepolia Smoke Test

This document records the manual smoke test executed against the deployed Sepolia contracts.

## Contracts

- `MockUSDC`: `0xe0Be1a63F2A12F23b4304262494E4CCeFe6F95E9`
- `FreelanceEscrow`: `0xEda5541b44F17B727285f56E2C82bB8e08C2A82c`

## Actors

- Client: `0x22Eea93309C55deaD39E7b78833D06D00F049894`
- Freelancer: `0x7956CE8B008e6E1933CA955c7D739EaC2Ba49bCa`

## Scenario

1. `faucet()` on `MockUSDC`
2. `approve()` from the client to the escrow contract
3. `createProject()` with 2 milestones:
   - milestone `0`: `100 USDC`
   - milestone `1`: `200 USDC`
4. `completeMilestone(0, 0)` by the freelancer
5. `approveMilestone(0, 0)` by the client

## Transaction hashes

- `faucet`: `0xcdd1937e980ec4b022579f8905b8ac680caf2ee6f56e80293bdcac1199780993`
- `approve`: `0x3b39e6475bccba4e33223e1871a863e2c733a1df59ffc0b34fd2aeed26eb420e`
- `createProject`: `0xd73b04d64a1294f7cf5c5da920d07d693a8574d4e06e49128b4789905d8a8fd3`
- `completeMilestone`: `0x568fa4c9f63f220a7e75026c45fbe373e7466dd8be0f4fe1e51d012879ba0000`
- `approveMilestone`: `0x2ca4639bbb1c8dda00be1bcdbcff128cd54499470832b8b31c2bdb3953e6e406`

## Result observed

- milestone `0` status moved from `Pending` to `Completed` to `Approved`
- freelancer received `98 USDC` net for milestone `0`
- platform fee accumulated on milestone `0`: `2 USDC`
- escrow retained `202 USDC`, matching milestone `1` (`200 USDC`) plus accumulated fee (`2 USDC`)
- project `0` remained `Active`, which is expected because milestone `1` has not been processed yet

## Why this matters

This smoke test validates that the main escrow flow works not only in local Hardhat tests, but also on Sepolia with real signed transactions. It provides a concrete integration baseline for the frontend, integration, and manual testing workstreams.
