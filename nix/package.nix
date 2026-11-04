{ lib
, buildNpmPackage
, nodejs
, makeWrapper
}:

buildNpmPackage {
  pname = "upi-paste";
  version = "0.1.0";

  src = ../.;

  # npmDepsHash = lib.fakeHash;
  npmDepsHash = "sha256-+YgXnII+Co8RP1rzcB8v7JHrlIeUCoZUBGN/s2BqhLA=";

  nativeBuildInputs = [ makeWrapper ];

  # Tell Next.js and your env validator not to fail at build-time
  SKIP_ENV_VALIDATION = "1";
  NEXT_TELEMETRY_DISABLED = "1";

  installPhase = ''
    runHook preInstall

    mkdir -p $out/share/paste-app/.next
    cp -r .next/standalone/. $out/share/paste-app/
    cp -r .next/static $out/share/paste-app/.next/static
    cp -r public $out/share/paste-app/public

    mkdir -p $out/bin
    makeWrapper ${nodejs}/bin/node $out/bin/paste-app \
      --add-flags "$out/share/paste-app/server.js" \
      --set-default NODE_ENV production 

    runHook postInstall
  '';

  meta = with lib; {
    description = "Next.js pastebin application";
    mainProgram = "paste-app";
  };
}
