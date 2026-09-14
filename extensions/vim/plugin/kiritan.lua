-- Neovim-only entry point for undefined-%{name} detection and inline missing/stale/machine indicators (docs/DESIGN.md chapter 13; see lua/kiritan/diagnostics.lua for the implementation). Vim never sources this file in the first place — its runtime loader only globs plugin/*.vim, never .lua — so there's nothing to guard against for Vim users; the version check below is only about which Neovim releases have the APIs diagnostics.lua depends on (vim.system, vim.fs.root).
if vim.g.loaded_kiritan_diagnostics then
  return
end
vim.g.loaded_kiritan_diagnostics = true

if vim.fn.has("nvim-0.10") == 0 then
  return
end

require("kiritan.diagnostics").setup()
