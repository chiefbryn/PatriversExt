# CEO user creation and System Admin protection

## Changes
- Give the CEO access to the Users & security page.
- Let CEOs create Cashier, Pharmacist, and CEO accounts only. They cannot create System Admin accounts.
- Keep full user-management tools available to the System Admin.
- Mark the reserved `admin` account as System Admin and remove its management menu so it cannot be suspended, reset, deleted, or otherwise changed from user administration.
- Enforce the same protections in the secure user-management function so interface changes cannot bypass them.
- Keep activity and login records visible according to existing permissions.

## Verification
- Run TypeScript checks, tests, and a production build.
- Verify the CEO sees user creation without an Admin role choice.
- Verify the System Admin row has no management actions.
