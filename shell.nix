let
  pkgs = import <nixpkgs> {};
in
  pkgs.mkShellNoCC {
    packages =
      []
      ++ (with pkgs; [
        nodejs_26
      ]);
  }
