" Folding for :::kiritan{...} blocks, and a jump-to-catalog-entry command, both implemented in autoload/kiritan.vim (docs/DESIGN.md chapter 13).

if exists('b:did_kiritan_ftplugin')
  finish
endif
let b:did_kiritan_ftplugin = 1

setlocal foldmethod=expr
setlocal foldexpr=kiritan#FoldExpr(v:lnum)
setlocal foldtext=kiritan#FoldText()

command! -buffer KiritanJumpToCatalog call kiritan#JumpToCatalog()

" A <Plug> mapping, not a real one — see this plugin's README for how to bind it (e.g. to `gd`) without this plugin silently overriding a mapping you already rely on.
nnoremap <buffer> <silent> <Plug>(kiritan-jump-to-catalog) :KiritanJumpToCatalog<CR>
