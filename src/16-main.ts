async function openWriterRoom(): Promise<void> {
    const frameSnapshot = await prepareHostFrameDetection();
    await Risuai.showContainer("fullscreen");
    panelOpen = true;
    panelMinimized = false;
    await findAndConfigureHostFrame(frameSnapshot);
    await ensureMainResizeBridge();
    let okay = false;
    try {
        okay = await ensureCurrentWorkspace();
    } catch (error) {
        setStatus(`작업공간을 불러오지 못했습니다: ${errorMessage(error)}`, "error", false);
    }
    render();
    if (okay && !currentContext) await refreshContext();
}

async function initialize(): Promise<void> {
    let settingsLoadError: unknown = null;
    try {
        settings = await loadSettings();
    } catch (error) {
        settingsLoadError = error;
        settings = safeClone(DEFAULT_SETTINGS);
    }
    installStyles();
    root = document.createElement("div");
    root.id = "author-talk-root";
    document.body.appendChild(root);
    root.addEventListener("click", (event) => void handleClick(event));
    root.addEventListener("input", handleInput);
    root.addEventListener("change", (event) => void handleChange(event));
    root.addEventListener("keydown", handleKeyDown);
    root.addEventListener("dragstart", handleRegexDragStart);
    root.addEventListener("dragover", handleRegexDragOver);
    root.addEventListener("drop", handleRegexDrop);
    root.addEventListener("dragend", handleRegexDragEnd);
    root.addEventListener("pointerdown", (event) => void startPanelDrag(event));
    root.addEventListener("pointermove", movePanel);
    root.addEventListener("pointerup", endPanelDrag);
    root.addEventListener("pointercancel", endPanelDrag);
    await applyTheme();
    render();

    await Risuai.registerButton({
        name: PLUGIN_DISPLAY_NAME,
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
        iconType: "html",
        location: "chat",
        id: "author-talk-chat-menu",
    }, openWriterRoom);

    await Risuai.onUnload(async () => {
        panelOpen = false;
        if (settingsSaveTimer !== undefined) window.clearTimeout(settingsSaveTimer);
        settingsSaveTimer = undefined;
        if (regexContextRefreshTimer !== undefined) window.clearTimeout(regexContextRefreshTimer);
        regexContextRefreshTimer = undefined;
        if (memoReceiptRepairTimer !== undefined) window.clearTimeout(memoReceiptRepairTimer);
        memoReceiptRepairTimer = undefined;
        const request = activeWriterRequest;
        requestGeneration++;
        activeWriterRequest = null;
        isSending = false;
        if (request) {
            clearWriterRequestIdentityMonitor(request);
            if (request.reader) void request.reader.cancel().catch(() => {});
        }
        pendingResizeGeometry = null;
        memoReceiptState = null;
        const observer = memoReceiptObserver;
        memoReceiptObserver = null;
        const cleanupTasks: Promise<unknown>[] = [
            finishPanelResize(),
            runMemoReceiptSync(removeVisualMemoReceipts),
            removeParentResizeHandles(),
            removeMainResizeBridge(),
        ];
        if (memoReplacerReady) cleanupTasks.push(Risuai.removeRisuReplacer("beforeRequest", memoReplacer));
        if (observer) cleanupTasks.push(observer.disconnect());
        memoReplacerReady = false;
        const cleanupResults = await Promise.allSettled(cleanupTasks);
        for (const result of cleanupResults) {
            if (result.status === "rejected") console.warn("[Summon Author] Cleanup step failed during unload:", result.reason);
        }
        const saveResults = await Promise.allSettled([saveSettings(), saveCurrentWorkspace()]);
        for (const result of saveResults) {
            if (result.status === "rejected") console.error("[Summon Author] Save failed during unload:", result.reason);
        }
    });

    await requestInitialPermissions();
    if (settingsLoadError) {
        setStatus(`설정을 읽지 못했습니다. 원본 보호를 위해 이번 실행에서는 설정 저장을 차단했습니다: ${errorMessage(settingsLoadError)}`, "error", false);
        render();
    }
    console.log("[Summon Author] Plugin initialized.");
}

void initialize().catch((error) => {
    console.error("[Summon Author] Initialization failed:", error);
});
