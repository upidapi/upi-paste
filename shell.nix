let
  pkgs = import <nixpkgs> {};
in
  pkgs.mkShellNoCC {
    packages =
      []
      ++ (with pkgs; [
        bun
        nodejs_26
        tsx
      ]);
  }
