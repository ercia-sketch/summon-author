function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function setStatus(message: string, kind: "info" | "success" | "error" = "info", rerender = true): void {
    statusMessage = message;
    statusKind = kind;
    if (rerender && root) render();
}

function presetOptions(kind: PromptKind): string {
    const selectedId = kind === "base" ? settings.selectedBasePresetId : settings.selectedAdditionalPresetId;
    return allPresets(kind).map((preset) => `<option value="${escapeHtml(preset.id)}" ${preset.id === selectedId ? "selected" : ""}>${escapeHtml(preset.name)}${preset.builtIn ? " · 내장" : ""}</option>`).join("");
}

function renderActionPreview(message: WriterMessage): string {
    if (!message.pendingActions || !message.actionState) return "";
    const summary = message.pendingActions.map((action) => {
        if (action.operation === "create") return `새 메모: ${action.content}`;
        if (action.operation === "update") return `Memo(${action.id}) 수정: ${action.content}`;
        return `Memo(${action.id}) 삭제`;
    }).map((line) => `<li>${escapeHtml(line)}</li>`).join("");
    if (message.actionState === "pending") {
        return `<div class="action-card"><strong>메모 작업 제안</strong><ul>${summary}</ul><div class="row"><button data-action="apply-actions" data-message-id="${escapeHtml(message.id)}" class="primary">메모에 적용</button><button data-action="discard-actions" data-message-id="${escapeHtml(message.id)}">무시</button></div></div>`;
    }
    if (message.actionState === "applied") {
        const undoControl = message.actionUndo
            ? `<button data-action="undo-actions" data-message-id="${escapeHtml(message.id)}">실행 취소</button>`
            : `<span class="meta">이전 버전에서 적용된 작업은 안전한 실행 취소를 지원하지 않습니다.</span>`;
        return `<div class="action-card success"><strong>메모에 적용됨</strong><ul>${summary}</ul>${undoControl}</div>`;
    }
    return `<div class="action-card muted"><strong>${message.actionState === "undone" ? "적용 취소됨" : "제안 무시됨"}</strong><ul>${summary}</ul></div>`;
}

function renderWriterTokenPanel(): string {
    if (!tokenInfoOpen) return "";
    const summary = currentWriterTokenSummary();
    if (!summary) return `<div class="token-info" data-token-panel><strong>토큰 정보를 계산할 수 없습니다.</strong><p>먼저 현재 컨텍스트를 불러와 주세요.</p></div>`;
    const inputPercent = Math.min(100, (summary.inputEstimate / summary.maxContext) * 100);
    const totalPercent = Math.min(100, ((summary.inputEstimate + summary.maxResponse) / summary.maxContext) * 100);
    const warning = summary.exceedsContext
        ? `<div class="token-warning"><strong>최대 컨텍스트를 초과할 것으로 예상됩니다.</strong><span>요청이 실패하거나 일부 대화 및 컨텍스트가 처리되지 않을 수 있습니다. 과거 대화 또는 불필요한 컨텍스트를 정리해 주세요.</span></div>`
        : "";
    return `<div class="token-info" data-token-panel>${warning}<div class="token-bar" aria-label="컨텍스트 사용량"><span class="token-input-bar" style="width:${inputPercent.toFixed(2)}%"></span><span class="token-output-bar" style="left:${inputPercent.toFixed(2)}%;width:${Math.max(0, totalPercent - inputPercent).toFixed(2)}%"></span></div><div class="token-grid"><span class="token-input-label">다음 요청 입력 토큰 추정치</span><strong class="token-input-label">약 ${summary.inputEstimate.toLocaleString()} 토큰</strong><span class="token-output-label">다음 요청 최대 출력 토큰</span><strong class="token-output-label">${summary.maxResponse.toLocaleString()} 토큰</strong><span>최근 작가 답변 토큰 추정치</span><strong>${summary.responseEstimate > 0 ? `약 ${summary.responseEstimate.toLocaleString()} 토큰` : "답변 없음"}</strong><span>최대 컨텍스트 크기</span><strong>${summary.maxContext.toLocaleString()} 토큰</strong></div><p class="token-disclaimer">토큰 수는 플러그인의 근사치이며 실제 모델 계산과 다를 수 있습니다.</p></div>`;
}

function tokenCheckButtonClass(): string {
    return currentWriterTokenSummary()?.exceedsContext ? "danger token-check exceeded" : "token-check";
}

function renderWriterTab(): string {
    const room = getCurrentRoom();
    const messages = room?.writerMessages ?? [];
    const messageHtml = messages.length > 0
        ? messages.map((message) => {
            if (editingMessageId === message.id) {
                const editActions = message.role === "user"
                    ? `<button data-action="save-edited" data-message-id="${escapeHtml(message.id)}" class="primary">단순 수정</button><button data-action="resend-edited" data-message-id="${escapeHtml(message.id)}">이 시점부터 다시 보내기</button>`
                    : `<button data-action="save-edited" data-message-id="${escapeHtml(message.id)}" class="primary">단순 수정</button>`;
                return `<article class="message ${message.role} editing"><div class="message-role">${message.role === "user" ? "사용자" : "작가"} · 수정 중</div><textarea data-input="edit-message-draft" class="edit-message">${escapeHtml(editingMessageDraft)}</textarea><div class="row message-actions">${editActions}<button data-action="cancel-edit">취소</button></div></article>`;
            }
            const controls = `<div class="row message-actions"><button data-action="copy-message" data-message-id="${escapeHtml(message.id)}" class="message-edit">복사</button><button data-action="edit-message" data-message-id="${escapeHtml(message.id)}" class="message-edit" ${isSending ? "disabled" : ""}>수정</button><button data-action="delete-message" data-message-id="${escapeHtml(message.id)}" class="message-edit danger" ${isSending ? "disabled" : ""}>삭제</button></div>`;
            return `<article class="message ${message.role}"><div class="row between"><div class="message-role">${message.role === "user" ? "사용자" : "작가"}</div>${controls}</div><div class="message-content ${settings.markdownEnabled ? "markdown" : "plain"}">${renderWriterMessageText(message.content || (isSending && message.id === activeWriterRequest?.assistantMessageId ? "생각하는 중…" : ""))}</div>${renderActionPreview(message)}</article>`;
        }).join("")
        : `<div class="empty"><strong>집필 회의를 시작해 보세요.</strong><span>작가는 활성화된 작가 컨텍스트와 활성 메모를 참고합니다.</span></div>`;
    const roomOptions = (currentWorkspace?.rooms ?? []).map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === room?.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
    return `<section class="writer-layout"><div class="room-toolbar"><select data-change="room-select" aria-label="회의실 선택">${roomOptions}</select><label class="toolbar-toggle"><input type="checkbox" data-change="markdown-enabled" ${settings.markdownEnabled ? "checked" : ""}><span>마크다운 표시</span></label><button data-action="new-room">새 회의실</button><button data-action="rename-room" ${room ? "" : "disabled"}>이름 변경</button><button data-action="delete-room" class="danger" ${(currentWorkspace?.rooms.length ?? 0) <= 1 ? "disabled" : ""}>삭제</button></div><div id="writer-messages" class="messages">${messageHtml}</div><div class="composer"><textarea id="writer-input" placeholder="다음 장면, 인물의 동기, 복선 등을 작가와 논의하세요." ${isSending ? "disabled" : ""}>${escapeHtml(writerDraft)}</textarea><div class="composer-actions"><button data-action="toggle-token-info" class="${tokenCheckButtonClass()}" ${isRefreshingContext ? "disabled" : ""}>토큰 확인</button><button data-action="send-writer" class="primary send" ${isSending ? "disabled" : ""}>${isSending ? "응답 중" : "전송"}</button></div>${renderWriterTokenPanel()}</div></section>`;
}

function isMemoFolderCollapsed(folderId: string): boolean {
    return settings.collapsedMemoFolderIds.includes(folderId);
}

function isMemoCollapsed(memoUid: string): boolean {
    return settings.collapsedMemoIds.includes(memoUid);
}

function toggleCollapsedId(ids: string[], id: string): string[] {
    return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}

function forgetMemoUiState(folderIds: string[] = [], memoIds: string[] = []): void {
    if (folderIds.length > 0) settings.collapsedMemoFolderIds = settings.collapsedMemoFolderIds.filter((id) => !folderIds.includes(id));
    if (memoIds.length > 0) settings.collapsedMemoIds = settings.collapsedMemoIds.filter((id) => !memoIds.includes(id));
}

function reorderGripIcon(): string {
    return `<svg class="reorder-grip" viewBox="0 0 16 24" aria-hidden="true"><circle cx="5" cy="5" r="1.5"/><circle cx="11" cy="5" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="12" r="1.5"/><circle cx="5" cy="19" r="1.5"/><circle cx="11" cy="19" r="1.5"/></svg>`;
}

function renderMemoTitleLine(memo: Memo, number: number | null): string {
    const displayName = memo.displayName.trim();
    const sequence = number ? `Memo(${number})` : "비활성 메모";
    if (displayName) {
        return `<strong class="memo-display-name">${escapeHtml(displayName)}</strong><span class="memo-sequence">${sequence}</span>`;
    }
    if (number) return `<span class="memo-sequence memo-sequence-only">${sequence}</span>`;
    return `<strong class="memo-display-name memo-display-name-empty">이름 없음</strong><span class="memo-sequence">${sequence}</span>`;
}

function renderMemosTab(): string {
    const workspace = currentWorkspace;
    const folderOptions = (workspace?.memoFolders ?? []).map((folder) => `<option value="${escapeHtml(folder.id)}">${escapeHtml(folder.name)}</option>`).join("");
    const folders = (workspace?.memoFolders ?? []).map((folder) => {
        const memos = workspace?.memos.filter((memo) => memo.folderId === folder.id) ?? [];
        const folderCollapsed = isMemoFolderCollapsed(folder.id);
        const memoCards = !folderCollapsed && memos.length > 0 ? memos.map((memo) => {
            const effective = isMemoEffectivelyEnabled(memo, workspace);
            const number = visibleMemoNumber(memo, workspace);
            const titleLine = renderMemoTitleLine(memo, number);
            const uid = escapeHtml(memo.uid);
            const collapsed = isMemoCollapsed(memo.uid);
            return `<article class="memo-card ${effective ? "effective" : "suppressed"} ${collapsed ? "collapsed" : "expanded"}" data-memo-card="${uid}" data-reorder-card="memo" data-reorder-id="${uid}" data-reorder-scope="${escapeHtml(folder.id)}"><div class="reorder-handle-column" draggable="true" data-reorder-kind="memo" data-reorder-id="${uid}" data-reorder-scope="${escapeHtml(folder.id)}" title="같은 폴더 안에서 메모 순서 변경" aria-label="같은 폴더 안에서 메모 순서 변경">${reorderGripIcon()}</div><div class="reorder-card-content memo-card-content"><div class="memo-card-heading"><button data-action="toggle-memo" data-memo-uid="${uid}" class="collapse-heading memo-collapse-heading" aria-expanded="${collapsed ? "false" : "true"}"><span class="collapse-icon" aria-hidden="true">${collapsed ? "▸" : "▾"}</span><span><span class="memo-title-line">${titleLine}</span><span class="meta">${effective ? "본편 요청에 포함" : "현재 미포함"}</span></span></button><div class="row memo-heading-actions"><input type="checkbox" class="memo-toggle-input" data-change="memo-enabled" data-memo-uid="${uid}" ${memo.enabled ? "checked" : ""}><button data-action="rename-memo" data-memo-uid="${uid}">이름 변경</button><button data-action="delete-memo" data-memo-uid="${uid}" class="danger">삭제</button></div></div>${collapsed ? "" : `<div class="memo-expanded-body"><textarea data-input="memo-content" data-memo-uid="${uid}" class="memo-content-editor" placeholder="본편 모델에게 전달할 집필 지침">${escapeHtml(memo.content)}</textarea><div class="row memo-actions"><select data-change="memo-folder" data-memo-uid="${uid}" aria-label="메모 폴더">${folderOptions.replace(`value="${escapeHtml(folder.id)}"`, `value="${escapeHtml(folder.id)}" selected`)}</select></div></div>`}</div></article>`;
        }).join("") : !folderCollapsed ? `<div class="folder-empty">이 폴더에는 메모가 없습니다.</div>` : "";
        const folderId = escapeHtml(folder.id);
        return `<section class="memo-folder ${folder.enabled ? "enabled" : "disabled"} ${folderCollapsed ? "collapsed" : "expanded"}" data-memo-folder="${folderId}" data-reorder-card="memo-folder" data-reorder-id="${folderId}" data-reorder-scope="workspace"><div class="reorder-handle-column folder-reorder-handle" draggable="true" data-reorder-kind="memo-folder" data-reorder-id="${folderId}" data-reorder-scope="workspace" title="메모 폴더 순서 변경" aria-label="메모 폴더 순서 변경">${reorderGripIcon()}</div><div class="reorder-card-content memo-folder-content"><div class="folder-heading"><button data-action="toggle-memo-folder" data-folder-id="${folderId}" class="collapse-heading folder-collapse-heading" aria-expanded="${folderCollapsed ? "false" : "true"}"><span class="collapse-icon" aria-hidden="true">${folderCollapsed ? "▸" : "▾"}</span><span><strong>${escapeHtml(folder.name)}</strong><span class="meta">${folder.enabled ? "폴더 ON" : "폴더 OFF"} · 메모 ${memos.length}개</span></span></button><div class="row folder-actions"><input type="checkbox" class="memo-toggle-input" data-change="memo-folder-enabled" data-folder-id="${folderId}" ${folder.enabled ? "checked" : ""}><button data-action="new-memo" data-folder-id="${folderId}">메모 추가</button><button data-action="rename-memo-folder" data-folder-id="${folderId}">이름 변경</button><button data-action="delete-memo-folder" data-folder-id="${folderId}" class="danger" ${(workspace?.memoFolders.length ?? 0) <= 1 ? "disabled" : ""}>삭제</button></div></div>${folderCollapsed ? "" : `<div class="memo-list" data-reorder-list="memo" data-reorder-scope="${folderId}">${memoCards}</div>`}</div></section>`;
    }).join("");
    return `<section class="panel"><div class="section-heading"><button data-action="new-memo-folder" class="primary">새 폴더</button></div><div class="memo-folder-list" data-reorder-list="memo-folder" data-reorder-scope="workspace">${folders || `<div class="empty"><strong>메모 폴더가 없습니다.</strong></div>`}</div></section>`;
}

function loreSourceLabel(source: LoreView["source"]): string {
    return source === "character" ? "캐릭터" : source === "chat" ? "현재 채팅" : "활성 모듈";
}

function renderCbsWarningBadge(warnings: string[]): string {
    if (warnings.length === 0) return "";
    const detail = `미지원 CBS 문법: ${warnings.join(", ")}`;
    return `<span class="cbs-warning" title="${escapeHtml(detail)}" aria-label="${escapeHtml(detail)}">미지원 문법 ${warnings.length}개</span>`;
}

function renderUnsupportedFeatureBadge(features: string[]): string {
    if (features.length === 0) return "";
    const detail = `미지원 기능: ${features.join(", ")}`;
    return `<span class="feature-warning" title="${escapeHtml(detail)}" aria-label="${escapeHtml(detail)}">미지원 기능 ${features.length}개</span>`;
}

function renderTokenBadge(tokens: number, rawTokens?: number): string {
    const total = rawTokens ?? tokens;
    return `<span class="token-badge">약 ${tokens.toLocaleString()}/${total.toLocaleString()} 토큰</span>`;
}

function renderContextDisplay(displayHtml: string, fallback: string, warnings: string[]): string {
    if (!displayHtml || displayHtml.trim() === escapeHtml("").trim()) return `<span class="empty-context">${escapeHtml(fallback)}</span>`;
    return displayHtml;
}

function renderUnsupportedSyntaxToggle(key: string): string {
    const omit = omitsUnsupportedSyntax(key);
    const escapedKey = escapeHtml(key);
    return `<div class="syntax-delivery-choice" role="group" aria-label="미지원 문법 작가 전달 여부"><button data-action="set-unsupported-syntax" data-syntax-key="${escapedKey}" data-omit="true" class="${omit ? "selected" : ""}" aria-pressed="${omit}">전달 안 함</button><button data-action="set-unsupported-syntax" data-syntax-key="${escapedKey}" data-omit="false" class="${!omit ? "selected" : ""}" aria-pressed="${!omit}">전달함</button></div>`;
}

function renderLoreCard(entry: LoreView): string {
    const localBadge = entry.locallyActivated ? `<span class="local-lore-badge">채팅 로컬 활성화</span>` : "";
    return `<details class="lore-card ${entry.active ? "active" : "inactive"}" data-lore-card="${escapeHtml(entry.key)}"><summary class="lore-card-summary"><div class="lore-summary-main"><div class="source-title"><strong>${escapeHtml(entry.name)}</strong>${localBadge}${renderTokenBadge(entry.active ? entry.estimatedTokens : 0, entry.rawEstimatedTokens)}${renderCbsWarningBadge(entry.unsupportedCbs)}${renderUnsupportedFeatureBadge(entry.unsupportedFeatures)}</div><div class="meta" data-lore-status>${loreSourceLabel(entry.source)} · ${entry.active ? "작가에게 포함" : "작가에게 미포함"}</div></div><div class="context-item-actions"><select data-change="lore-mode" data-lore-key="${escapeHtml(entry.key)}"><option value="auto" ${entry.mode === "auto" ? "selected" : ""}>AUTO</option><option value="on" ${entry.mode === "on" ? "selected" : ""}>ON</option><option value="off" ${entry.mode === "off" ? "selected" : ""}>OFF</option></select><span class="control-divider" aria-hidden="true"></span>${renderUnsupportedSyntaxToggle(loreUnsupportedSyntaxKey(entry.key))}</div></summary><p class="reason" data-lore-reason>${escapeHtml(entry.reason)}</p><div class="context-pre lore-content">${renderContextDisplay(entry.displayHtml, "내용 없음", entry.unsupportedCbs)}</div></details>`;
}

function loreFolderMode(entries: LoreView[]): LoreMode | "mixed" {
    const modes = new Set(entries.map((entry) => entry.mode));
    return modes.size === 1 ? entries[0].mode : "mixed";
}

function renderLoreCardsForScope(entries: LoreView[], folders: LoreFolderView[]): string {
    if (entries.length === 0 && folders.length === 0) return `<div class="empty"><span>해당하는 로어북 항목이 없습니다.</span></div>`;
    const knownFolderKeys = new Set(folders.map((folder) => folder.key));
    const ungrouped = entries.filter((entry) => !entry.folderKey || !knownFolderKeys.has(entry.folderKey));
    const groups = folders.map((folder) => {
        const members = entries.filter((entry) => entry.folderKey === folder.key);
        const mode = members.length > 0 ? loreFolderMode(members) : "mixed";
        const activeCount = members.filter((entry) => entry.active).length;
        const empty = members.length === 0;
        return `<details class="lore-folder"><summary><span class="source-title"><span class="lore-folder-icon">▸</span><strong>${escapeHtml(folder.name)}</strong><span class="meta" data-lore-folder-count="${escapeHtml(`${folder.source}:${folder.key}`)}">${empty ? "항목 없음" : `${activeCount}/${members.length} 포함`}</span></span><select data-change="lore-folder-mode" data-folder-key="${escapeHtml(folder.key)}" data-scope="${folder.source}" ${empty ? "disabled" : ""}><option value="" ${mode === "mixed" ? "selected" : ""} disabled>혼합</option><option value="auto" ${mode === "auto" ? "selected" : ""}>AUTO</option><option value="on" ${mode === "on" ? "selected" : ""}>ON</option><option value="off" ${mode === "off" ? "selected" : ""}>OFF</option></select></summary><div class="lore-folder-contents">${empty ? `<div class="folder-empty">이 폴더에는 로어북 항목이 없습니다.</div>` : members.map(renderLoreCard).join("")}</div></details>`;
    }).join("");
    return `${ungrouped.map(renderLoreCard).join("")}${groups}`;
}

function renderContextToggle(key: string): string {
    const on = settings.contextToggles[key] !== false;
    return `<button data-action="toggle-context" data-context-key="${key}" class="slide-toggle ${on ? "on" : "off"}" title="${on ? "작가에게 제공 중 · 끄기" : "작가에게 미제공 · 켜기"}" aria-pressed="${on}"><span class="slide-toggle-track"><span class="slide-toggle-thumb"></span></span></button>`;
}

function renderLoreSection(title: string, scope: "character" | "chat" | "module", entries: LoreView[]): string {
    const activeCount = entries.filter((entry) => entry.active).length;
    const bulkDisabled = entries.length === 0 ? "disabled" : "";
    const folders = currentContext?.loreFolders.filter((folder) => folder.source === scope) ?? [];
    return `<details class="context-block" data-detail-key="lore-section-${scope}"><summary><span class="source-title">${escapeHtml(title)} <span data-lore-section-count="${scope}">${activeCount}/${entries.length}</span></span><div class="lore-bulk-actions"><button data-action="set-all-lore" data-mode="on" data-scope="${scope}" ${bulkDisabled}>전체 ON</button><button data-action="set-all-lore" data-mode="auto" data-scope="${scope}" ${bulkDisabled}>전체 AUTO</button><button data-action="set-all-lore" data-mode="off" data-scope="${scope}" ${bulkDisabled}>전체 OFF</button></div></summary><div class="lore-list">${renderLoreCardsForScope(entries, folders)}</div></details>`;
}

function renderContextSourceBlock(
    key: typeof CONTEXT_TOGGLE_KEYS[number],
    title: string,
    tokens: number,
    rawTokens: number,
    warnings: string[],
    displayHtml: string,
    fallback: string,
    extraControls = "",
): string {
    const deliveredTokens = settings.contextToggles[key] === false ? 0 : tokens;
    return `<details class="context-block" data-detail-key="context-${key}"><summary><span class="source-title">${escapeHtml(title)} ${renderTokenBadge(deliveredTokens, rawTokens)}${renderCbsWarningBadge(warnings)}</span><div class="context-item-actions">${extraControls}${renderContextToggle(key)}<span class="control-divider" aria-hidden="true"></span>${renderUnsupportedSyntaxToggle(key)}</div></summary><div class="context-pre">${renderContextDisplay(displayHtml, fallback, warnings)}</div></details>`;
}

function renderChatHistoryBlock(context: WriterContext): string {
    const overallEnabled = settings.contextToggles.chatHistory !== false;
    const sessionKey = currentIdentity ? chatMessageSettingsKey(currentIdentity) : "";
    const messages = context.chatHistoryMessages.map((message) => {
        const collapseKey = `${sessionKey}:${message.key}`;
        const collapsed = collapsedChatMessageKeys.has(collapseKey);
        const delivered = overallEnabled && message.enabled ? message.tokenEstimate : 0;
        return `<article class="chat-context-message ${message.enabled ? "enabled" : "disabled"}" data-chat-message-key="${escapeHtml(message.key)}"><div class="chat-context-message-heading"><button data-action="toggle-chat-message" data-message-key="${escapeHtml(message.key)}" class="chat-speaker ${message.role}" aria-expanded="${!collapsed}"><span class="chat-collapse-icon" aria-hidden="true">${collapsed ? "▸" : "▾"}</span><strong>${escapeHtml(message.speaker)}:</strong></button><div class="chat-message-controls">${renderTokenBadge(delivered, message.rawTokenEstimate)}<button data-action="toggle-chat-message-enabled" data-message-key="${escapeHtml(message.key)}" class="slide-toggle ${message.enabled ? "on" : "off"}" title="${message.enabled ? "작가에게 제공 중 · 끄기" : "작가에게 미제공 · 켜기"}" aria-pressed="${message.enabled}"><span class="slide-toggle-track"><span class="slide-toggle-thumb"></span></span></button></div></div><div class="context-pre chat-context-message-body" ${collapsed ? "hidden" : ""}>${renderContextDisplay(message.displayHtml, "내용 없음", message.warnings)}</div></article>`;
    }).join("");
    const deliveredTokens = overallEnabled ? context.tokenEstimates.chatHistory : 0;
    return `<details class="context-block chat-history-block" data-detail-key="context-chatHistory"><summary><span class="source-title">이전 대화 ${renderTokenBadge(deliveredTokens, context.rawTokenEstimates.chatHistory)}${renderCbsWarningBadge(context.cbsWarnings.chatHistory)}</span><div class="context-item-actions">${renderContextToggle("chatHistory")}<span class="control-divider" aria-hidden="true"></span>${renderUnsupportedSyntaxToggle("chatHistory")}</div></summary><div class="chat-context-list">${messages || `<div class="empty-context">이전 대화 없음</div>`}</div></details>`;
}

function renderContextTab(): string {
    if (isRefreshingContext) return `<div class="empty"><strong>컨텍스트를 읽는 중입니다…</strong></div>`;
    if (!currentContext) return `<div class="empty"><strong>아직 컨텍스트를 불러오지 않았습니다.</strong><button data-action="refresh-session" class="primary">불러오기</button></div>`;
    const context = currentContext;
    const activeLoreCount = context.loreEntries.filter((entry) => entry.active).length;
    const characterEntries = context.loreEntries.filter((entry) => entry.source === "character");
    const chatEntries = context.loreEntries.filter((entry) => entry.source === "chat");
    const moduleEntries = context.loreEntries.filter((entry) => entry.source === "module");
    const firstMessageControls = `<div class="fm-nav"><button data-action="prev-first-message" class="fm-arrow" aria-label="이전 퍼스트 메세지">‹</button><span class="fm-counter">${firstMessageIndex + 1}/${context.firstMessages.length}</span><button data-action="next-first-message" class="fm-arrow" aria-label="다음 퍼스트 메세지">›</button></div>`;
    const bulkControls = `<div class="unsupported-bulk"><strong>미지원 문법 작가에게 전달 여부</strong><span class="control-divider" aria-hidden="true"></span><div class="row"><button data-action="set-all-unsupported-syntax" data-omit="true">전달 안 함</button><button data-action="set-all-unsupported-syntax" data-omit="false">전달함</button></div></div>`;
    const otherBlock = `<div class="context-other-group"><div class="context-section-divider" aria-hidden="true"></div>${renderContextSourceBlock("other", "기타", context.tokenEstimates.other, context.rawTokenEstimates.other, context.cbsWarnings.other, context.display.other, "기타 캐릭터 카드 정보 없음")}</div>`;
    const deliveredChatCount = settings.contextToggles.chatHistory === false ? 0 : context.includedChatMessageCount;
    return `<section class="panel context-panel"><p class="context-note">이 화면의 설정은 플러그인의 작가에게 전달되는 내용입니다. 본 채팅에는 영향을 주지 않습니다.</p><div class="stats"><span>장기 기억 ${context.memories.length}개</span><span>본편 대화 ${deliveredChatCount}/${context.chatMessageCount}개</span><span>로어 재귀 검색 ${context.recursiveLoreScanning ? "ON" : "OFF"}</span><span data-lore-count>작가용 로어 ${activeLoreCount}/${context.loreEntries.length}개</span><span data-reference-tokens>${referenceTokenSummary(context)}</span></div>${bulkControls}${renderContextSourceBlock("botCard", "캐릭터 디스크립션", context.tokenEstimates.botCard, context.rawTokenEstimates.botCard, context.cbsWarnings.botCard, context.display.botCard, "캐릭터 이름 및 디스크립션 없음")}${renderContextSourceBlock("persona", "페르소나", context.tokenEstimates.persona, context.rawTokenEstimates.persona, context.cbsWarnings.persona, context.display.persona, "페르소나 없음")}${renderContextSourceBlock("firstMessage", "퍼스트 메세지", context.tokenEstimates.firstMessage, context.rawTokenEstimates.firstMessage, context.cbsWarnings.firstMessage, context.display.firstMessages[firstMessageIndex] ?? context.display.firstMessages[0] ?? "", "퍼스트 메세지 없음", firstMessageControls)}${renderChatHistoryBlock(context)}${renderContextSourceBlock("authorNote", "작가의 노트", context.tokenEstimates.authorNote, context.rawTokenEstimates.authorNote, context.cbsWarnings.authorNote, context.display.authorNote, "작가의 노트 없음")}${renderContextSourceBlock("replaceGlobalNote", "글로벌 노트 덮어쓰기", context.tokenEstimates.replaceGlobalNote, context.rawTokenEstimates.replaceGlobalNote, context.cbsWarnings.replaceGlobalNote, context.display.replaceGlobalNote, "글로벌 노트 덮어쓰기 없음")}${renderLoreSection("캐릭터 로어북", "character", characterEntries)}${renderLoreSection("챗 로어북", "chat", chatEntries)}${renderLoreSection("모듈 로어북", "module", moduleEntries)}${renderContextSourceBlock("memories", "하이파/수파 메모리 장기 기억", context.tokenEstimates.memories, context.rawTokenEstimates.memories, context.cbsWarnings.memories, context.display.memories, "하이파/수파 메모리 장기 기억 없음")}${otherBlock}</section>`;
}

function renderPresetEditor(kind: PromptKind): string {
    const preset = selectedPreset(kind);
    const label = kind === "base" ? "기본 시스템 프롬프트" : "추가 시스템 프롬프트";
    return `<div class="preset-editor"><div class="row between"><h3>${label}</h3><div class="row"><button data-action="new-preset" data-kind="${kind}">새 프리셋</button><button data-action="clone-preset" data-kind="${kind}">복제</button>${preset.builtIn ? "" : `<button data-action="delete-preset" data-kind="${kind}" class="danger">삭제</button>`}</div></div><select data-change="preset-select" data-kind="${kind}" class="wide">${presetOptions(kind)}</select><label>프리셋 이름<input data-input="preset-name" data-kind="${kind}" value="${escapeHtml(preset.name)}" ${preset.builtIn ? "readonly" : ""}></label><label>프롬프트<textarea data-input="preset-content" data-kind="${kind}" class="prompt" ${preset.builtIn ? "readonly" : ""}>${escapeHtml(preset.content)}</textarea></label>${preset.builtIn ? `<p class="meta">내장 프리셋은 수정하거나 삭제할 수 없습니다. 복제한 뒤 편집할 수 있습니다.</p>` : `<button data-action="save-preset" data-kind="${kind}" class="primary">프리셋 저장</button>`}</div>`;
}

function nextRegexScriptName(): string {
    let number = 1;
    const names = new Set(settings.contextRegexScripts.map((script) => script.name.trim()));
    while (names.has(`새 정규식 ${number}`)) number++;
    return `새 정규식 ${number}`;
}

function renderRegexManager(): string {
    const cards = settings.contextRegexScripts.map((script) => {
        const expanded = expandedRegexScriptIds.has(script.id);
        const error = contextRegexErrors.get(script.id) ?? "";
        const id = escapeHtml(script.id);
        return `<article class="regex-script-card ${script.enabled ? "enabled" : "disabled"} ${expanded ? "expanded" : "collapsed"}" data-regex-id="${id}" data-reorder-card="regex" data-reorder-id="${id}" data-reorder-scope="settings"><div class="reorder-handle-column" draggable="true" data-reorder-kind="regex" data-reorder-id="${id}" data-reorder-scope="settings" title="드래그하여 적용 순서 변경" aria-label="드래그하여 적용 순서 변경">${reorderGripIcon()}</div><div class="reorder-card-content regex-script-content"><div class="regex-script-heading"><button data-action="toggle-regex-script" data-regex-id="${id}" class="regex-script-title" aria-expanded="${expanded}"><span aria-hidden="true">${expanded ? "▾" : "▸"}</span><strong>${escapeHtml(script.name.trim() || "이름 없는 정규식")}</strong></button><div class="row regex-script-actions"><input type="checkbox" class="regex-toggle-input" data-change="regex-enabled" data-regex-id="${id}" ${script.enabled ? "checked" : ""}><button data-action="delete-regex-script" data-regex-id="${id}" class="danger">삭제</button></div></div>${expanded ? `<div class="regex-script-body"><label>이름<input data-input="regex-name" data-regex-id="${id}" value="${escapeHtml(script.name)}"></label><label>IN:<textarea data-input="regex-input" data-regex-id="${id}" class="regex-expression" spellcheck="false">${escapeHtml(script.input)}</textarea></label><label>OUT:<textarea data-input="regex-output" data-regex-id="${id}" class="regex-expression" spellcheck="false" placeholder="비워두면 일치한 텍스트를 컨텍스트에서 제거합니다.">${escapeHtml(script.output)}</textarea></label><p class="regex-flag">적용 플래그: <code>g</code></p><p class="regex-error" data-regex-error="${id}" ${error ? "" : "hidden"}>${escapeHtml(error)}</p></div>` : ""}</div></article>`;
    }).join("");
    return `<section class="regex-manager ${regexManagerOpen ? "open" : "closed"}"><div class="regex-manager-heading"><button data-action="toggle-regex-manager" class="regex-manager-title" aria-expanded="${regexManagerOpen}"><span aria-hidden="true">${regexManagerOpen ? "▾" : "▸"}</span><strong>정규식 스크립트</strong><span class="meta">${settings.contextRegexScripts.length}개</span></button><button data-action="new-regex-script">새 정규식</button></div>${regexManagerOpen ? `<p class="regex-help">위에서 아래 순서로 컨텍스트 전체에 적용됩니다. 각 규칙은 항상 <code>g</code> 플래그를 사용합니다.</p><div class="regex-script-list" data-reorder-list="regex" data-reorder-scope="settings">${cards || `<div class="folder-empty">등록된 정규식이 없습니다.</div>`}</div>` : ""}</section>`;
}

function renderSettingsTab(): string {
    validateContextRegexScripts();
    return `<section class="panel"><div class="settings-grid"><label>작가 모델<select data-change="model-mode"><option value="submodel" ${settings.writerModelMode === "submodel" ? "selected" : ""}>Sub model</option><option value="model" ${settings.writerModelMode === "model" ? "selected" : ""}>Main model</option></select></label><label>집필 회의 마크다운 정리<select data-change="markdown-cleanup"><option value="off" ${!settings.writerMarkdownCleanup ? "selected" : ""}>사용 안 함</option><option value="on" ${settings.writerMarkdownCleanup ? "selected" : ""}>사용</option></select></label></div>${renderRegexManager()}${renderPresetEditor("base")}${renderPresetEditor("additional")}<div class="danger-zone"><h3>현재 회의실</h3><button data-action="clear-writer-chat" class="danger">현재 회의실 기록 비우기</button></div></section>`;
}

function updateActiveMemoCountDom(): void {
    const active = activeMemos();
    const numberMap = new Map(active.map((memo, index) => [memo.uid, index + 1]));
    const count = active.length;
    root?.querySelectorAll<HTMLElement>("[data-active-memo-count]").forEach((element) => {
        element.textContent = `활성 메모 ${count}개`;
    });
    root?.querySelectorAll<HTMLElement>("[data-memo-card]").forEach((card) => {
        const memo = currentWorkspace?.memos.find((item) => item.uid === card.dataset.memoCard);
        if (!memo) return;
        const number = numberMap.get(memo.uid);
        const effective = number !== undefined;
        card.classList.toggle("effective", effective);
        card.classList.toggle("suppressed", !effective);
        const title = card.querySelector<HTMLElement>(".memo-title-line");
        if (title) title.innerHTML = renderMemoTitleLine(memo, number ?? null);
        const meta = card.querySelector<HTMLElement>(".memo-collapse-heading .meta");
        if (meta) meta.textContent = effective ? "본편 요청에 포함" : "현재 미포함";
    });
}

function updateWriterTokenInfoDom(): void {
    const button = root?.querySelector<HTMLElement>('[data-action="toggle-token-info"]');
    const exceeds = currentWriterTokenSummary()?.exceedsContext === true;
    button?.classList.toggle("danger", exceeds);
    button?.classList.toggle("exceeded", exceeds);
    const panel = root?.querySelector<HTMLElement>("[data-token-panel]");
    if (panel && tokenInfoOpen) panel.outerHTML = renderWriterTokenPanel();
}

type UiIcon = "chat" | "refresh" | "minimize" | "expand" | "close" | "info" | "success" | "error";

function uiIcon(name: UiIcon): string {
    const paths: Record<UiIcon, string> = {
        chat: '<path d="M5 6.75A2.75 2.75 0 0 1 7.75 4h8.5A2.75 2.75 0 0 1 19 6.75v5.5A2.75 2.75 0 0 1 16.25 15H11l-3.8 3v-3.16A2.75 2.75 0 0 1 5 12.25v-5.5Z"/>',
        refresh: '<path d="M19 7v4h-4"/><path d="M18.1 10A7 7 0 1 0 19 14"/>',
        minimize: '<path d="M5 12h14"/>',
        expand: '<path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4"/>',
        close: '<path d="m6 6 12 12M18 6 6 18"/>',
        info: '<circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7.25v.25"/>',
        success: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.6 2.6L16.5 9"/>',
        error: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v6M12 16.5v.25"/>'
    };
    return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

function renderStatusBanner(): string {
    if (!statusMessage) return "";
    const icon = statusKind === "success" ? "success" : statusKind === "error" ? "error" : "info";
    return `<div class="status-wrap"><div class="status ${statusKind}" role="status">${uiIcon(icon)}<span>${escapeHtml(statusMessage)}</span></div></div>`;
}

function renderPreservingWriterScroll(): void {
    writerScrollRestore = root?.querySelector<HTMLElement>("#writer-messages")?.scrollTop ?? 0;
    render();
}

function render(): void {
    if (!root) return;
    const activeMemoCount = activeMemos().length;
    if (panelMinimized) {
        root.innerHTML = `<div class="app-shell minimized"><header class="app-header" data-drag-handle="true"><div class="header-brand"><span class="brand-mark">${uiIcon("chat")}</span><div class="header-copy"><div class="header-title-row"><strong>${PLUGIN_DISPLAY_NAME}</strong><span class="version">v${PLUGIN_VERSION}</span><span class="active-memo-badge" data-active-memo-count>활성 메모 ${activeMemoCount}개</span></div><p>${escapeHtml(currentIdentity?.title || "현재 세션을 불러오세요")}</p></div></div><div class="row header-actions"><button data-action="refresh-session" class="header-button icon-only" title="복원 후 새로고침" aria-label="복원 후 새로고침">${uiIcon("refresh")}</button><button data-action="expand-panel" class="header-button icon-only" title="복원" aria-label="복원">${uiIcon("expand")}</button><button data-action="close" class="header-button icon-only close" title="닫기" aria-label="닫기">${uiIcon("close")}</button></div></header></div>`;
        return;
    }
    const tabContent = activeTab === "writer"
        ? renderWriterTab()
        : activeTab === "memos"
            ? renderMemosTab()
            : activeTab === "context"
                ? renderContextTab()
                : renderSettingsTab();
    root.innerHTML = `<div class="app-shell"><header class="app-header" data-drag-handle="true"><div class="header-brand"><span class="brand-mark">${uiIcon("chat")}</span><div class="header-copy"><div class="header-title-row"><h1>${PLUGIN_DISPLAY_NAME}</h1><span class="version">v${PLUGIN_VERSION}</span><span class="active-memo-badge" data-active-memo-count>활성 메모 ${activeMemoCount}개</span></div><p>${escapeHtml(currentIdentity?.title || "현재 세션을 불러오세요")}</p></div></div><div class="row header-actions"><button data-action="refresh-session" class="header-button" title="진행 중인 요청을 취소하고 현재 세션을 새로고침">${uiIcon("refresh")}<span>${isSending ? "요청 취소·새로고침" : "새로고침"}</span></button><button data-action="minimize-panel" class="header-button" title="최소화">${uiIcon("minimize")}<span>최소화</span></button><button data-action="close" class="header-button close" title="닫기">${uiIcon("close")}<span>닫기</span></button></div></header><nav class="app-nav" aria-label="${PLUGIN_DISPLAY_NAME} 메뉴">${([['writer','집필 회의'],['memos','메모'],['context','컨텍스트'],['settings','설정']] as const).map(([id, label]) => `<button data-action="tab" data-tab="${id}" class="${activeTab === id ? "selected" : ""}" aria-current="${activeTab === id ? "page" : "false"}">${label}</button>`).join("")}</nav>${renderStatusBanner()}<main data-active-tab="${activeTab}">${tabContent}</main></div>`;
    if (activeTab === "writer") {
        const messages = root.querySelector("#writer-messages");
        const editInput = root.querySelector<HTMLTextAreaElement>('[data-input="edit-message-draft"]');
        const savedScrollTop = writerScrollRestore;
        writerScrollRestore = null;
        if (editInput) {
            editInput.focus({ preventScroll: true });
            if (messages && savedScrollTop !== null) messages.scrollTop = savedScrollTop;
        } else if (messages) {
            messages.scrollTop = savedScrollTop === null ? messages.scrollHeight : savedScrollTop;
        }
        const input = root.querySelector<HTMLTextAreaElement>("#writer-input");
        if (input && !isSending && document.activeElement !== input) input.focus();
    }
}
