function installStyles(): void {
    const style = document.createElement("style");
    style.textContent = `
        :root { color-scheme: dark; --at-bg:#111827; --at-panel:#182233; --at-panel2:#202c40; --at-text:#f1f5f9; --at-muted:#9caec5; --at-border:#34445d; --at-accent:#79a7ff; --at-danger:#ef6b73; --at-success:#51c790; }
        * { box-sizing:border-box; }
        html, body { width:100%; height:100%; margin:0; font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:transparent; color:var(--at-text); }
        button, input, textarea, select { font:inherit; }
        button { border:1px solid var(--at-border); background:var(--at-panel2); color:var(--at-text); border-radius:9px; padding:8px 12px; cursor:pointer; }
        button:hover:not(:disabled) { border-color:var(--at-accent); }
        button:disabled { opacity:.55; cursor:not-allowed; }
        button.primary { background:var(--at-accent); border-color:var(--at-accent); color:#0b1220; font-weight:700; }
        button.danger { color:#ffd9dc; border-color:#81434a; background:#3a242b; }
        input, textarea, select { width:100%; border:1px solid var(--at-border); background:#0e1726; color:var(--at-text); border-radius:9px; padding:10px; }
        textarea { resize:vertical; min-height:90px; line-height:1.55; }
        label { display:flex; flex-direction:column; gap:7px; color:var(--at-muted); font-size:13px; }
        h1, h2, h3, p { margin-top:0; }
        .app-shell { position:fixed; inset:0; display:grid; grid-template-rows:auto auto auto 1fr; background:var(--at-bg); }
        .app-shell.minimized { grid-template-rows:1fr; }
        header { display:flex; justify-content:space-between; align-items:center; gap:20px; padding:16px 22px 12px; border-bottom:1px solid var(--at-border); user-select:none; }
        header[data-drag-handle] { cursor:move; }
        header button { cursor:pointer; }
        header h1 { margin:1px 0 2px; font-size:22px; }
        .header-title-row { display:flex; align-items:center; gap:10px; min-width:0; }
        .header-title-row h1, .header-title-row strong { margin:1px 0 2px; }
        .active-memo-badge { flex:none; border:1px solid color-mix(in srgb, var(--at-success) 55%, var(--at-border)); border-radius:999px; padding:3px 8px; color:#b9f7d8; background:color-mix(in srgb, var(--at-success) 12%, transparent); font-size:11px; font-weight:700; white-space:nowrap; }
        .source-title { display:inline-flex; align-items:center; flex-wrap:wrap; gap:7px; }
        .cbs-warning { display:inline-flex; align-items:center; border:1px solid #9a6a28; border-radius:999px; padding:2px 7px; color:#ffd99a; background:#3b2b17; font-size:10px; font-weight:750; line-height:1.35; white-space:nowrap; }
        .feature-warning { display:inline-flex; align-items:center; border:1px solid #a94b70; border-radius:999px; padding:2px 7px; color:#ffc0d5; background:#3d1e2b; font-size:10px; font-weight:750; line-height:1.35; white-space:nowrap; }
        .token-badge { display:inline-flex; align-items:center; border:1px solid var(--at-border); border-radius:999px; padding:2px 7px; color:var(--at-muted); background:var(--at-panel2); font-size:10px; font-weight:700; line-height:1.35; white-space:nowrap; }
        .context-pre { white-space:pre-wrap; overflow-wrap:anywhere; color:var(--at-muted); line-height:1.5; margin:0; }
        .cbs-unsupported-fragment { color:#ffd08a; background:rgba(167, 91, 18, .32); border-radius:4px; padding:1px 3px; font-weight:700; }
        .cbs-if-true-marker { color:#2e7d32; background:rgba(76, 175, 80, .35); border-radius:4px; padding:1px 3px; font-weight:700; }
        .cbs-if-true-content { background:rgba(76, 175, 80, .08); border-radius:4px; padding:1px 3px; }
        .cbs-if-false-marker { color:#c62828; background:rgba(239, 83, 80, .35); border-radius:4px; padding:1px 3px; font-weight:700; cursor:pointer; }
        .cbs-if-false-content { background:rgba(239, 83, 80, .08); border-radius:4px; padding:1px 3px; }
        .cbs-false-block { margin:2px 0; }
        .cbs-toggle { cursor:pointer; }
        .cbs-collapsible { display:block; }
        .cbs-inline-result { color:var(--at-accent); }
        .version { color:var(--at-muted); font-size:.58em; font-weight:650; vertical-align:middle; }
        header p { margin:0; color:var(--at-muted); font-size:13px; }
        nav { display:flex; gap:4px; padding:8px 18px; border-bottom:1px solid var(--at-border); overflow-x:auto; }
        nav button { background:transparent; border-color:transparent; white-space:nowrap; }
        nav button.selected { color:var(--at-accent); border-color:var(--at-accent); background:color-mix(in srgb, var(--at-accent) 12%, transparent); }
        main { min-height:0; overflow:hidden; }
        .status { margin:8px 18px 0; padding:8px 12px; border-radius:8px; font-size:13px; background:#1e293b; color:var(--at-muted); }
        .context-note { margin:8px 18px 0; padding:8px 12px; border-radius:8px; font-size:13px; background:#1e293b; color:var(--at-muted); }
        .status.success { color:#b9f7d8; background:#17342b; }
        .status.error { color:#ffd3d6; background:#3b2229; }
        .writer-layout { height:100%; display:grid; grid-template-rows:auto 1fr auto; }
        .room-toolbar { display:flex; gap:8px; align-items:center; padding:9px 14px; border-bottom:1px solid var(--at-border); background:var(--at-panel); }
        .room-toolbar select { flex:1; min-width:120px; }
        .toolbar-toggle { display:flex; flex-direction:row; align-items:center; gap:6px; flex:none; color:var(--at-text); font-size:13px; white-space:nowrap; }
        .toolbar-toggle input { width:auto; }
        .messages { min-height:0; overflow-y:auto; padding:18px max(18px, calc((100vw - 900px)/2)); }
        .message { max-width:780px; margin:0 auto 14px; border:1px solid var(--at-border); border-radius:14px; padding:14px 16px; background:var(--at-panel); }
        .message.user { margin-left:auto; background:#1c3150; }
        .message-role { color:var(--at-accent); font-size:11px; font-weight:800; letter-spacing:.08em; margin-bottom:8px; }
        .message-content { line-height:1.62; overflow-wrap:anywhere; }
        .message-content.markdown > :first-child { margin-top:0; }
        .message-content.markdown > :last-child { margin-bottom:0; }
        .message-content.markdown h1, .message-content.markdown h2, .message-content.markdown h3, .message-content.markdown h4, .message-content.markdown h5, .message-content.markdown h6 { margin:1em 0 .42em; line-height:1.3; }
        .message-content.markdown h1 { font-size:1.45em; }
        .message-content.markdown h2 { font-size:1.3em; }
        .message-content.markdown h3 { font-size:1.16em; }
        .message-content.markdown p { margin:.62em 0; }
        .message-content.markdown ul, .message-content.markdown ol { margin:.65em 0; padding-left:1.65em; }
        .message-content.markdown blockquote { margin:.7em 0; padding:.35em .85em; border-left:3px solid var(--at-accent); color:var(--at-muted); background:color-mix(in srgb, var(--at-accent) 7%, transparent); }
        .message-content.markdown code { padding:.12em .35em; border-radius:5px; background:#0b1321; font-family:ui-monospace, SFMono-Regular, Consolas, monospace; font-size:.92em; }
        .message-content.markdown .md-code-wrap { position:relative; margin:.75em 0; }
        .message-content.markdown .md-code-language { position:absolute; top:6px; right:9px; color:var(--at-muted); font-size:10px; text-transform:uppercase; }
        .message-content.markdown .md-code-block { margin:0; padding:14px; overflow:auto; border:1px solid var(--at-border); border-radius:9px; background:#0b1321; color:var(--at-text); }
        .message-content.markdown .md-code-block code { padding:0; background:transparent; }
        .message-content.markdown a { color:var(--at-accent); text-decoration:underline; }
        .message-content.markdown hr { border:0; border-top:1px solid var(--at-border); margin:1em 0; }
        .message-edit { padding:5px 8px; font-size:11px; color:var(--at-muted); }
        .message-actions { flex-wrap:wrap; justify-content:flex-end; }
        .edit-message { min-height:120px; margin-bottom:10px; }
        .composer { display:grid; grid-template-columns:1fr auto; gap:10px; padding:12px max(18px, calc((100vw - 900px)/2)) 18px; border-top:1px solid var(--at-border); background:var(--at-panel); }
        .composer textarea { min-height:76px; max-height:220px; }
        .composer-actions { display:flex; flex-direction:column; gap:8px; min-width:110px; }
        .composer-actions button { flex:1; }
        .composer .send { min-width:110px; }
        .token-check.exceeded { box-shadow:0 0 0 2px color-mix(in srgb, var(--at-danger) 35%, transparent); }
        .token-info { grid-column:1 / -1; padding:14px; border:1px solid var(--at-border); border-radius:12px; background:#111b2b; }
        .token-warning { display:flex; flex-direction:column; gap:4px; margin-bottom:12px; padding:10px 12px; border:1px solid #9a454c; border-radius:9px; background:#3b2229; color:#ffd3d6; font-size:13px; line-height:1.45; }
        .token-bar { position:relative; height:22px; margin:8px 0 16px; overflow:hidden; border:2px solid #667085; border-radius:7px; background:#9ca3af; }
        .token-bar span { position:absolute; top:0; bottom:0; display:block; }
        .token-input-bar { left:0; background:#3b82f6; }
        .token-output-bar { background:#22c55e; }
        .token-grid { display:grid; grid-template-columns:1fr auto; gap:8px 18px; color:var(--at-muted); }
        .token-grid strong { text-align:right; }
        .token-input-label { color:#60a5fa; }
        .token-output-label { color:#4ade80; }
        .token-disclaimer { margin:12px 0 0; color:var(--at-muted); font-size:12px; }
        .panel { height:100%; overflow-y:auto; padding:22px max(18px, calc((100vw - 1000px)/2)) 50px; }
        .section-heading { display:flex; justify-content:space-between; align-items:flex-start; gap:18px; margin-bottom:18px; }
        .section-heading h2 { margin-bottom:4px; }
        .section-heading p, .meta { color:var(--at-muted); font-size:13px; margin-bottom:0; }
        .row { display:flex; align-items:center; gap:8px; }
        .between { justify-content:space-between; }
        .memo-list, .lore-list { display:grid; gap:12px; }
        [data-reorder-card] { position:relative; }
        [data-reorder-card].reorder-dragging { opacity:.42; }
        [data-reorder-card].reorder-drop-before::before, [data-reorder-card].reorder-drop-after::after { content:""; position:absolute; right:4px; left:4px; z-index:20; height:5px; border-radius:999px; background:rgba(96,165,250,.88); box-shadow:0 0 0 1px rgba(191,219,254,.58),0 0 13px rgba(49,130,246,.68); pointer-events:none; }
        [data-reorder-card].reorder-drop-before::before { top:-9px; }
        [data-reorder-card].reorder-drop-after::after { bottom:-9px; }
        .reorder-handle-column { min-width:0; display:flex; align-self:stretch; align-items:center; justify-content:center; border-right:1px solid var(--at-border-strong); border-radius:inherit 0 0 inherit; background:rgba(49,130,246,.035); color:#7d8795; cursor:grab; user-select:none; touch-action:none; transition:color .15s ease,background .15s ease; }
        .reorder-handle-column:hover { background:rgba(49,130,246,.13); color:#8fbdff; }
        .reorder-handle-column:active { cursor:grabbing; }
        .reorder-grip { width:18px; height:28px; fill:currentColor; opacity:.9; pointer-events:none; }
        .reorder-card-content { min-width:0; }
        .memo-folder { margin-bottom:16px; padding:0; display:grid; grid-template-columns:42px minmax(0,1fr); border:1px solid var(--at-border); border-radius:14px; background:color-mix(in srgb, var(--at-panel) 78%, transparent); }
        .memo-folder-content { padding:14px; }
        .memo-folder.disabled { opacity:.72; }
        .folder-heading { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:12px; }
        .memo-folder.collapsed .folder-heading { margin-bottom:0; }
        .collapse-heading { flex:1; min-width:0; display:flex; align-items:center; gap:10px; padding:4px 6px; border-color:transparent; background:transparent; text-align:left; }
        .collapse-heading:hover:not(:disabled) { background:color-mix(in srgb, var(--at-accent) 8%, transparent); }
        .collapse-heading > span:last-child { min-width:0; display:flex; flex-direction:column; gap:3px; }
        .collapse-icon { flex:none; width:14px; color:var(--at-accent); font-size:17px; line-height:1; text-align:center; }
        .folder-actions { flex:none; flex-wrap:wrap; justify-content:flex-end; }
        .folder-empty { padding:18px; color:var(--at-muted); text-align:center; border:1px dashed var(--at-border); border-radius:10px; }
        .memo-card, .lore-card, .preset-editor, .context-block, .danger-zone { padding:16px; border:1px solid var(--at-border); border-radius:12px; background:var(--at-panel); }
        .memo-card { padding:0; display:grid; grid-template-columns:42px minmax(0,1fr); }
        .memo-card-content { min-width:0; display:flex; flex-direction:column; padding:16px; }
        .memo-card.effective { border-left:4px solid var(--at-success); }
        .memo-card.suppressed { border-left:4px solid #667085; }
        .memo-card.collapsed { padding:0; }
        .memo-card.collapsed .memo-card-content { padding-top:11px; padding-bottom:11px; }
        .memo-card.expanded { min-height:clamp(320px, calc(100vh - 180px), 1100px); display:grid; }
        .memo-card-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .memo-heading-actions { flex:none; flex-wrap:wrap; justify-content:flex-end; }
        .memo-collapse-heading { margin:-4px 0; }
        .memo-expanded-body { flex:1; min-height:0; display:flex; flex-direction:column; }
        .memo-content-editor { flex:1; min-height:240px; margin:14px 0 12px; padding:16px; border-color:var(--at-border); background:#111b2b; color:var(--at-muted); font-family:ui-monospace, SFMono-Regular, Consolas, monospace; font-size:13px; line-height:1.55; white-space:pre-wrap; overflow-wrap:anywhere; resize:none; }
        .memo-actions select { min-width:140px; flex:1; }
        .toggle { flex-direction:row; align-items:center; color:var(--at-text); }
        .toggle input { width:auto; }
        .stats { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px; }
        .stats span { border:1px solid var(--at-border); border-radius:999px; padding:6px 10px; color:var(--at-muted); font-size:12px; }
        details { margin-bottom:10px; }
        summary { cursor:pointer; font-weight:650; display:flex; align-items:center; justify-content:space-between; gap:12px; }
        summary > .source-title { min-width:0; }
        pre { white-space:pre-wrap; overflow-wrap:anywhere; color:var(--at-muted); line-height:1.5; }
        .slide-toggle { flex:none; border:none; background:transparent; padding:0; cursor:pointer; }
        .slide-toggle-track { display:block; width:var(--at-toggle-width); height:var(--at-toggle-height); position:relative; border-radius:999px; background:var(--at-border); transition:background .15s ease; }
        .slide-toggle-thumb { display:block; width:var(--at-toggle-thumb-size); height:var(--at-toggle-thumb-size); position:absolute; top:50%; left:var(--at-toggle-inset); margin:0; border-radius:50%; transform:translateY(-50%); background:#d1d5db; transition:left .15s ease,background .15s ease; }
        .slide-toggle.on .slide-toggle-track { background:var(--at-accent); }
        .slide-toggle.on .slide-toggle-thumb { left:calc(var(--at-toggle-width) - var(--at-toggle-thumb-size) - var(--at-toggle-inset)); transform:translateY(-50%); background:#fff; }
        .slide-toggle.off .slide-toggle-track { background:#3a4456; }
        .slide-toggle.off .slide-toggle-thumb { left:var(--at-toggle-inset); transform:translateY(-50%); background:#7a8599; }
        .context-block summary .lore-bulk-actions { display:flex; gap:4px; flex-wrap:wrap; justify-content:flex-end; flex:none; }
        .context-block summary .lore-bulk-actions button { padding:5px 9px; font-size:11px; white-space:nowrap; }
        .lore-card.active { border-left:4px solid var(--at-success); }
        .lore-card.inactive { border-left:4px solid #667085; opacity:.85; }
        .lore-card { border:1px solid var(--at-border); border-radius:14px; padding:14px 16px; background:var(--at-panel); margin:0 0 14px; width:100%; }
        .lore-card > summary.lore-card-summary { cursor:pointer; list-style:none; }
        .lore-card > summary.lore-card-summary::-webkit-details-marker { display:none; }
        .lore-card > summary.lore-card-summary .source-title { display:flex; align-items:center; gap:6px; flex:1; min-width:0; }
        .lore-card select { width:110px; }
        .lore-folder { margin:0 0 14px; padding:12px; border:1px solid var(--at-border); border-radius:14px; background:color-mix(in srgb, var(--at-panel2) 70%, transparent); }
        .lore-folder > summary { list-style:none; }
        .lore-folder > summary::-webkit-details-marker { display:none; }
        .lore-folder[open] .lore-folder-icon { transform:rotate(90deg); }
        .lore-folder-icon { display:inline-block; color:var(--at-accent); transition:transform .12s ease; }
        .lore-folder > summary select { width:110px; flex:none; }
        .lore-folder-contents { margin:12px 0 0 18px; }
        .lore-folder-contents .lore-card:last-child { margin-bottom:0; }
        .local-lore-badge { display:inline-flex; align-items:center; border:1px solid #3d7b68; border-radius:999px; padding:2px 7px; color:#b9f7d8; background:#17342b; font-size:10px; font-weight:700; white-space:nowrap; }
        .fm-nav { display:flex; align-items:center; gap:4px; flex:none; }
        .fm-arrow { padding:2px 8px; font-size:16px; line-height:1; border-radius:6px; cursor:pointer; }
        .fm-counter { font-size:12px; font-weight:700; color:var(--at-muted); white-space:nowrap; min-width:32px; text-align:center; }
        .empty-context { color:#e8a317; font-style:italic; }
        .reason { color:var(--at-muted); font-size:13px; margin:10px 0; }
        .chat-context-list { display:grid; gap:10px; padding:16px; background:#0d1014; }
        .chat-context-message { overflow:hidden; border:1px solid var(--at-border); border-radius:10px; background:var(--at-panel); }
        .chat-context-message.disabled { opacity:.7; }
        .chat-context-message-heading { min-height:48px; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 12px; background:rgba(255,255,255,.025); }
        .chat-speaker { min-width:0; display:flex; align-items:center; gap:7px; padding:5px 7px; border:0; background:transparent; text-align:left; }
        .chat-speaker:hover:not(:disabled) { border-color:transparent; background:rgba(255,255,255,.04); }
        .chat-speaker.user strong { color:#74b9ff; }
        .chat-speaker.char strong { color:#ff8793; }
        .chat-collapse-icon { width:12px; color:var(--at-muted); }
        .chat-message-controls { display:flex; align-items:center; gap:8px; flex:none; }
        .chat-context-message-body { padding:13px 16px 16px; border-top:1px solid var(--at-border); color:var(--at-muted); }
        .chat-context-message-body[hidden] { display:none; }
        .regex-trace { display:inline; margin:0 1px; padding:1px 3px; border:1px solid rgba(184,117,255,.45); border-radius:4px; background:rgba(137,73,194,.32); color:#ead7ff; font:inherit; line-height:inherit; text-align:inherit; white-space:pre-wrap; }
        .regex-trace:hover:not(:disabled), .regex-trace.showing-original { border-color:#c58cff; background:rgba(137,73,194,.48); }
        .regex-trace[hidden], .regex-trace [hidden] { display:none; }

        .settings-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:12px; margin-bottom:20px; }
        .regex-manager { margin:0 0 16px; padding:14px; border:1px solid var(--at-border); border-radius:12px; background:var(--at-panel); }
        .regex-manager-heading, .regex-script-heading { display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .regex-manager-title, .regex-script-title { min-width:0; flex:1; display:flex; align-items:center; gap:8px; padding:7px 8px; border:0; background:transparent; text-align:left; }
        .regex-manager-title:hover:not(:disabled), .regex-script-title:hover:not(:disabled) { border-color:transparent; background:rgba(255,255,255,.035); }
        .regex-help { margin:12px 2px; color:var(--at-muted); font-size:12px; }
        .regex-script-list { display:grid; gap:10px; }
        .regex-script-card { padding:0; display:grid; grid-template-columns:42px minmax(0,1fr); border:1px solid var(--at-border); border-radius:10px; background:#0d1117; }
        .regex-script-content { padding:10px; }
        .regex-script-body { display:grid; gap:11px; padding:12px 5px 4px; }
        .regex-expression { min-height:78px; font-family:ui-monospace, SFMono-Regular, Consolas, monospace; font-size:12px; }
        .regex-flag { margin:0; color:var(--at-muted); font-size:12px; }
        .regex-error { margin:0; padding:8px 10px; border:1px solid #81434a; border-radius:8px; background:#3a242b; color:#ffd9dc; font-size:12px; overflow-wrap:anywhere; }
        .regex-error[hidden] { display:none; }
        .preset-editor { margin-top:16px; }
        .preset-editor label { margin-top:12px; }
        .preset-editor .prompt { min-height:260px; font-family:ui-monospace, SFMono-Regular, Consolas, monospace; font-size:12px; }
        .wide { width:100%; }
        .danger-zone { margin-top:20px; }
        .action-card { margin-top:12px; padding:12px; border:1px solid #6d5f2e; border-radius:10px; background:#332f1e; font-size:13px; }
        .action-card.success { border-color:#2e7055; background:#17342b; }
        .action-card.muted { border-color:var(--at-border); background:var(--at-panel2); color:var(--at-muted); }
        .action-card ul { margin:8px 0 10px; padding-left:20px; }
        .empty { height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:10px; color:var(--at-muted); text-align:center; padding:32px; }
        .empty strong { color:var(--at-text); }
        @media (max-width:700px) {
            header { padding:12px; }
            header h1 { font-size:18px; }
            nav { padding:6px 8px; }
            .header-actions { flex-wrap:wrap; justify-content:flex-end; }
            .room-toolbar { flex-wrap:wrap; }
            .room-toolbar select { flex-basis:100%; }
            .messages, .panel { padding-left:12px; padding-right:12px; }
            .composer { grid-template-columns:1fr; padding:10px 12px 14px; }
            .composer-actions { min-width:0; flex-direction:row; }
            .composer .send { width:100%; }
            .token-info { grid-column:1; }
            .settings-grid { grid-template-columns:1fr; }
            .section-heading { flex-direction:column; }
            .context-block summary { flex-wrap:wrap; }
            .context-block summary .lore-bulk-actions { justify-content:flex-start; }
            .lore-folder-contents { margin-left:0; }
            .folder-heading { align-items:flex-start; flex-direction:column; }
            .folder-actions { width:100%; justify-content:flex-start; }
            .memo-card-heading { align-items:stretch; flex-direction:column; }
            .memo-heading-actions { width:100%; justify-content:flex-end; }
            .preset-editor > .row.between { align-items:flex-start; flex-direction:column; }
            .chat-context-message-heading { align-items:flex-start; flex-direction:column; }
            .chat-message-controls { width:100%; justify-content:space-between; }
            .regex-manager-heading { align-items:stretch; }
        }
    `;
    document.head.appendChild(style);

    const designStyle = document.createElement("style");
    designStyle.textContent = `
        :root {
            color-scheme:dark;
            --at-bg:#0b0d10;
            --at-panel:#111419;
            --at-panel2:#171b21;
            --at-elevated:#1c2129;
            --at-text:#f4f6f8;
            --at-muted:#8e959f;
            --at-muted-strong:#b5bbc3;
            --at-border:#2c3138;
            --at-border-strong:#3a414b;
            --at-accent:#3182f6;
            --at-accent-soft:rgba(49,130,246,.12);
            --at-danger:#ef6b73;
            --at-success:#65c879;
            --at-warning:#f0a04b;
            --at-radius-lg:16px;
            --at-radius-md:12px;
            --at-shadow:0 24px 70px rgba(0,0,0,.46);
            --at-toggle-width:45px;
            --at-toggle-height:25px;
            --at-toggle-thumb-size:21px;
            --at-toggle-inset:2px;
        }
        html, body { background:transparent; color:var(--at-text); }
        body { overflow:hidden; }
        * { scrollbar-width:thin; scrollbar-color:#555c66 transparent; }
        *::-webkit-scrollbar { width:10px; height:10px; }
        *::-webkit-scrollbar-track { background:transparent; }
        *::-webkit-scrollbar-thumb { border:3px solid transparent; border-radius:999px; background:#555c66; background-clip:padding-box; }
        *::-webkit-scrollbar-thumb:hover { background:#707783; background-clip:padding-box; }
        button, input, textarea, select { outline:none; }
        button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible, summary:focus-visible { box-shadow:0 0 0 3px rgba(49,130,246,.28); border-color:var(--at-accent) !important; }
        button { border:1px solid var(--at-border-strong); border-radius:10px; background:linear-gradient(180deg,#1b1f25,#15191e); color:var(--at-text); padding:10px 14px; transition:border-color .15s ease, background .15s ease, color .15s ease, transform .15s ease; }
        button:hover:not(:disabled) { border-color:#59616d; background:#20252c; }
        button:active:not(:disabled) { transform:translateY(1px); }
        button.primary { border-color:var(--at-accent); background:linear-gradient(180deg,#3b8df8,#2876e6); color:white; }
        button.primary:hover:not(:disabled) { border-color:#67a6ff; background:#428ff5; }
        button.danger { border-color:#66383d; background:#251719; color:#f5a5ab; }
        button.danger:hover:not(:disabled) { border-color:#a25259; background:#351d21; }
        input, textarea, select { border-color:var(--at-border-strong); border-radius:10px; background:#0b1017; color:var(--at-text); }
        input:hover, textarea:hover, select:hover { border-color:#4b535e; }
        select { color-scheme:dark; }
        .ui-icon { width:20px; height:20px; display:block; flex:none; }
        .app-shell { position:fixed; inset:0; display:flex; flex-direction:column; overflow:hidden; border:1px solid rgba(255,255,255,.08); border-radius:14px; background:radial-gradient(circle at 30% -30%,rgba(49,130,246,.08),transparent 42%),rgba(10,12,15,.97); box-shadow:var(--at-shadow); }
        .app-shell.minimized { display:flex; background:rgba(12,14,17,.98); }
        .app-header { min-height:74px; display:flex; align-items:center; justify-content:space-between; flex:none; gap:18px; padding:10px 18px; border-bottom:1px solid var(--at-border); background:linear-gradient(180deg,rgba(255,255,255,.018),transparent); }
        .header-brand { min-width:0; display:flex; align-items:center; gap:13px; }
        .brand-mark { width:42px; height:42px; display:grid; place-items:center; flex:none; border:1px solid rgba(49,130,246,.85); border-radius:10px; color:#5aa0ff; background:#0a1019; box-shadow:inset 0 0 0 5px rgba(49,130,246,.035),0 6px 18px rgba(0,0,0,.2); }
        .brand-mark .ui-icon { width:22px; height:22px; stroke-width:1.55; }
        .header-copy { min-width:0; }
        .header-title-row { gap:11px; flex-wrap:wrap; }
        .header-title-row h1, .header-title-row strong { margin:0; color:#f7f8fa; font-size:20px; font-weight:760; line-height:1.15; letter-spacing:-.025em; }
        .version { color:#8c929c; font-size:11px; font-weight:650; vertical-align:baseline; }
        .active-memo-badge { border-color:rgba(49,130,246,.65); padding:3px 8px; color:#6aaaff; background:rgba(49,130,246,.08); font-size:10px; }
        .app-header p { max-width:540px; margin:5px 0 0; overflow:hidden; color:#858c96; font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
        .header-actions { flex:none; gap:10px; }
        .header-button { min-height:40px; display:inline-flex; align-items:center; justify-content:center; gap:8px; padding:0 13px; background:rgba(20,23,28,.86); font-size:13px; font-weight:650; white-space:nowrap; }
        .header-button .ui-icon { width:17px; height:17px; }
        .header-button.close { color:#e8ebef; }
        .header-button.icon-only { width:40px; min-height:40px; padding:0; }
        .app-shell.minimized .app-header { width:100%; height:100%; min-height:0; padding:8px 14px; border-bottom:0; align-items:center; }
        .app-nav { min-height:46px; display:flex; align-items:stretch; flex:none; gap:20px; padding:0 28px; border-bottom:1px solid var(--at-border); background:rgba(12,14,17,.82); overflow-x:auto; }
        .app-nav button { position:relative; min-width:88px; padding:0 7px; border:0; border-radius:0; background:transparent; color:#969ca5; font-size:15px; font-weight:650; }
        .app-nav button:hover:not(:disabled) { border:0; background:transparent; color:#dce0e5; }
        .app-nav button.selected { border:0; background:transparent; color:#f5f7f9; }
        .app-nav button.selected::after { content:""; position:absolute; right:2px; bottom:0; left:2px; height:3px; border-radius:3px 3px 0 0; background:var(--at-accent); box-shadow:0 0 14px rgba(49,130,246,.45); }
        .status-wrap { flex:none; padding:8px 38px 0 28px; }
        .status { min-height:38px; display:flex; align-items:center; gap:8px; margin:0; padding:7px 12px; border:1px solid #29436b; border-radius:9px; background:linear-gradient(90deg,rgba(24,57,97,.48),rgba(14,28,47,.75)); color:#9dccff; font-size:12px; line-height:1.35; }
        .status .ui-icon { width:16px; height:16px; }
        .status.success { border-color:#2f5639; background:linear-gradient(90deg,rgba(25,70,39,.45),rgba(15,40,23,.72)); color:#9ce1a9; }
        .status.error { border-color:#74373d; background:linear-gradient(90deg,rgba(91,34,40,.48),rgba(48,20,24,.75)); color:#ffb0b6; }
        main { min-height:0; flex:1 1 auto; overflow:hidden; }
        .panel { height:100%; margin-right:10px; padding:22px 28px 48px; }
        .context-panel { max-width:none; padding-top:8px; }
        .context-note { min-height:38px; display:flex; align-items:center; margin:0 0 12px; padding:7px 12px; border:1px solid #29466d; border-radius:9px; background:linear-gradient(90deg,rgba(25,57,96,.42),rgba(13,28,47,.62)); color:#a7cdf7; font-size:12px; line-height:1.35; }
        .stats { gap:9px; margin:0 0 22px; }
        .stats span { padding:9px 14px; border-color:var(--at-border); background:rgba(18,21,25,.78); color:#a7adb5; font-size:12px; font-weight:600; }
        .source-title { gap:9px; }
        .token-badge, .cbs-warning, .feature-warning, .local-lore-badge { padding:3px 9px; background:#15191e; font-size:10px; }
        .token-badge { border-color:#363c45; color:#888f99; }
        .cbs-warning { border-color:#744317; background:#2b1a0e; color:#f0a04b; }
        .feature-warning { border-color:#743a57; background:#2a1620; color:#ee9fc2; }
        .context-block { margin:0 0 12px; padding:0; overflow:hidden; border-color:var(--at-border); border-radius:12px; background:linear-gradient(180deg,rgba(20,23,28,.9),rgba(16,19,23,.9)); }
        .context-block > summary { min-height:78px; display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:16px; padding:18px 24px; list-style:none; }
        .context-block > summary::-webkit-details-marker { display:none; }
        .context-block > summary .source-title { min-width:0; color:#f0f2f5; font-size:18px; font-weight:700; letter-spacing:-.015em; word-break:keep-all; overflow-wrap:normal; }
        .context-block[open] > summary { border-bottom:1px solid var(--at-border); background:rgba(255,255,255,.012); }
        .context-block > .context-pre { padding:22px 24px 26px; background:#0d1014; color:#aab0b8; }
        .context-block > .lore-list { padding:18px; background:#0d1014; }
        .context-item-actions { min-width:0; display:flex; align-items:center; justify-content:flex-end; flex:none; gap:9px; margin-left:auto; }
        .lore-summary-main { min-width:0; display:flex; flex:1; flex-direction:column; align-items:flex-start; gap:4px; }
        .control-divider { width:1px; height:28px; display:block; flex:none; background:#343a43; }
        .syntax-delivery-choice { display:flex; align-items:center; flex:none; gap:5px; }
        .syntax-delivery-choice button { min-width:67px; padding:7px 9px; border-color:#343b44; border-radius:8px; background:#14181d; color:#949ba5; font-size:10px; font-weight:650; white-space:nowrap; }
        .syntax-delivery-choice button:hover:not(:disabled) { border-color:#555e69; color:#d0d4da; }
        .syntax-delivery-choice button.selected { border-color:var(--at-accent); background:rgba(49,130,246,.1); color:#8cbcff; box-shadow:inset 0 0 0 1px rgba(49,130,246,.22); }
        .unsupported-bulk { min-height:44px; display:flex; align-items:center; justify-content:space-between; gap:14px; margin:0 0 10px; padding:7px 10px 7px 14px; border:1px solid var(--at-border); border-radius:10px; background:#11151a; color:#aab1ba; font-size:11px; }
        .unsupported-bulk strong { flex:1; font-size:11px; font-weight:650; }
        .unsupported-bulk button { min-width:67px; padding:6px 10px; font-size:11px; }
        .unsupported-bulk .control-divider { height:26px; }
        .context-section-divider { height:1px; margin:22px 4px 18px; background:linear-gradient(90deg,transparent,#444b55 12%,#444b55 88%,transparent); }
        .context-other-group .context-block { border-color:#3b4149; background:linear-gradient(180deg,rgba(42,45,50,.92),rgba(31,34,38,.94)); }
        .context-other-group .context-block[open] > summary { background:rgba(255,255,255,.022); }
        .slide-toggle-track { width:var(--at-toggle-width); height:var(--at-toggle-height); position:relative; background:#343940; box-shadow:inset 0 1px 3px rgba(0,0,0,.45); }
        .slide-toggle-thumb { width:var(--at-toggle-thumb-size); height:var(--at-toggle-thumb-size); position:absolute; top:50%; left:var(--at-toggle-inset); margin:0; transform:translateY(-50%); background:#b9bdc2; box-shadow:0 1px 4px rgba(0,0,0,.6); transition:left .15s ease,background .15s ease; }
        .slide-toggle.on .slide-toggle-track { background:var(--at-accent); }
        .slide-toggle.on .slide-toggle-thumb { left:calc(var(--at-toggle-width) - var(--at-toggle-thumb-size) - var(--at-toggle-inset)); transform:translateY(-50%); background:white; }
        .slide-toggle.off .slide-toggle-track { background:#343940; }
        .slide-toggle.off .slide-toggle-thumb { left:var(--at-toggle-inset); transform:translateY(-50%); background:#b9bdc2; }
        .context-block summary .lore-bulk-actions { gap:7px; }
        .context-block summary .lore-bulk-actions button { padding:7px 10px; border-color:#3b424c; background:#14181d; color:#aeb4bc; }
        .lore-card { margin-bottom:10px; padding:13px 15px; border-radius:10px; background:#14181e; }
        .lore-card > summary.lore-card-summary { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:14px; }
        .lore-card.active { border-left:3px solid var(--at-accent); }
        .lore-card.inactive { border-left:3px solid #4a5058; opacity:.72; }
        .lore-card select, .lore-folder > summary select { width:104px; padding:8px; }
        .lore-folder { margin-bottom:11px; border-radius:11px; background:#12161b; }
        .lore-folder-contents { margin-top:13px; }
        .fm-nav { gap:7px; }
        .fm-arrow { min-width:34px; min-height:34px; padding:0; }
        .fm-counter { min-width:42px; color:#9ca3ad; }
        .writer-layout { background:transparent; }
        .room-toolbar { min-height:66px; gap:9px; padding:10px 18px; border-bottom-color:var(--at-border); background:rgba(14,17,21,.82); }
        .room-toolbar select { max-width:none; min-height:42px; }
        .toolbar-toggle { flex-direction:row-reverse; justify-content:flex-end; gap:9px; padding:0 6px; color:#b4bac2; }
        .toolbar-toggle input[type="checkbox"], .toggle input[type="checkbox"] { width:var(--at-toggle-width); height:var(--at-toggle-height); position:relative; flex:none; appearance:none; padding:0; border:0; border-radius:999px; background:#343940; box-shadow:inset 0 1px 3px rgba(0,0,0,.45); cursor:pointer; transition:background .15s ease; }
        .toolbar-toggle input[type="checkbox"]::after, .toggle input[type="checkbox"]::after { content:""; width:var(--at-toggle-thumb-size); height:var(--at-toggle-thumb-size); position:absolute; top:50%; left:var(--at-toggle-inset); border-radius:50%; transform:translateY(-50%); background:#b9bdc2; box-shadow:0 1px 4px rgba(0,0,0,.6); transition:left .15s ease,background .15s ease; }
        .toolbar-toggle input[type="checkbox"]:checked, .toggle input[type="checkbox"]:checked { background:var(--at-accent); }
        .toolbar-toggle input[type="checkbox"]:checked::after, .toggle input[type="checkbox"]:checked::after { left:calc(var(--at-toggle-width) - var(--at-toggle-thumb-size) - var(--at-toggle-inset)); transform:translateY(-50%); background:white; }
        .messages { margin-right:10px; padding:24px max(20px,calc((100vw - 920px)/2)); background:radial-gradient(circle at 50% 0,rgba(49,130,246,.035),transparent 38%); }
        .message { margin-bottom:16px; padding:17px 19px; border-color:var(--at-border); border-radius:14px; background:rgba(18,22,27,.94); box-shadow:0 8px 24px rgba(0,0,0,.12); }
        .message.user { border-color:#29466d; background:linear-gradient(135deg,rgba(23,45,75,.88),rgba(19,31,48,.92)); }
        .message-role { color:#6ca9ff; }
        .message-content { color:#e6e9ed; }
        .message-edit { border-color:transparent; background:transparent; }
        .composer { gap:12px; padding:15px max(20px,calc((100vw - 920px)/2)) 18px; border-top-color:var(--at-border); background:rgba(13,16,20,.96); }
        .composer textarea { min-height:82px; border-color:#586170; background:#09111e; }
        .composer-actions { min-width:118px; }
        .token-info { padding:18px; border-color:var(--at-border); background:#0b121d; }
        .token-bar { height:22px; border-color:#555d68; background:#777e88; }
        .memo-folder, .memo-card, .preset-editor, .danger-zone { border-color:var(--at-border); background:linear-gradient(180deg,rgba(20,23,28,.94),rgba(16,19,23,.94)); }
        .memo-folder { padding:0; border-radius:13px; }
        .memo-folder-content { padding:17px; }
        .memo-folder.enabled { box-shadow:inset 3px 0 0 var(--at-accent); }
        .memo-card.effective { border-left:3px solid var(--at-accent); }
        .memo-card.suppressed { border-left:3px solid #484e57; }
        .collapse-heading { color:#edf0f3; }
        .collapse-icon { color:#68a6ff; }
        .memo-content-editor { border-color:#343b46; background:#0a0f16; }
        .settings-grid { gap:14px; }
        .settings-grid label { padding:17px; border:1px solid var(--at-border); border-radius:12px; background:#12161b; color:#b9bec6; }
        .preset-editor { padding:20px; border-radius:13px; }
        .preset-editor > .row.between { align-items:center; flex-direction:row; flex-wrap:wrap; margin-bottom:14px; }
        .preset-editor > .row.between h3 { margin:0; }
        .preset-editor > .row.between button { min-height:38px; padding:8px 12px; }
        .preset-editor h3, .danger-zone h3 { color:#f0f2f5; }
        .preset-editor .prompt { border-color:#343b46; background:#090e14; }
        .action-card { border-color:#655125; background:#2a2415; }
        .action-card.success { border-color:#2f5639; background:#102117; }
        .empty { color:#89919b; }
        @media (max-width:820px) {
            .app-header { min-height:74px; padding:10px 14px; }
            .brand-mark { width:42px; height:42px; }
            .header-title-row h1, .header-title-row strong { font-size:20px; }
            .header-actions { gap:6px; }
            .header-button { width:40px; min-height:40px; padding:0; }
            .header-button span { display:none; }
            .app-nav { min-height:42px; gap:8px; padding:0 14px; }
            .app-nav button { min-width:78px; }
            .status-wrap { padding:8px 24px 0 14px; }
            .panel { padding:16px 14px 40px; }
            .context-panel { padding-top:8px; }
            .context-block > summary { min-height:68px; grid-template-columns:minmax(0,1fr); align-items:start; padding:15px 16px; }
            .context-block > summary .source-title { font-size:15px; }
            .context-block > .context-pre { padding:17px 16px 21px; }
            .context-item-actions { width:100%; margin-left:0; flex-wrap:wrap; }
            .lore-card > summary.lore-card-summary { grid-template-columns:minmax(0,1fr); align-items:start; }
            .lore-summary-main .source-title { word-break:keep-all; overflow-wrap:normal; }
        }
        @media (max-width:560px) {
            .app-header { gap:10px; }
            .header-brand { gap:11px; }
            .brand-mark { display:none; }
            .header-title-row { gap:7px; }
            .header-title-row h1, .header-title-row strong { font-size:19px; }
            .active-memo-badge { padding:3px 7px; font-size:10px; }
            .app-header p { font-size:11px; }
            .app-nav button { min-width:70px; font-size:13px; }
            .room-toolbar button { padding:8px 10px; font-size:12px; }
            .context-block summary .lore-bulk-actions { width:100%; justify-content:flex-start; }
            .unsupported-bulk { gap:8px; padding-left:10px; }
            .unsupported-bulk strong { min-width:0; }
            .unsupported-bulk button { min-width:60px; padding:6px 7px; }
        }
    `;
    document.head.appendChild(designStyle);
}
