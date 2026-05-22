PKG    := server-dash-api
USER   := server-dash-api
BIN    := ./result/bin/$(PKG)
ARGS   ?=
 
.PHONY: build run logs clean
 
build:
	nix build
 
run: build
	sudo -u $(USER) $(BIN) $(ARGS)
 
logs:
	journalctl -u $(PKG) -f
 
clean:
	rm -f result


deploy:
	cargo build --release
	sudo systemctl stop server-dash-api
	sudo cp target/release/server-dash-api /var/lib/server-dash-api/server-dash-api
	sudo chown server-dash-api:server-dash-api /var/lib/server-dash-api/server-dash-api
	sudo chmod 755 /var/lib/server-dash-api/server-dash-api
	sudo systemctl restart server-dash-api
