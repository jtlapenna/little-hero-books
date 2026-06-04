# Little Hero Labs Agent Context

This repository is a personal Little Hero Labs project.

## Account Boundary

- GitHub account for this repo: `amoeboar`
- Personal email: `john.s.capogna@gmail.com`
- Do not use the business GitHub account `johncapogna` or business email `john@thepeakbeyond.com` for this repo.
- This rule is project-scoped to `little-hero-books` / Little Hero Labs only. Do not apply it to unrelated repos.

Before committing or pushing in this repo, check:

```sh
git config user.email
git remote -v
gh auth status
```

Expected local repo config:

```text
user.email=john.s.capogna@gmail.com
codex.githubAccount=amoeboar
codex.accountBoundary=personal-only
origin=https://amoeboar@github.com/jtlapenna/little-hero-books.git
```

If GitHub push fails because the active CLI account is `johncapogna`, do not switch global identity for all projects without confirming the impact. Prefer a repo-scoped credential fix or ask the user to authenticate/push as `amoeboar`.

## Memory Boundary

Durable memory for this repo should be written to the Little Hero Labs project lane in the Obsidian Codex Brain vault, or to repo-local docs when the note is implementation-specific.

Do not write Little Hero Labs identity rules into other project lanes.
