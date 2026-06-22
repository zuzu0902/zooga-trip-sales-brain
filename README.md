# Community Intelligence / Tamar Brain
## Railway Brain Starter

This folder is a starter package for the dedicated Railway-based Tamar brain service.

## Goal
Provide a clean starting point for moving Tamar runtime logic out of Lovable and into a dedicated backend service.

## Scope of this starter
- TypeScript backend skeleton
- Fastify-based HTTP service
- health endpoint
- version endpoint
- first `POST /runtime/tamar-turn` contract
- Meta webhook verify/inbound/outbound scaffold
- deterministic trip-sales turn engine
- typed schemas
- starter test guidance

## Target role of this service
This service should become the source of runtime intelligence for:
- browse logic
- offer resolution
- pricing rules
- handoff rules
- memory write decisions
- reply assembly
- runtime tracing

## Not in scope yet
- full CRM integration
- full Supabase integration
- actual LLM call implementation
- production handoff dispatch
- full delivery callback flow

## Expected next move
Create a new GitHub repo / Railway service from this skeleton, then progressively replace the placeholder turn engine with real logic.
