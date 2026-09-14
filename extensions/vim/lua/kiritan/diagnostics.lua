-- Undefined-%{name}-variable detection and inline missing/stale/machine display (docs/DESIGN.md chapter 13's remaining two items) — the Neovim-only counterpart to the VS Code extension's diagnostics.cjs. Neovim-only on purpose: plain Vim has no equivalent to `vim.diagnostic`/`vim.system`, and `plugin/kiritan.lua` (which requires this module) is never even sourced under Vim in the first place — Vim's runtime loader only globs `plugin/*.vim`, never `.lua`, so there is no explicit `has('nvim')` guard to write here at all.
--
-- Like the VS Code extension, this shells out to the workspace's own
-- locally-installed `kiritan check --json` (via `npx --no-install`) rather
-- than requiring kiritan's internals in-process, so a broken or
-- version-mismatched project install can't crash the editor, and a project
-- that doesn't depend on kiritan at all is silently skipped rather than
-- triggering a surprise network install.

local M = {}

local ns = vim.api.nvim_create_namespace("kiritan")
local DEFAULT_DELIMITERS = { "%{", "}" }
local ID_LINE_PATTERN = "^:::+kiritan{[^}]*#([%w_%-]+)[^}]*}%s*$"

-- root directory -> its last successful `kiritan check --json` result
local cache = {}

--- Blanks out `inline code` spans (same length, so byte offsets stay
--- correct) so %{name} inside them never matches — kiritan's own
--- interpolation pipeline skips `code`/`inlineCode` mdast nodes by default
--- (`interpolation.skipCodeBlocks`).
local function mask_inline_code(line)
  return (line:gsub("`[^`]*`", function(span)
    return string.rep(" ", #span)
  end))
end

--- Finds `%{name}` uses in `lines` whose name isn't in `known_names`. Skips
--- fenced code blocks and inline code spans, matching
--- `interpolation.skipCodeBlocks`'s default — otherwise documentation
--- showing the syntax itself (like this plugin's own README) would
--- misreport as a real, undefined interpolation. Returns {} outright for
--- non-default delimiters, since the scan below is hardcoded to `%{`/`}`.
function M._find_undefined_variables(lines, known_names, delimiters)
  delimiters = delimiters or DEFAULT_DELIMITERS
  if delimiters[1] ~= DEFAULT_DELIMITERS[1] or delimiters[2] ~= DEFAULT_DELIMITERS[2] then
    return {}
  end

  local known = {}
  for _, name in ipairs(known_names or {}) do
    known[name] = true
  end

  local results = {}
  local in_fence = false
  for lnum, raw in ipairs(lines) do
    if raw:match("^%s*```") then
      in_fence = not in_fence
    elseif not in_fence then
      local scanned = mask_inline_code(raw)
      local init = 1
      while true do
        local s, e, esc, name = scanned:find("(\\?)%%{([%a_][%w_]*)}", init)
        if not s then
          break
        end
        if esc == "" and not known[name] then
          table.insert(results, { line = lnum - 1, start_col = s - 1, end_col = e, name = name })
        end
        init = e + 1
      end
    end
  end
  return results
end

--- A `.base.md`/`.md` source's "base" name is what catalog files key off.
function M._base_name_for(filename)
  return (filename:gsub("%.md$", ""):gsub("%.base$", ""))
end

--- Returns the catalog id on `line`, or nil if it isn't a
--- `:::kiritan{#<id>}` block.
function M._catalog_id_at(line)
  return line:match(ID_LINE_PATTERN)
end

--- Maps `kiritan check --json`'s issues onto positions in `lines` (the
--- currently-open buffer whose repo-relative path is `source_path`).
--- Catalog-strategy issues (which carry an `id`) are placed on their
--- `:::kiritan{#<id>}` line; other issues for this file are placed on
--- line 0, since there's no more specific spot without a real
--- per-locale-block position.
function M._map_check_issues_to_positions(lines, issues, source_path)
  local results = {}
  for _, issue in ipairs(issues or {}) do
    if issue.source == source_path then
      if issue.id then
        for lnum, text in ipairs(lines) do
          if M._catalog_id_at(text) == issue.id then
            local hash_pos = text:find("#" .. issue.id, 1, true)
            if hash_pos then
              table.insert(results, {
                line = lnum - 1,
                start_col = hash_pos,
                end_col = hash_pos + #issue.id,
                issue = issue,
              })
            end
            break
          end
        end
      else
        table.insert(results, {
          line = 0,
          start_col = 0,
          end_col = #(lines[1] or ""),
          issue = issue,
        })
      end
    end
  end
  return results
end

local function severity_for(kind)
  if kind == "missing" or kind == "stale" then
    return vim.diagnostic.severity.WARN
  end
  return vim.diagnostic.severity.INFO
end

local function find_root(bufname)
  return vim.fs.root(bufname, function(name)
    return name:match("%.kiritanconfig$") ~= nil
  end)
end

-- `vim.system` (like Node's child_process.execFile) doesn't resolve a
-- Windows PATHEXT shim like npx.cmd the way an interactive shell does — go
-- through the shell explicitly instead of spawning "npx" directly, the same
-- fix the VS Code extension's diagnostics.cjs needed for the same reason.
local function check_command()
  if vim.fn.has("win32") == 1 then
    return { "cmd", "/c", "npx --no-install kiritan check --json" }
  end
  return { "sh", "-c", "npx --no-install kiritan check --json" }
end

local function run_check(root, on_done)
  vim.system(
    check_command(),
    { cwd = root, text = true },
    function(result)
      -- `kiritan check` exits 1 whenever any issue matches `check.failOn` —
      -- exactly the case where there's something worth showing, not a
      -- reason to discard stdout. Only bail out if there's genuinely
      -- nothing parseable (no local kiritan, no *.kiritanconfig, or a
      -- crash rather than a normal "issues found" exit).
      if not result.stdout or result.stdout == "" then
        return
      end
      local ok, parsed = pcall(vim.json.decode, result.stdout)
      if ok then
        cache[root] = parsed
        vim.schedule(on_done)
      end
    end
  )
end

local function refresh(bufnr)
  if not vim.api.nvim_buf_is_valid(bufnr) or vim.bo[bufnr].filetype ~= "markdown" then
    return
  end
  local bufname = vim.api.nvim_buf_get_name(bufnr)
  local root = find_root(bufname)
  if not root then
    vim.diagnostic.reset(ns, bufnr)
    return
  end

  local cached = cache[root]
  if not cached then
    return
  end

  local lines = vim.api.nvim_buf_get_lines(bufnr, 0, -1, false)
  local source_path = bufname:sub(#root + 2)
  local diagnostics = {}

  for _, pos in ipairs(M._map_check_issues_to_positions(lines, cached.issues, source_path)) do
    table.insert(diagnostics, {
      lnum = pos.line,
      col = pos.start_col,
      end_col = pos.end_col,
      severity = severity_for(pos.issue.kind),
      message = string.format("[%s] %s", pos.issue.locale, pos.issue.detail),
      source = "kiritan",
    })
  end

  for _, v in ipairs(M._find_undefined_variables(lines, cached.interpolationVariableNames, cached.delimiters)) do
    table.insert(diagnostics, {
      lnum = v.line,
      col = v.start_col,
      end_col = v.end_col,
      severity = vim.diagnostic.severity.WARN,
      message = string.format("%%{%s} is not declared in interpolation.variables", v.name),
      source = "kiritan",
    })
  end

  vim.diagnostic.set(ns, bufnr, diagnostics)
end

local function refresh_from_disk(bufnr)
  if vim.bo[bufnr].filetype ~= "markdown" then
    return
  end
  local root = find_root(vim.api.nvim_buf_get_name(bufnr))
  if root then
    run_check(root, function()
      refresh(bufnr)
    end)
  end
end

--- Wires up the autocommands driving diagnostics. Safe to call more than
--- once — `plugin/kiritan.lua` guards against that anyway.
function M.setup()
  local group = vim.api.nvim_create_augroup("kiritan_diagnostics", { clear = true })
  local timers = {}

  vim.api.nvim_create_autocmd({ "FileType" }, {
    group = group,
    pattern = "markdown",
    callback = function(args)
      refresh_from_disk(args.buf)
    end,
  })

  vim.api.nvim_create_autocmd({ "BufWritePost" }, {
    group = group,
    pattern = "*.md",
    callback = function(args)
      refresh_from_disk(args.buf)
    end,
  })

  vim.api.nvim_create_autocmd({ "TextChanged", "TextChangedI" }, {
    group = group,
    pattern = "*.md",
    callback = function(args)
      local bufnr = args.buf
      if timers[bufnr] then
        timers[bufnr]:stop()
      end
      timers[bufnr] = vim.defer_fn(function()
        refresh(bufnr)
      end, 300)
    end,
  })

  vim.api.nvim_create_autocmd("BufDelete", {
    group = group,
    pattern = "*.md",
    callback = function(args)
      pcall(vim.diagnostic.reset, ns, args.buf)
    end,
  })
end

return M
