" Highlighting for Kiritan's :::kiritan{...}/::kiritan{...} directive blocks and %{name} interpolation inside Markdown (docs/DESIGN.md chapters 4.2/4.3/5) — layered onto the built-in markdown syntax via Vim's after/syntax/ convention, the Vimscript equivalent of the VS Code extension's TextMate grammar injection. Nesting isn't tracked here (a closing fence is just any line of 2+ colons, same as the VS Code grammar) — matching colon counts up is left to the author, per remark-directive convention.

syn match kiritanDirectiveOpen "^:\{3,}kiritan{[^}]*}\s*$" contains=kiritanDirectiveName,kiritanAttrs
syn match kiritanLeaf "^:\{2}kiritan{[^}]*}\s*$" contains=kiritanDirectiveName,kiritanAttrs
syn match kiritanDirectiveClose "^:\{2,}\s*$"

syn match kiritanDirectiveName "kiritan" contained
syn region kiritanAttrs matchgroup=kiritanAttrsBrace start="{" end="}" contained contains=kiritanAttrId,kiritanAttrLocale,kiritanAttrSwitcher

syn match kiritanAttrId "#[A-Za-z0-9_-]\+" contained
syn match kiritanAttrLocale "\<locale\>=[A-Za-z0-9_-]\+" contained
syn keyword kiritanAttrSwitcher switcher contained

syn match kiritanInterpolationEscaped "\\%{[A-Za-z_][A-Za-z0-9_]*}"
syn match kiritanInterpolation "%{[A-Za-z_][A-Za-z0-9_]*}"

hi def link kiritanDirectiveOpen Special
hi def link kiritanLeaf Special
hi def link kiritanDirectiveClose Special
hi def link kiritanDirectiveName Keyword
hi def link kiritanAttrsBrace Delimiter
hi def link kiritanAttrId Identifier
hi def link kiritanAttrLocale Type
hi def link kiritanAttrSwitcher Keyword
hi def link kiritanInterpolation Macro
hi def link kiritanInterpolationEscaped String
