.PHONY: humanizer-check humanizer-update creative-references-check creative-references-update dsh-install dsh-check dsh-smoke audit-workflows

humanizer-check:
	@scripts/check-humanizer.sh

humanizer-update:
	@scripts/update-humanizer.sh

creative-references-check:
	@scripts/check-creative-references.sh

creative-references-update:
	@scripts/update-creative-references.sh

dsh-install:
	pnpm install --frozen-lockfile

dsh-check:
	pnpm run check

dsh-smoke:
	pnpm run smoke:profile

audit-workflows:
	pnpm run audit:workflows
