.PHONY: humanizer-check humanizer-update dsh-install dsh-check dsh-smoke audit-workflows

humanizer-check:
	@scripts/check-humanizer.sh

humanizer-update:
	@scripts/update-humanizer.sh

dsh-install:
	pnpm install --frozen-lockfile

dsh-check:
	pnpm run check

dsh-smoke:
	pnpm run smoke:profile

audit-workflows:
	pnpm run audit:workflows
