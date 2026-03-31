{
    description = "server-dash - NixOS System Dashboard";
    inputs = {
        nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
        flake-utils.url = "github:numtide/flake-utils";
    };
    outputs =
        {
            self,
            nixpkgs,
            flake-utils,
            ...
        }:
        flake-utils.lib.eachDefaultSystem (
            system:
            let
                pkgs = import nixpkgs { inherit system; };
            in
            {
                devShells.default = pkgs.mkShell {
                    buildInputs = with pkgs; [ nodejs ];
                };
            }
        )
        // {
            nixosModules.default =
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
                                ExecStartPre = "${pkgs.bash}/bin/bash -c 'test -f ${config.services.server-dash.package}/server.js || (echo \"Build not found, run npm run deploy first\" && exit 1)'";
                                WorkingDirectory = config.services.server-dash.package;
                                ExecStart = "${pkgs.nodejs}/bin/node ${config.services.server-dash.package}/server.js";
                                Restart = "on-failure";
                                RestartSec = "10s";
                                EnvironmentFile = "/var/lib/server-dash/.env";
                                Environment = [
                                    "PORT=3000"
                                    "HOSTNAME=127.0.0.1"
                                    "NODE_ENV=production"
                                ];
                            };
                        };
                    };
                };
        };
}
