
install-dependencies:
	bun install
	cargo install tauri-cli

build:
	bun run tauri build

run-dev:
	bun run tauri dev

test:
	cd src-tauri
	cargo test