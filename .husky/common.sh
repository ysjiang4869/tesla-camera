# Ensure pnpm/node are on PATH for GUI git clients (e.g. Fork), which don't
# source shell profiles. If pnpm is already resolvable, do nothing; otherwise
# probe common install locations across node version managers and package
# managers so the hooks work without relying on nvm specifically.
ensure_pnpm_on_path() {
  command -v pnpm >/dev/null 2>&1 && return 0

  # nvm (pick the most recently installed version)
  if [ -d "$HOME/.nvm/versions/node" ]; then
    _bin=$(ls -dt "$HOME/.nvm/versions/node"/*/bin 2>/dev/null | head -1)
    [ -n "$_bin" ] && export PATH="$_bin:$PATH"
  fi
  command -v pnpm >/dev/null 2>&1 && return 0

  # fnm
  if [ -d "$HOME/.local/state/fnm_multishells" ]; then
    _bin=$(ls -dt "$HOME/.local/state/fnm_multishells"/*/bin 2>/dev/null | head -1)
    [ -n "$_bin" ] && export PATH="$_bin:$PATH"
  fi

  # volta / corepack / homebrew / pnpm standalone
  for _dir in \
    "$HOME/.volta/bin" \
    "$HOME/Library/pnpm" \
    "$HOME/.local/share/pnpm" \
    /opt/homebrew/bin \
    /usr/local/bin
  do
    [ -d "$_dir" ] && export PATH="$_dir:$PATH"
  done

  command -v pnpm >/dev/null 2>&1
}

ensure_pnpm_on_path || {
  echo "husky - pnpm not found on PATH; install pnpm or add its bin dir to PATH" >&2
  exit 127
}
