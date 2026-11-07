# Contributing to Tabulo

Thank you for helping. Tabulo is licensed GPL-3.0-or-later, and contributions are accepted under
the same license.

## Before you open a pull request

1. Read [docs/spec.md](docs/spec.md). It is the contract for behavior and scope.
2. Set up the project as described in the [README](README.md).
3. Run every check. CI runs the same commands:

   ```sh
   npm run lint
   npm run typecheck
   npm test
   npm run build
   ```

## Conventions

- Write commit messages in the [Conventional Commits](https://www.conventionalcommits.org)
  format, for example `feat(dashboard): show draft pull requests`.
- Keep each commit small and passing on its own.
- Test behavior through the HTTP interface, against the fake Forgejo in `test/fake-forgejo.ts`.
  Write expected values from fixtures, not from production code.
- Keep organization names and real hostnames out of code, docs, and fixtures. Use
  `forgejo.example` style hosts.
- Run `npm run format` to apply Biome formatting.
