{
  config,
  lib,
  pkgs,
  ...
}: let
  inherit (lib) mkOption types mkEnableOption mkIf getExe;
  cfg = config.services.upi-paste;
  pkg = pkgs.callPackage ./package.nix {};
in {
  options.services.upi-paste = {
    enable = mkEnableOption "upi-paste service";

    package = mkOption {
      type = types.package;
      default = pkg;
      description = "The upi-paste package to use.";
    };

    user = mkOption {
      type = types.str;
      default = "upi-paste";
      description = "User account under which upi-paste runs.";
    };

    group = mkOption {
      type = types.str;
      default = "upi-paste";
      description = "Group under which upi-paste runs.";
    };

    port = mkOption {
      type = types.port;
      default = 3000;
      description = "Port to listen on.";
    };

    url = mkOption {
      type = types.str;
      default = "http://127.0.0.1:${toString cfg.port}";
      defaultText = lib.literalExpression "http://127.0.0.1:\${toString config.services.upi-paste.port}";
      description = "Full URL to access the service.";
    };

    # host = mkOption {
    #   type = types.str;
    #   default = "127.0.0.1";
    #   description = "Host/IP address to bind to.";
    # };
    maxUploadBytes = mkOption {
      type = types.number;
      default = 512 * 1024 * 1024; # 0.5 Gb
      description = "Max upload size allowed.";
    };

    dataDir = mkOption {
      type = types.path;
      default = "/var/lib/upi-paste/data";
      description = "Directory where uploaded pastes and files are stored.";
    };

    environmentFile = mkOption {
      type = types.nullOr types.path;
      default = null;
      description = ''
        Path to an environment file (e.g. for secrets like TOKEN_SECRET)
        passed directly to systemd.
      '';
      example = "/etc/upi-paste.env";
    };

    extraEnvironment = mkOption {
      type = types.attrsOf types.str;
      default = {};
      description = "Additional environment variables to pass to the service.";
    };
  };

  config = mkIf cfg.enable {
    # 1. Create system user and group
    users.users = mkIf (cfg.user == "upi-paste") {
      upi-paste = {
        isSystemUser = true;
        group = cfg.group;
        description = "upi-paste daemon user";
        home = "/var/lib/upi-paste";
      };
    };

    users.groups = mkIf (cfg.group == "upi-paste") {
      upi-paste = {};
    };

    # 2. Hardened Systemd Service
    systemd.services.upi-paste = {
      description = "upi-paste (Next.js)";
      after = ["network.target"];
      wantedBy = ["multi-user.target"];

      environment =
        {
          NODE_ENV = "production";
          PORT = toString cfg.port;
          DATA_DIR = toString cfg.dataDir;
          NEXT_PUBLIC_URL = toString cfg.url;
          NEXT_PUBLIC_MAX_UPLOAD_BYTES = toString cfg.maxUploadBytes;
        }
        // cfg.extraEnvironment;

      serviceConfig = {
        Type = "simple";
        User = cfg.user;
        Group = cfg.group;
        Restart = "on-failure";
        RestartSec = "5s";

        ExecStart = "${getExe cfg.package}";

        StateDirectory = "upi-paste";
        WorkingDirectory = "/var/lib/upi-paste";

        EnvironmentFile = lib.optional (cfg.environmentFile != null) cfg.environmentFile;

        ProtectSystem = "strict";
        ProtectHome = true;
        PrivateTmp = true;
        PrivateDevices = true;
        ProtectClock = true;
        ProtectKernelTunables = true;
        ProtectKernelModules = true;
        ProtectKernelLogs = true;
        ProtectControlGroups = true;

        NoNewPrivileges = true;
        CapabilityBoundingSet = "";
        AmbientCapabilities = "";
        RestrictSUIDSGID = true;
        LockPersonality = true;
        RestrictNamespaces = true;
        RestrictRealtime = true;

        RestrictAddressFamilies = ["AF_INET" "AF_INET6" "AF_UNIX"];
        SystemCallArchitectures = "native";
        SystemCallFilter = ["@system-service" "~@privileged @resources @obsolete"];

        # req by node V8 JIT
        MemoryDenyWriteExecute = false;

        UMask = "0027";
      };
    };
  };
}
