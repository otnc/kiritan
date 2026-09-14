" Folding for :::kiritan{...} blocks, and jumping from a :::kiritan{#<id>} block to its entry in the sibling <base>.<locale>.catalog.json (docs/DESIGN.md chapters 4.3/13) — the Vimscript equivalent of the VS Code extension's folding-core.cjs/catalog-jump.cjs. Autoload (not after/ftplugin.vim directly) so this is only parsed on first actual use, not on every markdown buffer open.

function! s:EscapeRegex(text) abort
  return escape(a:text, '\.*$^~[]/')
endfunction

" A `.base.md`/`.md` source's "base" name is what catalog files key off.
function! kiritan#BaseNameFor(filename) abort
  let l:name = substitute(a:filename, '\.md$', '', '')
  return substitute(l:name, '\.base$', '', '')
endfunction

" Returns the catalog id on `line`, or '' if it isn't a :::kiritan{#<id>} block.
function! kiritan#CatalogIdAt(line) abort
  let l:m = matchlist(a:line, '^:\{3,}kiritan{[^}]*#\([A-Za-z0-9_-]\+\)[^}]*}\s*$')
  return empty(l:m) ? '' : l:m[1]
endfunction

function! kiritan#JumpToCatalog() abort
  let l:id = kiritan#CatalogIdAt(getline('.'))
  if empty(l:id)
    echohl WarningMsg
    echomsg 'kiritan: not on a :::kiritan{#<id>} line'
    echohl None
    return
  endif

  let l:dir = expand('%:p:h')
  let l:base = kiritan#BaseNameFor(expand('%:t'))
  let l:pattern = l:dir . '/' . l:base . '.*.catalog.json'
  let l:qf = []

  for l:file in glob(l:pattern, 0, 1)
    let l:lnum = 0
    for l:text in readfile(l:file)
      let l:lnum += 1
      if l:text =~# '"' . s:EscapeRegex(l:id) . '"\s*:'
        call add(l:qf, { 'filename': l:file, 'lnum': l:lnum, 'text': 'catalog id "' . l:id . '"' })
        break
      endif
    endfor
  endfor

  if empty(l:qf)
    echohl WarningMsg
    echomsg 'kiritan: no catalog entry found for #' . l:id
    echohl None
    return
  endif

  call setqflist(l:qf)
  if len(l:qf) > 1
    copen
  endif
  cfirst
endfunction

" Caches computed fold levels per buffer, keyed by b:changedtick so they're
" only recomputed when the buffer actually changes.
let s:fold_cache = {}

function! kiritan#FoldExpr(lnum) abort
  let l:bufnr = bufnr('%')
  let l:tick = getbufvar(l:bufnr, 'changedtick')
  if !has_key(s:fold_cache, l:bufnr) || s:fold_cache[l:bufnr].tick != l:tick
    let s:fold_cache[l:bufnr] = { 'tick': l:tick, 'levels': s:ComputeFoldLevels() }
  endif
  return get(s:fold_cache[l:bufnr].levels, a:lnum, 0)
endfunction

function! kiritan#FoldText() abort
  return getline(v:foldstart) . ' (' . (v:foldend - v:foldstart + 1) . ' lines)'
endfunction

" Walks the buffer with a colon-count stack (any directive's fence, kiritan
" or not, occupies it, so a kiritan block nested inside another directive
" still closes against the right fence) to find kiritan-opened line spans,
" then converts those spans into a per-line fold level. Mirrors
" folding-core.cjs's computeFoldingRanges exactly.
function! s:ComputeFoldLevels() abort
  let l:lines = getline(1, '$')
  let l:stack = []
  let l:spans = []

  let l:lnum = 0
  for l:text in l:lines
    let l:lnum += 1

    let l:m = matchlist(l:text, '^\(:\{3,}\)kiritan{[^}]*}\s*$')
    if !empty(l:m)
      call add(l:stack, { 'line': l:lnum, 'colons': strlen(l:m[1]), 'iskiritan': 1 })
      continue
    endif

    let l:m = matchlist(l:text, '^\(:\{2,}\)\s*$')
    if !empty(l:m)
      let l:colons = strlen(l:m[1])
      let l:i = len(l:stack) - 1
      while l:i >= 0
        if l:stack[l:i].colons == l:colons
          let l:opened = remove(l:stack, l:i)
          if l:opened.iskiritan && l:lnum > l:opened.line
            call add(l:spans, [l:opened.line, l:lnum])
          endif
          break
        endif
        let l:i -= 1
      endwhile
      continue
    endif

    let l:m = matchlist(l:text, '^\(:\{3,}\)\S.*$')
    if !empty(l:m)
      call add(l:stack, { 'line': l:lnum, 'colons': strlen(l:m[1]), 'iskiritan': 0 })
    endif
  endfor

  let l:depth = repeat([0], len(l:lines) + 1)
  for [l:s, l:e] in l:spans
    for l:i in range(l:s, l:e)
      let l:depth[l:i] += 1
    endfor
  endfor

  let l:starts = {}
  let l:ends = {}
  for [l:s, l:e] in l:spans
    let l:starts[l:s] = 1
    let l:ends[l:e] = 1
  endfor

  let l:result = {}
  for l:i in range(1, len(l:lines))
    if has_key(l:starts, l:i)
      let l:result[l:i] = '>' . l:depth[l:i]
    elseif has_key(l:ends, l:i)
      let l:result[l:i] = '<' . l:depth[l:i]
    else
      let l:result[l:i] = l:depth[l:i]
    endif
  endfor
  return l:result
endfunction
