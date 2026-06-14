{
    description = "server-dash monorepo - NixOS System Dashboard + Rust API";
    inputs = {
        nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
        rust-overlay = {
            url = "github:oxalica/rust-overlay";
            inputs.nixpkgs.follows = "nixpkgs";
        };
        flake-utils.url = "github:numtide/flake-utils";
    };
    outputs =
        {
            self,
            nixpkgs,
            rust-overlay,
            flake-utils,
            ...
        }:
        flake-utils.lib.eachDefaultSystem (
            system:
            let
                overlays = [ (import rust-overlay) ];
                pkgs = import nixpkgs { inherit system overlays; };
                rustToolchain = pkgs.rust-bin.stable.latest.default.override {
                    extensions = [
                        "rust-src"
                        "rust-analyzer"
                        "clippy"
                        "rustfmt"
                    ];
                };
                apiNativeBuildInputs = with pkgs; [
                    rustToolchain
                    pkg-config
                ];
                apiBuildInputs = with pkgs; [
                    openssl
                    linux-pam
                    libclang
                    glibc.dev
                    gnumake
                ];
                apiPackage = pkgs.rustPlatform.buildRustPackage {
                    pname = "server-dash-api";
                    version = "0.1.0";
                    src = ./packages/api;
                    cargoLock.lockFile = ./packages/api/Cargo.lock;
                    nativeBuildInputs = apiNativeBuildInputs;
                    buildInputs = apiBuildInputs;
                    OPENSSL_NO_VENDOR = 1;
                    PKG_CONFIG_PATH = "${pkgs.openssl.dev}/lib/pkgconfig";
                    LIBCLANG_PATH = "${pkgs.libclang.lib}/lib";
                    BINDGEN_EXTRA_CLANG_ARGS = "-I${pkgs.linux-pam}/include -I${pkgs.glibc.dev}/include";
                };
            in
            {
                packages.api = apiPackage;
                packages.default = apiPackage;

                devShells.frontend = pkgs.mkShell {
                    buildInputs = with pkgs; [ nodejs pnpm ];
                    NIX_DEV_SHELL = "frontend";
                };
                devShells.api = pkgs.mkShell {
                    nativeBuildInputs = apiNativeBuildInputs;
                    buildInputs = apiBuildInputs;
                    PKG_CONFIG_PATH = "${pkgs.openssl.dev}/lib/pkgconfig";
                    OPENSSL_DIR = "${pkgs.openssl.dev}";
                    OPENSSL_LIB_DIR = "${pkgs.openssl.out}/lib";
                    OPENSSL_INCLUDE_DIR = "${pkgs.openssl.dev}/include";
                    LIBCLANG_PATH = "${pkgs.libclang.lib}/lib";
                    BINDGEN_EXTRA_CLANG_ARGS = "-I${pkgs.linux-pam}/include -I${pkgs.glibc.dev}/include";
                    RUST_SRC_PATH = "${rustToolchain}/lib/rustlib/src/rust/library";

                    NIX_DEV_SHELL = "api";
                    shellHook = ''
                        echo "server-dash-api dev shell ready"
                        echo "   rustc  $(rustc --version)"
                        echo "   cargo  $(cargo --version)"
                    '';
                };
                devShells.default = pkgs.mkShell {
                    buildInputs = with pkgs; [ nodejs pnpm ] ++ apiBuildInputs;
                    nativeBuildInputs = apiNativeBuildInputs;
                    PKG_CONFIG_PATH = "${pkgs.openssl.dev}/lib/pkgconfig";
                    OPENSSL_DIR = "${pkgs.openssl.dev}";
                    OPENSSL_LIB_DIR = "${pkgs.openssl.out}/lib";
                    OPENSSL_INCLUDE_DIR = "${pkgs.openssl.dev}/include";
                    LIBCLANG_PATH = "${pkgs.libclang.lib}/lib";
                    BINDGEN_EXTRA_CLANG_ARGS = "-I${pkgs.linux-pam}/include -I${pkgs.glibc.dev}/include";
                    RUST_SRC_PATH = "${rustToolchain}/lib/rustlib/src/rust/library";

                    NIX_DEV_SHELL = "dev";
                    shellHook = ''
                        REPO_ROOT=$(pwd)
                        dev() {
                            trap 'kill $(jobs -p) 2>/dev/null' EXIT INT TERM
                            (cd "$REPO_ROOT/packages/frontend" && pnpm install && pnpm dev) &
                            (cd "$REPO_ROOT/packages/api" && cargo run) &
                            wait
                        }
                        echo "server-dash dev shell"
                        echo "  node   $(node --version)"
                        echo "  pnpm   $(pnpm --version)"
                        echo "  rustc  $(rustc --version)"
                        echo "  cargo  $(cargo --version)"
                        echo ""
                        echo "  run 'dev' to start both services"
                    '';
                };
            }
        )
        // {
            nixosModules.frontend =
                {
                    config,
                    pkgs,
                    lib,
                    ...
                }:
                {
                    options.services.server-dash = {
                        enable = lib.mkEnableOption "server-dash NixOS System Dashboard";
                        package = lib.mkOption {
                            type = lib.types.path;
                            default = "/var/lib/server-dash/build";
                            description = "Path to the pre-built server-dash package";
                        };
                    };
                    config = lib.mkIf config.services.server-dash.enable {
                        users.users.server-dash = {
                            isSystemUser = true;
                            group = "server-dash";
                            home = "/var/lib/server-dash";
                            createHome = true;
                        };
                        users.groups.server-dash = { };
                        systemd.services.server-dash = {
                            description = "NixOS System Dashboard";
                            after = [ "network.target" ];
                            wantedBy = [ "multi-user.target" ];
                            serviceConfig = {
                                Type = "simple";
                                User = "server-dash";
                                Group = "server-dash";
                                ExecStartPre = "${pkgs.bash}/bin/bash -c 'test -f ${config.services.server-dash.package}/packages/frontend/server.js || (echo \"Build not found, run pnpm deploy first\" && exit 1)'";
                                WorkingDirectory = config.services.server-dash.package;
                                ExecStart = "${pkgs.nodejs}/bin/node ${config.services.server-dash.package}/packages/frontend/server.js";
                                Restart = "on-failure";
                                RestartSec = "10s";
                                Environment = [
                                    "PORT=3000"
                                    "HOSTNAME=127.0.0.1"
                                    "NODE_ENV=production"
                                ];
                            };
                        };
                    };
                };

            nixosModules.api =
                {
                    config,
                    pkgs,
                    lib,
                    ...
                }:
                {
                    options.services.server-dash-api = {
                        enable = lib.mkEnableOption "server-dash-api system stats API";
                        useNixBuild = lib.mkOption {
                            type = lib.types.bool;
                            default = false;
                            description = "Build the binary via Nix instead of using a manually deployed binary";
                        };
                    };

                    config = lib.mkIf config.services.server-dash-api.enable {
                        users.users.server-dash-api = {
                            isSystemUser = true;
                            group = "server-dash-api";
                            extraGroups = [ "shadow" ];
                            home = "/var/lib/server-dash-api";
                            createHome = true;
                        };
                        users.groups.server-dash-api = { };

                        systemd.tmpfiles.rules = [
                            "d /var/lib/server-dash-api 0750 server-dash-api server-dash-api -"
                            "d /var/lib/server-dash-api/webauthn-credentials 0750 server-dash-api server-dash-api -"
                            "d /var/lib/server-dash-api/totp 0750 server-dash-api server-dash-api -"
                            # Config dir: owned by api so it can create the file on first run,
                            # world-readable so the frontend service can also read config.toml.
                            "d /etc/server-dash 0755 server-dash-api server-dash-api -"
                        ];

                        security.pam.services.server-dash-api = { };


                        security.polkit.extraConfig = ''
                            polkit.addRule(function(action, subject) {
                                if ((action.id == "org.freedesktop.systemd1.manage-units" ||
                                     action.id == "org.freedesktop.login1.reboot" ||
                                     action.id == "org.freedesktop.login1.reboot-multiple-sessions" ||
                                     action.id == "org.freedesktop.login1.reboot-ignore-inhibit" ||
                                     action.id == "org.freedesktop.login1.power-off" ||
                                     action.id == "org.freedesktop.login1.power-off-multiple-sessions" ||
                                     action.id == "org.freedesktop.login1.power-off-ignore-inhibit" ||
                                     action.id == "org.freedesktop.login1.halt" ||
                                     action.id == "org.freedesktop.login1.halt-multiple-sessions" ||
                                     action.id == "org.freedesktop.login1.halt-ignore-inhibit") &&
                                    subject.user == "server-dash-api") {
                                    return polkit.Result.YES;
                                }
                            });
                        '';

                        systemd.services.server-dash-api = {
                            description = "server-dash-api - Rust System Stats API";
                            after = [ "network.target" ];
                            wantedBy = [ "multi-user.target" ];
                            serviceConfig = {
                                Type = "simple";
                                User = "server-dash-api";
                                Group = "server-dash-api";
                                SupplementaryGroups = [ "shadow" ];
                                ExecStart =
                                    if config.services.server-dash-api.useNixBuild then
                                        "${self.packages.${pkgs.system}.api}/bin/server-dash-api"
                                    else
                                        "/var/lib/server-dash-api/server-dash-api";
                                Restart = "on-failure";
                                RestartSec = "10s";
                                StateDirectory = "server-dash-api";
                                Environment = [
                                    "RUST_LOG=info"
                                    "SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
                                ];
                                AmbientCapabilities = [ "CAP_DAC_READ_SEARCH" ];
                                CapabilityBoundingSet = [ "CAP_DAC_READ_SEARCH" ];
                            };
                        };
                    };
                };
        };
}
