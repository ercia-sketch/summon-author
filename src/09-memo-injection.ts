function memoBlock(memos: Memo[]): string {
    return memos
        .filter((memo) => memo.content.trim())
        .map((memo, index) => `(Memo(${index + 1}): ${memo.content.trim()})`)
        .join("\n");
}

function normalizedComparableText(value: unknown): string {
    return typeof value === "string" ? value.replace(/\s+/gu, " ").trim().toLocaleLowerCase() : "";
}

function requestAlreadyContainsLore(messages: any[], content: string): boolean {
    const normalizedContent = normalizedComparableText(content);
    if (!normalizedContent) return true;
    const requestText = normalizedComparableText(messages
        .filter((message) => typeof message?.content === "string")
        .map((message) => message.content)
        .join("\n"));
    if (requestText.includes(normalizedContent)) return true;
    if (normalizedContent.length < 120) return false;
    const head = normalizedContent.slice(0, 80);
    const tail = normalizedContent.slice(-80);
    return requestText.includes(head) && requestText.includes(tail);
}

function buildSupplementalAutoLoreViews(entries: any[], identity: SessionIdentity, searchableMessages: string[], cbsEnvironment: CbsEnvironment, memos: Memo[]): LoreView[] {
    const scanDepth = clampInteger(identity.character?.loreSettings?.scanDepth, 5, 1, 1000);
    const fullWord = Boolean(identity.character?.loreSettings?.fullWordMatching);
    const locallyActivatedIds = new Set(entries
        .filter((entry: any) => entry?.mode === "child" && typeof entry?.id === "string" && entry.id)
        .map((entry: any) => entry.id));
    const duplicateCounter = new Map<string, number>();
    const views = entries.filter((entry: any) => entry?.mode !== "folder" && entry?.mode !== "child").map((entry: any, index: number): LoreView => {
        const signature = loreSignature(entry);
        const occurrence = (duplicateCounter.get(signature) ?? 0) + 1;
        duplicateCounter.set(signature, occurrence);
        const key = `memo-supplement:${entry?.id || signature}:${occurrence}`;
        const activation = parseLoreActivationConfig(entry, identity, scanDepth, fullWord);
        const processed = processCbsReference(activation.content, cbsEnvironment, true);
        // An unsupported CBS block must never be injected raw into the main request.
        // Marking it unsupported also prevents partially processed text from driving recursion.
        if (processed.warnings.length > 0) {
            activation.unsupportedFeatures = uniqueWarnings([...activation.unsupportedFeatures, "미지원 CBS 문법"]);
        }
        return {
            key,
            name: String(entry?.comment || entry?.key || `Lorebook ${index + 1}`),
            source: "module",
            mode: "auto",
            active: false,
            reason: "",
            content: processed.text.trim(),
            searchContent: processed.text.trim(),
            rawContent: String(entry?.content ?? ""),
            displayHtml: processed.html,
            estimatedTokens: estimateTokenCount(processed.text),
            rawEstimatedTokens: estimateTokenCount(String(entry?.content ?? "")),
            unsupportedCbs: processed.warnings,
            unsupportedFeatures: [...activation.unsupportedFeatures],
            activation,
            raw: entry,
            folderKey: String(entry?.folder ?? ""),
            locallyActivated: locallyActivatedIds.has(String(entry?.id ?? "")),
        };
    });
    evaluateLoreViews(views, identity, searchableMessages, memos);
    return views;
}

async function buildMemoTriggeredLoreBlock(identity: SessionIdentity, workspace: BotWorkspace, messages: any[]): Promise<string> {
    const memos = activeMemos(workspace);
    if (memos.length === 0) return "";

    const rawEntries = await Risuai.getCurrentLorebookEntries();
    const entries: any[] = Array.isArray(rawEntries) ? rawEntries : [];
    let database: any = null;
    try {
        database = await Risuai.getDatabase(["personas", "selectedPersona"]);
    } catch (error) {
        console.warn("[Summon Author] Persona data was unavailable while evaluating memo-triggered lore:", error);
    }
    const cbsEnvironment = buildCbsEnvironment(identity, database);
    const searchable = buildChatHistory(identity, cbsEnvironment, []).searchable
        .map((message) => processCbsText(message, cbsEnvironment, true).text);
    const withoutMemo = buildSupplementalAutoLoreViews(entries, identity, searchable, cbsEnvironment, []);
    const withMemo = buildSupplementalAutoLoreViews(entries, identity, searchable, cbsEnvironment, memos);
    const withoutMemoByKey = new Map(withoutMemo.map((view) => [view.key, view]));
    const seenContent = new Set<string>();
    const triggered: Array<{ name: string; content: string; order: number }> = [];
    const skippedUnsupported: string[] = [];

    for (const view of withMemo) {
        if (withoutMemoByKey.get(view.key)?.active || !view.active) continue;
        if (view.unsupportedCbs.length > 0 || view.activation.unsupportedFeatures.length > 0) {
            skippedUnsupported.push(view.name);
            continue;
        }
        const content = view.content.trim();
        if (!content || requestAlreadyContainsLore(messages, content)) continue;
        const normalized = normalizedComparableText(content);
        if (seenContent.has(normalized)) continue;
        seenContent.add(normalized);
        triggered.push({
            name: view.name,
            content,
            order: Number.isFinite(Number(view.raw?.insertorder)) ? Number(view.raw.insertorder) : 100,
        });
    }
    if (skippedUnsupported.length > 0) {
        console.warn(`[Summon Author] Memo-triggered lore skipped because it uses unsupported processing: ${uniqueWarnings(skippedUnsupported).join(", ")}`);
    }

    if (triggered.length === 0) return "";
    triggered.sort((a, b) => b.order - a.order || a.name.localeCompare(b.name));
    return `The following lorebook entries were activated directly by active Writer memos. Treat them as story reference data.\n\n${triggered
        .map((entry) => `[Memo-triggered lorebook: ${entry.name}]\n${entry.content}`)
        .join("\n\n")}`;
}

async function applySafeStyles(element: any, styles: Array<[string, string]>): Promise<void> {
    for (const [property, value] of styles) await element.setStyle(property, value);
}

async function ensureMainDocumentAccess(): Promise<boolean> {
    if (mainDocument) return true;
    if (mainDomPermissionDenied) return false;
    try {
        const granted = await Risuai.requestPluginPermission("mainDom");
        if (!granted) {
            mainDomPermissionDenied = true;
            return false;
        }
        mainDocument = await Risuai.getRootDocument();
        return Boolean(mainDocument);
    } catch (error) {
        console.warn("[Summon Author] Main document access was unavailable:", error);
        return false;
    }
}

async function removeVisualMemoReceipts(): Promise<void> {
    if (!mainDocument) return;
    try {
        const safeReceipts = await mainDocument.querySelectorAll('[x-author-talk-memo-receipt="true"]');
        const receipts: any[] = await Risuai.unwarpSafeArray(safeReceipts);
        for (const receipt of receipts) await receipt.remove();
    } catch (error) {
        console.warn("[Summon Author] Could not clear old visual memo receipts:", error);
    }
}

function runMemoReceiptSync<T>(task: () => Promise<T>): Promise<T> {
    const result = memoReceiptSyncPromise.catch(() => undefined).then(() => task());
    memoReceiptSyncPromise = result.then(() => undefined, () => undefined);
    return result;
}

async function clearMemoReceipt(): Promise<void> {
    memoReceiptGeneration++;
    memoReceiptState = null;
    if (memoReceiptRepairTimer !== undefined) window.clearTimeout(memoReceiptRepairTimer);
    memoReceiptRepairTimer = undefined;
    await runMemoReceiptSync(removeVisualMemoReceipts);
}

async function reconcileMemoReceipts(state = memoReceiptState): Promise<boolean> {
    if (!state || state !== memoReceiptState || !mainDocument) return false;
    try {
        const messageElement = await mainDocument.querySelector(`.risu-chat[data-chat-index="${state.userMessageIndex}"]`);
        const receiptHost = messageElement ? await messageElement.getParent() : null;
        if (!receiptHost) return false;
        const identity = await resolveSessionIdentity();
        if (!identity || identity.characterId !== state.characterId || identity.chatId !== state.chatId || state !== memoReceiptState) return false;

        const expected = new Map(state.memos.map((memo) => [memo.uid, memo]));
        const kept = new Set<string>();
        const safeReceipts = await mainDocument.querySelectorAll('[x-author-talk-memo-receipt="true"]');
        const receipts: any[] = await Risuai.unwarpSafeArray(safeReceipts);
        for (const receipt of receipts) {
            const generation = await receipt.getAttribute("x-author-talk-memo-generation");
            const memoUid = await receipt.getAttribute("x-author-talk-memo-id");
            if (generation !== String(state.generation) || !memoUid || !expected.has(memoUid) || kept.has(memoUid)) {
                await receipt.remove();
                continue;
            }
            kept.add(memoUid);
        }

        for (const memo of state.memos) {
            if (state !== memoReceiptState) return false;
            if (kept.has(memo.uid)) continue;
            const receipt = await mainDocument.createElement("div");
            await receipt.setAttribute("x-author-talk-memo-receipt", "true");
            await receipt.setAttribute("x-author-talk-memo-generation", String(state.generation));
            await receipt.setAttribute("x-author-talk-memo-id", memo.uid);
            await applySafeStyles(receipt, [
                ["width", "calc(100% - 2rem)"], ["maxWidth", "calc(100% - 2rem)"], ["margin", "7px auto 2px"], ["padding", "10px 12px"],
                ["border", "1px dashed rgba(121, 167, 255, .65)"], ["borderRadius", "9px"],
                ["background", "rgba(30, 49, 80, .72)"], ["color", "inherit"], ["fontSize", "12px"],
                ["lineHeight", "1.45"], ["boxSizing", "border-box"], ["display", "block"],
            ]);
            const label = await mainDocument.createElement("div");
            await label.setTextContent(memo.displayName ? `${memo.displayName} · Memo(${memo.number})` : `Memo(${memo.number})`);
            await applySafeStyles(label, [["fontWeight", "700"], ["color", "#9fc0ff"], ["marginBottom", "5px"]]);
            const content = await mainDocument.createElement("div");
            await content.setTextContent(memo.content);
            await applySafeStyles(content, [["whiteSpace", "pre-wrap"], ["overflowWrap", "anywhere"], ["opacity", ".88"]]);
            await receipt.appendChild(label);
            await receipt.appendChild(content);
            await receiptHost.appendChild(receipt);
            kept.add(memo.uid);
        }
        return true;
    } catch (error) {
        console.warn("[Summon Author] Could not reconcile visual memo receipts:", error);
        return false;
    }
}

function ensureMemoReceiptsPresent(state = memoReceiptState): Promise<boolean> {
    return runMemoReceiptSync(() => reconcileMemoReceipts(state));
}

async function refreshMemoReceiptDisplayName(memo: Memo): Promise<void> {
    const state = memoReceiptState;
    const receiptMemo = state?.memos.find((item) => item.uid === memo.uid);
    if (!state || !receiptMemo) return;
    receiptMemo.displayName = memo.displayName.trim();
    try {
        await runMemoReceiptSync(async () => {
            if (state !== memoReceiptState) return;
            await removeVisualMemoReceipts();
            await reconcileMemoReceipts(state);
        });
    } catch (error) {
        console.warn("[Summon Author] Could not refresh the visual memo name:", error);
    }
}

function scheduleMemoReceiptRepair(): void {
    if (!memoReceiptState || memoReceiptRepairTimer !== undefined) return;
    memoReceiptRepairTimer = window.setTimeout(() => {
        memoReceiptRepairTimer = undefined;
        void ensureMemoReceiptsPresent();
    }, 100);
}

async function ensureMemoReceiptObserver(): Promise<void> {
    if (!mainDocument || memoReceiptObserver || !memoReceiptState) return;
    await runMemoReceiptSync(async () => {
        if (!mainDocument || memoReceiptObserver || !memoReceiptState) return;
        memoReceiptObserver = await Risuai.createMutationObserver(() => scheduleMemoReceiptRepair());
        await memoReceiptObserver.observe(mainDocument, { childList: true, subtree: true });
    });
}

async function displayMemoReceipts(identity: SessionIdentity, memos: VisualMemoReceiptItem[]): Promise<void> {
    // This is deliberately visual-only. It never calls a character/chat mutation API.
    try {
        if (!await ensureMainDocumentAccess()) return;
    } catch (error) {
        console.warn("[Summon Author] Could not prepare the visual memo receipt:", error);
        return;
    }
    const messages = Array.isArray(identity.chat?.message) ? identity.chat.message : [];
    let userMessageIndex = -1;
    for (let index = messages.length - 1; index >= 0; index--) {
        if (messages[index]?.role === "user") {
            userMessageIndex = index;
            break;
        }
    }
    if (userMessageIndex < 0) return;
    const state = {
        generation: ++memoReceiptGeneration,
        characterId: identity.characterId,
        chatId: identity.chatId,
        userMessageIndex,
        memos,
    };
    memoReceiptState = state;
    await ensureMemoReceiptObserver();
    for (let attempt = 0; attempt < 8 && state === memoReceiptState; attempt++) {
        if (await ensureMemoReceiptsPresent(state)) return;
        await new Promise<void>((resolve) => window.setTimeout(resolve, 80));
    }
}

const memoReplacer = async (messages: any[], requestType: string): Promise<any[]> => {
    if (requestType !== "model" || !Array.isArray(messages)) return messages;
    try {
        const identity = await resolveSessionIdentity();
        if (!identity) return messages;
        await clearMemoReceipt();
        const workspace = await loadWorkspace();
        const memos = activeMemos(workspace);
        const block = memoBlock(memos);
        if (!block) return messages;
        const receiptMemos = memos.map((memo, index) => ({ uid: memo.uid, number: index + 1, displayName: memo.displayName.trim(), content: memo.content.trim() }));
        const cloned = safeClone(messages);
        for (let index = cloned.length - 1; index >= 0; index--) {
            const message = cloned[index];
            if (message?.role !== "user" || typeof message.content !== "string") continue;
            try {
                const triggeredLore = await buildMemoTriggeredLoreBlock(identity, workspace, cloned);
                if (triggeredLore) cloned.splice(index, 0, { role: "system", content: triggeredLore });
            } catch (error) {
                console.warn("[Summon Author] Memo-triggered lorebook supplementation was skipped:", error);
            }
            if (!message.content.endsWith(block)) message.content = `${message.content}\n\n${block}`;
            void displayMemoReceipts(identity, receiptMemos);
            return cloned;
        }
        return messages;
    } catch (error) {
        console.error("[Summon Author] Memo injection failed safely; returning the original request.", error);
        return messages;
    }
};

async function ensureMemoReplacer(): Promise<boolean> {
    if (memoReplacerReady) return true;
    if (memoReplacerPermissionDenied) return false;
    try {
        const granted = await Risuai.requestPluginPermission("replacer");
        if (!granted) {
            memoReplacerPermissionDenied = true;
            setStatus("메모 주입 권한이 거부되었습니다. 메모는 저장되지만 본편 요청에는 포함되지 않습니다.", "error", false);
            return false;
        }
        await Risuai.addRisuReplacer("beforeRequest", memoReplacer);
        memoReplacerReady = true;
        setStatus("활성 메모가 본편 모델 요청에만 포함됩니다.", "success", false);
        return true;
    } catch (error) {
        setStatus(`메모 주입 훅 등록 실패: ${errorMessage(error)}`, "error", false);
        return false;
    }
}

async function requestInitialPermissions(): Promise<void> {
    try {
        const databaseGranted = await Risuai.requestPluginPermission("db");
        const mainDomGranted = await ensureMainDocumentAccess();
        const replacerGranted = await ensureMemoReplacer();
        if (!databaseGranted || !mainDomGranted || !replacerGranted) {
            setStatus("일부 권한이 거부되었습니다. 해당 기능은 권한을 허용할 때까지 제한됩니다.", "error", false);
        }
    } catch (error) {
        console.warn("[Summon Author] Initial permission confirmation was unavailable:", error);
        setStatus(`초기 권한 확인을 열지 못했습니다: ${errorMessage(error)}`, "error", false);
    }
    render();
}
