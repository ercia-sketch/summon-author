async function handleClick(event: MouseEvent): Promise<void> {
    const target = event.target as HTMLElement;
    const cbsToggle = target.closest<HTMLElement>(".cbs-toggle");
    if (cbsToggle) {
        const collapsible = cbsToggle.parentElement?.querySelector<HTMLElement>(".cbs-collapsible");
        if (collapsible) {
            const isHidden = collapsible.style.display === "none";
            collapsible.style.display = isHidden ? "" : "none";
        }
        return;
    }
    const button = target.closest<HTMLElement>("[data-action]");
    if (!button) return;
    // Prevent summary clicks on action buttons from toggling the parent <details>.
    if (button.closest("summary")) event.stopPropagation();
    const action = button.dataset.action;
    if (action === "toggle-regex-trace") {
        const result = button.querySelector<HTMLElement>("[data-regex-result]");
        const original = button.querySelector<HTMLElement>("[data-regex-original]");
        if (!result || !original) return;
        const showingOriginal = !original.hidden;
        original.hidden = showingOriginal;
        result.hidden = !showingOriginal;
        button.classList.toggle("showing-original", !showingOriginal);
        return;
    }
    if (action === "toggle-chat-message") {
        const messageKey = String(button.dataset.messageKey || "");
        if (!messageKey || !currentIdentity) return;
        const collapseKey = `${chatMessageSettingsKey(currentIdentity)}:${messageKey}`;
        if (collapsedChatMessageKeys.has(collapseKey)) collapsedChatMessageKeys.delete(collapseKey);
        else collapsedChatMessageKeys.add(collapseKey);
        const body = button.closest<HTMLElement>(".chat-context-message")?.querySelector<HTMLElement>(".chat-context-message-body");
        const collapsed = collapsedChatMessageKeys.has(collapseKey);
        if (body) body.hidden = collapsed;
        button.setAttribute("aria-expanded", String(!collapsed));
        const icon = button.querySelector<HTMLElement>(".chat-collapse-icon");
        if (icon) icon.textContent = collapsed ? "▸" : "▾";
        return;
    }
    if (action === "toggle-chat-message-enabled" && currentContext && currentIdentity) {
        const messageKey = String(button.dataset.messageKey || "");
        const message = currentContext.chatHistoryMessages.find((item) => item.key === messageKey);
        if (!message) return;
        const storageKey = chatMessageSettingsKey(currentIdentity);
        const excluded = new Set(settings.chatMessageExclusions[storageKey] ?? []);
        if (message.enabled) excluded.add(messageKey);
        else excluded.delete(messageKey);
        if (excluded.size > 0) settings.chatMessageExclusions[storageKey] = [...excluded];
        else delete settings.chatMessageExclusions[storageKey];
        await saveSettings();
        currentContext = await buildWriterContext();
        renderPreservingPanelScroll();
        return;
    }
    if (action === "toggle-regex-manager") {
        regexManagerOpen = !regexManagerOpen;
        renderPreservingPanelScroll();
        return;
    }
    if (action === "new-regex-script") {
        const script: ContextRegexScript = { id: `regex-${uuid()}`, name: nextRegexScriptName(), input: "", output: "" };
        settings.contextRegexScripts.push(script);
        regexManagerOpen = true;
        expandedRegexScriptIds.add(script.id);
        await saveSettings();
        renderPreservingPanelScroll();
        return;
    }
    if (action === "toggle-regex-script") {
        const id = String(button.dataset.regexId || "");
        if (!id) return;
        if (expandedRegexScriptIds.has(id)) expandedRegexScriptIds.delete(id);
        else expandedRegexScriptIds.add(id);
        renderPreservingPanelScroll();
        return;
    }
    if (action === "delete-regex-script") {
        const id = String(button.dataset.regexId || "");
        const script = settings.contextRegexScripts.find((item) => item.id === id);
        if (!script || !window.confirm(`“${script.name || "이름 없는 정규식"}” 규칙을 삭제하시겠습니까?`)) return;
        settings.contextRegexScripts = settings.contextRegexScripts.filter((item) => item.id !== id);
        expandedRegexScriptIds.delete(id);
        contextRegexErrors.delete(id);
        await saveSettings();
        scheduleRegexContextRefresh();
        renderPreservingPanelScroll();
        return;
    }
    if (action === "close") {
        panelOpen = false;
        await finishPanelResize();
        await hideParentResizeShield();
        await hideParentResizeHandles();
        await removeParentResizeHandles();
        await removeMainResizeBridge();
        panelMinimized = false;
        await Risuai.hideContainer();
        return;
    }
    if (action === "minimize-panel") {
        await setPanelMinimized(true);
        return;
    }
    if (action === "expand-panel") {
        await setPanelMinimized(false);
        return;
    }
    if (action === "tab") {
        activeTab = button.dataset.tab as typeof activeTab;
        if (activeTab === "context" && !currentContext) await refreshContext();
        else render();
        return;
    }
    if (action === "send-writer") {
        await sendWriterMessage();
        return;
    }
    if (action === "toggle-token-info") {
        const opening = !tokenInfoOpen;
        if (opening) {
            isRefreshingContext = true;
            try {
                if (await ensureCurrentWorkspace()) currentContext = await buildWriterContext();
            } catch (error) {
                setStatus(`토큰 정보 갱신 실패: ${errorMessage(error)}`, "error", false);
            } finally {
                isRefreshingContext = false;
            }
        }
        tokenInfoOpen = opening;
        render();
        return;
    }
    if (action === "refresh-session") {
        if (panelMinimized) await setPanelMinimized(false);
        if (activeWriterRequest) await abandonActiveWriterRequest();
        currentContext = null;
        await ensureCurrentWorkspace();
        await refreshContext();
        return;
    }
    if (action === "prev-first-message" || action === "next-first-message") {
        if (!currentContext || currentContext.firstMessages.length === 0) return;
        const total = currentContext.firstMessages.length;
        if (action === "prev-first-message") firstMessageIndex = (firstMessageIndex - 1 + total) % total;
        else firstMessageIndex = (firstMessageIndex + 1) % total;
        currentContext.tokenEstimates.firstMessage = estimateTokenCount(currentContext.firstMessages[firstMessageIndex] ?? "");
        currentContext.rawTokenEstimates.firstMessage = estimateTokenCount(currentContext.rawFirstMessages[firstMessageIndex] ?? "");
        currentContext.cbsWarnings.firstMessage = currentContext.firstMessageWarnings[firstMessageIndex] ?? [];
        updateReferenceTokenTotals(currentContext);
        // Update only the first-message details in-place to preserve open/close and scroll state.
        const fmDetails = button.closest("details");
        if (fmDetails) {
            const fmPre = fmDetails.querySelector(".context-pre");
            if (fmPre) fmPre.innerHTML = renderContextDisplay(currentContext.display.firstMessages[firstMessageIndex] ?? currentContext.display.firstMessages[0] ?? "", "퍼스트 메세지 없음", currentContext.cbsWarnings.firstMessage);
            const counter = fmDetails.querySelector(".fm-counter");
            if (counter) counter.textContent = `${firstMessageIndex + 1}/${currentContext.firstMessages.length}`;
            const tokenBadge = fmDetails.querySelector(".source-title .token-badge");
            if (tokenBadge) tokenBadge.outerHTML = renderTokenBadge(deliveredContextTokens(currentContext, "firstMessage"), currentContext.rawTokenEstimates.firstMessage);
            const sourceTitle = fmDetails.querySelector<HTMLElement>(".source-title");
            sourceTitle?.querySelector(".cbs-warning")?.remove();
            sourceTitle?.insertAdjacentHTML("beforeend", renderCbsWarningBadge(currentContext.cbsWarnings.firstMessage));
        }
        const tokenStat = root.querySelector<HTMLElement>("[data-reference-tokens]");
        if (tokenStat) tokenStat.textContent = referenceTokenSummary(currentContext);
        return;
    }
    if (action === "toggle-context") {
        const key = String(button.dataset.contextKey || "");
        if (!CONTEXT_TOGGLE_KEYS.includes(key as any)) return;
        settings.contextToggles[key] = settings.contextToggles[key] === false;
        await saveSettings();
        if (currentContext) {
            updateReferenceTokenTotals(currentContext);
            renderPreservingPanelScroll();
        }
        return;
    }
    if (action === "set-unsupported-syntax") {
        const key = String(button.dataset.syntaxKey || "");
        if (!key) return;
        settings.omitUnsupportedSyntax[key] = button.dataset.omit === "true";
        await saveSettings();
        if (currentContext) currentContext = await buildWriterContext();
        renderPreservingPanelScroll();
        return;
    }
    if (action === "set-all-unsupported-syntax" && currentContext) {
        const omit = button.dataset.omit === "true";
        for (const key of CONTEXT_TOGGLE_KEYS) settings.omitUnsupportedSyntax[key] = omit;
        for (const entry of currentContext.loreEntries) settings.omitUnsupportedSyntax[loreUnsupportedSyntaxKey(entry.key)] = omit;
        await saveSettings();
        currentContext = await buildWriterContext();
        renderPreservingPanelScroll();
        return;
    }
    if (action === "set-all-lore" && currentWorkspace && currentContext) {
        const mode = button.dataset.mode;
        const scope = button.dataset.scope as "character" | "chat" | "module" | undefined;
        if (!isLoreMode(mode)) return;
        const targetEntries = scope
            ? currentContext.loreEntries.filter((entry) => entry.source === scope)
            : currentContext.loreEntries;
        for (const entry of targetEntries) {
            if (mode === DEFAULT_LORE_MODE) delete currentLoreOverrides[entry.key];
            else currentLoreOverrides[entry.key] = mode;
            updateLoreViewMode(entry, mode);
        }
        reevaluateCurrentLoreViews();
        for (const entry of currentContext.loreEntries) {
            const card = Array.from(root.querySelectorAll<HTMLElement>("[data-lore-card]"))
                .find((element) => element.dataset.loreCard === entry.key);
            const select = card?.querySelector<HTMLSelectElement>('[data-change="lore-mode"]');
            if (select) select.value = entry.mode;
            updateLoreCardDom(entry);
        }
        await saveCurrentWorkspace();
        updateReferenceTokenTotals(currentContext);
        const tokenStat = root.querySelector<HTMLElement>("[data-reference-tokens]");
        if (tokenStat) tokenStat.textContent = referenceTokenSummary(currentContext);
        const scopeLabel = scope ? `${loreSourceLabel(scope)} ` : "";
        setStatus(`${scopeLabel}로어북 전체를 ${mode.toUpperCase()}로 설정했습니다.`, "success", false);
        return;
    }
    if (action === "new-room" && currentWorkspace) {
        const name = window.prompt("새 회의실 이름", nextBotRoomName(currentWorkspace))?.trim();
        if (!name) return;
        if (activeWriterRequest) await abandonActiveWriterRequest();
        const room: WriterRoom = { id: uuid(), name, writerMessages: [], createdAt: Date.now() };
        currentWorkspace.rooms.push(room);
        currentWorkspace.selectedRoomId = room.id;
        editingMessageId = null;
        await saveCurrentWorkspace();
        render();
        return;
    }
    if (action === "rename-room" && currentWorkspace) {
        const room = getCurrentRoom();
        if (!room) return;
        const name = window.prompt("회의실 이름 변경", room.name)?.trim();
        if (!name) return;
        room.name = name;
        await saveCurrentWorkspace();
        render();
        return;
    }
    if (action === "delete-room" && currentWorkspace) {
        const room = getCurrentRoom();
        if (!room || currentWorkspace.rooms.length <= 1 || !window.confirm(`“${room.name}” 회의실과 그 기록을 삭제하시겠습니까?`)) return;
        if (activeWriterRequest) await abandonActiveWriterRequest();
        currentWorkspace.rooms = currentWorkspace.rooms.filter((item) => item.id !== room.id);
        currentWorkspace.selectedRoomId = currentWorkspace.rooms[0].id;
        editingMessageId = null;
        await saveCurrentWorkspace();
        render();
        return;
    }
    if (action === "edit-message") {
        const room = getCurrentRoom();
        const message = room?.writerMessages.find((item) => item.id === button.dataset.messageId);
        if (!message || isSending) return;
        editingMessageId = message.id;
        editingMessageDraft = message.content;
        renderPreservingWriterScroll();
        return;
    }
    if (action === "delete-message" && currentWorkspace) {
        const room = getCurrentRoom();
        const message = room?.writerMessages.find((item) => item.id === button.dataset.messageId);
        if (!room || !message || isSending) return;
        const roleLabel = message.role === "user" ? "사용자 메시지" : "작가 메시지";
        if (!window.confirm(`이 ${roleLabel}만 삭제하시겠습니까? 앞뒤 메시지는 유지됩니다.`)) return;
        room.writerMessages = room.writerMessages.filter((item) => item.id !== message.id);
        if (editingMessageId === message.id) {
            editingMessageId = null;
            editingMessageDraft = "";
        }
        await saveCurrentWorkspace();
        renderPreservingWriterScroll();
        return;
    }
    if (action === "cancel-edit") {
        editingMessageId = null;
        editingMessageDraft = "";
        renderPreservingWriterScroll();
        return;
    }
    if (action === "save-edited" && currentWorkspace) {
        const room = getCurrentRoom();
        const message = room?.writerMessages.find((item) => item.id === button.dataset.messageId);
        const content = editingMessageDraft.trim();
        if (!room || !message || !content || isSending) return;
        message.content = applyWriterMarkdownCleanup(content);
        editingMessageId = null;
        editingMessageDraft = "";
        await saveCurrentWorkspace();
        renderPreservingWriterScroll();
        return;
    }
    if (action === "resend-edited" && currentWorkspace) {
        const room = getCurrentRoom();
        const index = room?.writerMessages.findIndex((item) => item.id === button.dataset.messageId && item.role === "user") ?? -1;
        const content = editingMessageDraft.trim();
        if (!room || index < 0 || !content || isSending) return;
        if (activeWriterRequest) await abandonActiveWriterRequest();
        room.writerMessages[index].content = applyWriterMarkdownCleanup(content);
        room.writerMessages = room.writerMessages.slice(0, index + 1);
        editingMessageId = null;
        editingMessageDraft = "";
        await saveCurrentWorkspace();
        render();
        await requestWriterReply(room);
        return;
    }
    if (action === "toggle-memo-folder") {
        const folderId = String(button.dataset.folderId || "");
        if (!folderId) return;
        settings.collapsedMemoFolderIds = toggleCollapsedId(settings.collapsedMemoFolderIds, folderId);
        await saveSettings();
        renderPreservingPanelScroll();
        return;
    }
    if (action === "toggle-memo") {
        const memoUid = String(button.dataset.memoUid || "");
        if (!memoUid) return;
        settings.collapsedMemoIds = toggleCollapsedId(settings.collapsedMemoIds, memoUid);
        await saveSettings();
        renderPreservingPanelScroll();
        return;
    }
    if (action === "new-memo-folder" && currentWorkspace) {
        const name = window.prompt("새 메모 폴더 이름", `메모 폴더 ${currentWorkspace.memoFolders.length + 1}`)?.trim();
        if (!name) return;
        const id = uuid();
        currentWorkspace.memoFolders.push({ id, name, enabled: true, createdAt: Date.now() });
        forgetMemoUiState([id]);
        await saveCurrentWorkspace();
        await saveSettings();
        render();
        return;
    }
    if (action === "rename-memo-folder" && currentWorkspace) {
        const folder = getMemoFolder(String(button.dataset.folderId));
        if (!folder) return;
        const name = window.prompt("메모 폴더 이름 변경", folder.name)?.trim();
        if (!name) return;
        folder.name = name;
        await saveCurrentWorkspace();
        render();
        return;
    }
    if (action === "delete-memo-folder" && currentWorkspace) {
        const folder = getMemoFolder(String(button.dataset.folderId));
        if (!folder || currentWorkspace.memoFolders.length <= 1 || !window.confirm(`“${folder.name}” 폴더를 삭제하시겠습니까? 내부 메모는 다른 폴더로 이동합니다.`)) return;
        const destination = currentWorkspace.memoFolders.find((item) => item.id !== folder.id)!;
        for (const memo of currentWorkspace.memos) if (memo.folderId === folder.id) memo.folderId = destination.id;
        currentWorkspace.memoFolders = currentWorkspace.memoFolders.filter((item) => item.id !== folder.id);
        forgetMemoUiState([folder.id]);
        await saveCurrentWorkspace();
        await saveSettings();
        currentContext = null;
        render();
        return;
    }
    if (action === "new-memo" && currentWorkspace) {
        const folderId = String(button.dataset.folderId || currentWorkspace.memoFolders[0]?.id || "");
        if (!getMemoFolder(folderId)) return;
        const uid = uuid();
        currentWorkspace.memos.push({ uid, folderId, content: "", enabled: true, createdAt: Date.now() });
        forgetMemoUiState([folderId], [uid]);
        await saveCurrentWorkspace();
        await saveSettings();
        render();
        return;
    }
    if (action === "save-memo" && currentWorkspace) {
        await saveCurrentWorkspace();
        currentContext = null;
        const memo = currentWorkspace.memos.find((item) => item.uid === button.dataset.memoUid);
        if (memo && isMemoEffectivelyEnabled(memo, currentWorkspace)) await ensureMemoReplacer();
        const number = memo ? visibleMemoNumber(memo, currentWorkspace) : null;
        setStatus(`${number ? `Memo(${number})` : "메모"}를 저장했습니다.`, "success");
        return;
    }
    if (action === "delete-memo" && currentWorkspace) {
        const memoUid = String(button.dataset.memoUid || "");
        const memo = currentWorkspace.memos.find((item) => item.uid === memoUid);
        const number = memo ? visibleMemoNumber(memo, currentWorkspace) : null;
        if (!memo || !window.confirm(`${number ? `Memo(${number})` : "이 메모"}를 삭제하시겠습니까?`)) return;
        currentWorkspace.memos = currentWorkspace.memos.filter((item) => item.uid !== memoUid);
        forgetMemoUiState([], [memoUid]);
        await saveCurrentWorkspace();
        await saveSettings();
        currentContext = null;
        render();
        return;
    }
    if (action === "apply-actions") {
        await applyMemoActions(String(button.dataset.messageId));
        return;
    }
    if (action === "discard-actions") {
        const message = getCurrentRoom()?.writerMessages.find((item) => item.id === button.dataset.messageId);
        if (message) message.actionState = "discarded";
        await saveCurrentWorkspace();
        render();
        return;
    }
    if (action === "undo-actions") {
        await undoMemoActions(String(button.dataset.messageId));
        return;
    }
    if (action === "new-preset" || action === "clone-preset") {
        const kind = button.dataset.kind as PromptKind;
        const source = action === "clone-preset" ? selectedPreset(kind) : null;
        const preset: PromptPreset = {
            id: `custom-${kind}-${uuid()}`,
            name: source ? `${source.name} Copy` : `New ${kind === "base" ? "Base" : "Additional"} Preset`,
            content: source?.content ?? "",
            builtIn: false,
        };
        if (kind === "base") {
            settings.customBasePresets.push(preset);
            settings.selectedBasePresetId = preset.id;
        } else {
            settings.customAdditionalPresets.push(preset);
            settings.selectedAdditionalPresetId = preset.id;
        }
        await saveSettings();
        render();
        return;
    }
    if (action === "delete-preset") {
        const kind = button.dataset.kind as PromptKind;
        const preset = selectedPreset(kind);
        if (preset.builtIn || !window.confirm(`“${preset.name}” 프리셋을 삭제하시겠습니까?`)) return;
        if (kind === "base") {
            settings.customBasePresets = settings.customBasePresets.filter((item) => item.id !== preset.id);
            settings.selectedBasePresetId = BUILTIN_BASE_ID;
        } else {
            settings.customAdditionalPresets = settings.customAdditionalPresets.filter((item) => item.id !== preset.id);
            settings.selectedAdditionalPresetId = BUILTIN_ADDITIONAL_ID;
        }
        await saveSettings();
        render();
        return;
    }
    if (action === "save-preset") {
        await saveSettings();
        setStatus("프리셋을 저장했습니다.", "success");
        return;
    }
    if (action === "clear-writer-chat") {
        const room = getCurrentRoom();
        if (!room || !window.confirm("현재 회의실 기록을 모두 비우시겠습니까? 메모는 유지됩니다.")) return;
        if (activeWriterRequest) await abandonActiveWriterRequest();
        room.writerMessages = [];
        await saveCurrentWorkspace();
        render();
    }
}

function handleInput(event: Event): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (target.id === "writer-input") {
        writerDraft = target.value;
        updateWriterTokenInfoDom();
        return;
    }
    const inputType = target.dataset.input;
    if (!inputType) return;
    if (inputType === "writer-draft") {
        writerDraft = target.value;
        return;
    }
    if (inputType === "edit-message-draft") {
        editingMessageDraft = target.value;
        return;
    }
    if (inputType === "memo-content" && currentWorkspace) {
        const memo = currentWorkspace.memos.find((item) => item.uid === target.dataset.memoUid);
        if (memo) {
            memo.content = target.value;
            updateActiveMemoCountDom();
        }
        return;
    }
    if (inputType === "regex-name" || inputType === "regex-input" || inputType === "regex-output") {
        const script = settings.contextRegexScripts.find((item) => item.id === target.dataset.regexId);
        if (!script) return;
        if (inputType === "regex-name") script.name = target.value;
        else if (inputType === "regex-input") script.input = target.value;
        else script.output = target.value;
        validateContextRegexScripts();
        const card = target.closest<HTMLElement>(".regex-script-card");
        const title = card?.querySelector<HTMLElement>(".regex-script-title strong");
        if (title && inputType === "regex-name") title.textContent = script.name.trim() || "이름 없는 정규식";
        const error = card?.querySelector<HTMLElement>("[data-regex-error]");
        if (error) {
            const message = contextRegexErrors.get(script.id) ?? "";
            error.textContent = message;
            error.hidden = !message;
        }
        scheduleSettingsSave();
        scheduleRegexContextRefresh();
        return;
    }
    if (inputType === "preset-name" || inputType === "preset-content") {
        const kind = target.dataset.kind as PromptKind;
        const preset = selectedPreset(kind);
        if (preset.builtIn) return;
        if (inputType === "preset-name") preset.name = target.value;
        else preset.content = target.value;
        scheduleSettingsSave();
    }
}

function updateLoreViewMode(entry: LoreView, mode: LoreMode): void {
    entry.mode = mode;
}

function reevaluateCurrentLoreViews(): void {
    if (!currentContext || !currentIdentity) return;
    evaluateLoreViews(currentContext.loreEntries, currentIdentity, currentContext.searchableMessages, currentContext.activeMemos);
}

function updateLoreCardDom(entry: LoreView): void {
    const card = Array.from(root.querySelectorAll<HTMLElement>("[data-lore-card]")).find((element) => element.dataset.loreCard === entry.key);
    if (!card) return;
    card.classList.toggle("active", entry.active);
    card.classList.toggle("inactive", !entry.active);
    const status = card.querySelector<HTMLElement>("[data-lore-status]");
    const reason = card.querySelector<HTMLElement>("[data-lore-reason]");
    if (status) status.textContent = `${loreSourceLabel(entry.source)} · ${entry.active ? "작가에게 포함" : "작가에게 미포함"}`;
    if (reason) reason.textContent = entry.reason;
    const sourceTitle = card.querySelector<HTMLElement>(".source-title");
    const tokenBadge = sourceTitle?.querySelector<HTMLElement>(".token-badge");
    if (tokenBadge) tokenBadge.outerHTML = renderTokenBadge(entry.active ? entry.estimatedTokens : 0, entry.rawEstimatedTokens);
    sourceTitle?.querySelector(".feature-warning")?.remove();
    sourceTitle?.insertAdjacentHTML("beforeend", renderUnsupportedFeatureBadge(entry.unsupportedFeatures));
    const count = root.querySelector<HTMLElement>("[data-lore-count]");
    if (count && currentContext) count.textContent = `작가용 로어 ${currentContext.loreEntries.filter((item) => item.active).length}/${currentContext.loreEntries.length}개`;
    if (currentContext) {
        for (const scope of ["character", "chat", "module"] as const) {
            const scoped = currentContext.loreEntries.filter((item) => item.source === scope);
            const sectionCount = root.querySelector<HTMLElement>(`[data-lore-section-count="${scope}"]`);
            if (sectionCount) sectionCount.textContent = `${scoped.filter((item) => item.active).length}/${scoped.length}`;
        }
        if (entry.folderKey) {
            const members = currentContext.loreEntries.filter((item) => item.source === entry.source && item.folderKey === entry.folderKey);
            const folderCount = Array.from(root.querySelectorAll<HTMLElement>("[data-lore-folder-count]"))
                .find((element) => element.dataset.loreFolderCount === `${entry.source}:${entry.folderKey}`);
            if (folderCount) folderCount.textContent = `${members.filter((item) => item.active).length}/${members.length} 포함`;
            const folderSelect = Array.from(root.querySelectorAll<HTMLSelectElement>('[data-change="lore-folder-mode"]'))
                .find((element) => element.dataset.scope === entry.source && element.dataset.folderKey === entry.folderKey);
            if (folderSelect) {
                const mode = loreFolderMode(members);
                folderSelect.value = mode === "mixed" ? "" : mode;
            }
        }
    }
}

function renderPreservingPanelScroll(): void {
    const scrollTop = root.querySelector<HTMLElement>(".panel")?.scrollTop ?? 0;
    const openDetailKeys = new Set(Array.from(root.querySelectorAll<HTMLDetailsElement>("details[open]"))
        .map((detail) => detail.dataset.detailKey || (detail.dataset.loreCard ? `lore-card:${detail.dataset.loreCard}` : ""))
        .filter(Boolean));
    render();
    root.querySelectorAll<HTMLDetailsElement>("details").forEach((detail) => {
        const key = detail.dataset.detailKey || (detail.dataset.loreCard ? `lore-card:${detail.dataset.loreCard}` : "");
        if (key && openDetailKeys.has(key)) detail.open = true;
    });
    const panel = root.querySelector<HTMLElement>(".panel");
    if (panel) panel.scrollTop = scrollTop;
}

async function handleChange(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const changeType = target.dataset.change;
    if (!changeType) return;
    if (changeType === "room-select" && currentWorkspace) {
        if (!currentWorkspace.rooms.some((room) => room.id === target.value)) return;
        if (activeWriterRequest) await abandonActiveWriterRequest();
        currentWorkspace.selectedRoomId = target.value;
        editingMessageId = null;
        await saveCurrentWorkspace();
        render();
        return;
    }
    if (changeType === "memo-enabled" && currentWorkspace) {
        const memo = currentWorkspace.memos.find((item) => item.uid === target.dataset.memoUid);
        if (memo) memo.enabled = (target as HTMLInputElement).checked;
        await saveCurrentWorkspace();
        currentContext = null;
        if (memo && isMemoEffectivelyEnabled(memo, currentWorkspace)) await ensureMemoReplacer();
        renderPreservingPanelScroll();
        return;
    }
    if (changeType === "memo-folder-enabled" && currentWorkspace) {
        const folder = getMemoFolder(String(target.dataset.folderId));
        if (folder) folder.enabled = (target as HTMLInputElement).checked;
        await saveCurrentWorkspace();
        currentContext = null;
        if (activeMemos(currentWorkspace).length > 0) await ensureMemoReplacer();
        renderPreservingPanelScroll();
        return;
    }
    if (changeType === "memo-folder" && currentWorkspace) {
        const memo = currentWorkspace.memos.find((item) => item.uid === target.dataset.memoUid);
        if (memo && getMemoFolder(target.value)) memo.folderId = target.value;
        await saveCurrentWorkspace();
        currentContext = null;
        renderPreservingPanelScroll();
        return;
    }
    if (changeType === "lore-folder-mode" && currentWorkspace && currentContext) {
        const folderKey = String(target.dataset.folderKey || "");
        const scope = target.dataset.scope as LoreView["source"] | undefined;
        const mode = target.value;
        if (!folderKey || !scope || !isLoreMode(mode)) return;
        const members = currentContext.loreEntries.filter((entry) => entry.source === scope && entry.folderKey === folderKey);
        for (const entry of members) {
            if (mode === DEFAULT_LORE_MODE) delete currentLoreOverrides[entry.key];
            else currentLoreOverrides[entry.key] = mode;
            updateLoreViewMode(entry, mode);
        }
        reevaluateCurrentLoreViews();
        for (const entry of currentContext.loreEntries) {
            const card = Array.from(root.querySelectorAll<HTMLElement>("[data-lore-card]"))
                .find((element) => element.dataset.loreCard === entry.key);
            const select = card?.querySelector<HTMLSelectElement>('[data-change="lore-mode"]');
            if (select) select.value = entry.mode;
            updateLoreCardDom(entry);
        }
        const count = Array.from(root.querySelectorAll<HTMLElement>("[data-lore-folder-count]"))
            .find((element) => element.dataset.loreFolderCount === `${scope}:${folderKey}`);
        if (count) count.textContent = `${members.filter((entry) => entry.active).length}/${members.length} 포함`;
        await saveCurrentWorkspace();
        updateReferenceTokenTotals(currentContext);
        const tokenStat = root.querySelector<HTMLElement>("[data-reference-tokens]");
        if (tokenStat) tokenStat.textContent = referenceTokenSummary(currentContext);
        return;
    }
    if (changeType === "lore-mode" && currentWorkspace && currentContext) {
        const key = target.dataset.loreKey;
        const mode = target.value;
        const entry = currentContext.loreEntries.find((item) => item.key === key);
        if (!key || !entry || !isLoreMode(mode)) return;
        if (mode === DEFAULT_LORE_MODE) delete currentLoreOverrides[key];
        else currentLoreOverrides[key] = mode;
        updateLoreViewMode(entry, mode);
        reevaluateCurrentLoreViews();
        for (const loreEntry of currentContext.loreEntries) updateLoreCardDom(loreEntry);
        await saveCurrentWorkspace();
        updateReferenceTokenTotals(currentContext);
        const tokenStat = root.querySelector<HTMLElement>("[data-reference-tokens]");
        if (tokenStat) tokenStat.textContent = referenceTokenSummary(currentContext);
        return;
    }
    if (changeType === "preset-select") {
        const kind = target.dataset.kind as PromptKind;
        if (kind === "base") settings.selectedBasePresetId = target.value;
        else settings.selectedAdditionalPresetId = target.value;
        await saveSettings();
        render();
        return;
    }
    if (changeType === "model-mode" && isModelMode(target.value)) {
        settings.writerModelMode = target.value;
        await saveSettings();
        render();
        return;
    }
    if (changeType === "markdown-enabled") {
        settings.markdownEnabled = (target as HTMLInputElement).checked;
        await saveSettings();
        renderPreservingPanelScroll();
        return;
    }
    if (changeType === "markdown-cleanup") {
        settings.writerMarkdownCleanup = (target as HTMLSelectElement).value === "on";
        await saveSettings();
        renderPreservingPanelScroll();
        return;
    }
}

function handleKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (target.id === "writer-input" && event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        void sendWriterMessage();
    }
}

function handleRegexDragStart(event: DragEvent): void {
    const card = (event.target as HTMLElement).closest<HTMLElement>(".regex-script-card");
    if (!card?.dataset.regexId) return;
    draggedRegexScriptId = card.dataset.regexId;
    card.classList.add("dragging");
    event.dataTransfer?.setData("text/plain", draggedRegexScriptId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function handleRegexDragOver(event: DragEvent): void {
    if (!draggedRegexScriptId || !(event.target as HTMLElement).closest(".regex-script-list")) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function handleRegexDrop(event: DragEvent): void {
    if (!draggedRegexScriptId) return;
    const targetCard = (event.target as HTMLElement).closest<HTMLElement>(".regex-script-card");
    const targetId = targetCard?.dataset.regexId;
    if (!targetCard || !targetId || targetId === draggedRegexScriptId) return;
    event.preventDefault();
    const from = settings.contextRegexScripts.findIndex((script) => script.id === draggedRegexScriptId);
    const targetIndex = settings.contextRegexScripts.findIndex((script) => script.id === targetId);
    if (from < 0 || targetIndex < 0) return;
    const [moved] = settings.contextRegexScripts.splice(from, 1);
    const adjustedTarget = settings.contextRegexScripts.findIndex((script) => script.id === targetId);
    const rect = targetCard.getBoundingClientRect();
    const insertAfter = event.clientY > rect.top + rect.height / 2;
    settings.contextRegexScripts.splice(adjustedTarget + (insertAfter ? 1 : 0), 0, moved);
    draggedRegexScriptId = null;
    scheduleSettingsSave();
    scheduleRegexContextRefresh();
    renderPreservingPanelScroll();
}

function handleRegexDragEnd(): void {
    draggedRegexScriptId = null;
    root?.querySelectorAll(".regex-script-card.dragging").forEach((card) => card.classList.remove("dragging"));
}
