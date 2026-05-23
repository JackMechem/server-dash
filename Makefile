.PHONY: api frontend dev

api:
	cd packages/api && cargo run

frontend:
	cd packages/frontend && pnpm dev

dev:
	@trap 'kill 0' INT; \
	(cd packages/api && cargo run) & \
	(cd packages/frontend && pnpm dev) & \
	wait
