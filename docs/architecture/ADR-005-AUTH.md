# ADR-005: Authentication & Authorization

## Status
Accepted

## Context
Registration creates a User + Organization + Workspace + owner Membership
transactionally, with email verification, and must support future
SSO/SAML/OIDC/magic-link without a rewrite. Authorization (RBAC) must be
enforceable server-side on every request and eventually support custom
roles without breaking the fixed-role MVP.

## Decision

### Authentication
- **Credential-based auth for MVP**: email + password, hashed with
  Argon2id. Users always set their own password — the system never
  generates and emails a plaintext/temporary password (brief §5's
  explicit constraint).
- **Email verification via signed, time-limited token**, required before
  first login session is fully privileged (unverified accounts can be
  created but not used beyond the "check your email" state).
- **Session-based auth** (server-issued session, secure/httpOnly/SameSite
  cookie), not client-held JWT-as-source-of-truth — sessions can be
  revoked server-side (password change, admin action) without waiting for
  token expiry.
- **`AuthProvider` abstraction** from day one: the credential flow above
  is one implementation; Magic Link, Google Workspace, Microsoft, and
  SAML/OIDC SSO (Phase 3) are added as additional implementations behind
  the same session-issuance contract, not a parallel auth system.
- **MFA-ready**: user/credential schema includes what MFA needs (a
  `mfa_enrollments` capability is additive to `User`), not required for
  MVP login.

### Authorization (RBAC)
- Fixed roles for MVP (Platform Super Admin, Organization Owner,
  Organization Admin, Communications Manager, Analyst, Viewer, Report
  Recipient), each mapped to a permission set evaluated server-side on
  every request — never trusted from client state.
- Roles are stored as a **string key resolved against a permission
  table**, not a hard-coded enum switch scattered through the codebase,
  so custom roles (post-MVP) are a data addition, not an authorization
  rewrite (see `DATA_MODEL.md` OrganizationMembership).
- Permission checks live in `packages/core/authz`, called from API routes
  and worker jobs alike — the same check function, not duplicated logic
  per surface.

### Registration transaction
User creation → Organization creation → Workspace creation → owner
Membership → verification email send happens as one transactional unit
where the DB writes are concerned (email send is a best-effort side
effect triggered after commit, with retry, not inside the DB transaction)
— a failure partway through must not leave an orphaned User with no
Organization or vice versa.

## Alternatives considered
- **JWT-only stateless auth.** Rejected as the primary session mechanism
  — immediate server-side revocation (critical for "admin disables a
  compromised account now") is harder to guarantee with long-lived
  client-held tokens. A short-lived JWT may still be used for
  service-to-service or API-key-derived contexts later, but the user
  session itself is server-checked.
- **Hard-coded role enum with switch statements for permissions.**
  Rejected — directly blocks the brief's explicit future custom-roles
  requirement (§3).

## Consequences
- Every new API route must call the shared authz check — this is a code
  review checklist item, not assumed from route placement.
- Auth abstraction adds one layer of indirection for MVP's single
  credential-based flow, which is deliberate cost paid now to avoid a
  rewrite when SSO/SAML/OIDC land in Phase 3.
