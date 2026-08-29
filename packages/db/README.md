# @financemanager/db

The Prisma schema, its migrations, the generated client and the demo seed.

This is the **only** package that may import `@prisma/client`. Everything else
goes through `@financemanager/db`, so the web app's Server Actions and the
NestJS API share one data model instead of two that drift apart.

`packages/core` must never import this: the domain has to run in a browser and
in Hermes, where Prisma does not exist.

## Migrations

`pnpm db:migrate:deploy` applies them. The Docker entrypoint runs that on every
container start, so **deploying a migration applies it to production** — take a
verified backup first (`deploy/backup.sh`).
