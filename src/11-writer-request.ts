function mergeStreamText(accumulated: string, incoming: string): string {
    if (!incoming) return accumulated;
    if (!accumulated || incoming.startsWith(accumulated)) return incoming;
    return accumulated + incoming;
}

function streamChunkText(chunk: any, accumulated: string, decoder: TextDecoder): { text: string; decodedBytes: boolean } {
    if (typeof chunk === "string") return { text: mergeStreamText(accumulated, chunk), decodedBytes: false };
    if (chunk instanceof Uint8Array) return { text: accumulated + decoder.decode(chunk, { stream: true }), decodedBytes: true };
    if (chunk && typeof chunk === "object") {
        if (typeof chunk["0"] === "string") return { text: chunk["0"], decodedBytes: false };
        if (typeof chunk.text === "string") return { text: mergeStreamText(accumulated, chunk.text), decodedBytes: false };
        if (typeof chunk.content === "string") return { text: mergeStreamText(accumulated, chunk.content), decodedBytes: false };
    }
    return { text: accumulated, decodedBytes: false };
}

function firstMultilineWriterAnswer(result: unknown): string {
    if (!Array.isArray(result)) return "";
    const firstAssistant = result.find((candidate: any) => Array.isArray(candidate) && ["char", "assistant"].includes(String(candidate[0])) && typeof candidate[1] === "string");
    if (firstAssistant) return firstAssistant[1];
    const first = result[0];
    return Array.isArray(first) && typeof first[1] === "string" ? first[1] : typeof first === "string" ? first : "";
}

function ownsWriterRequest(request: ActiveWriterRequest): boolean {
    return activeWriterRequest === request && request.generation === requestGeneration;
}

function isCurrentRequest(request: ActiveWriterRequest): boolean {
    return ownsWriterRequest(request)
        && currentIdentity?.characterId === request.characterId
        && currentIdentity?.chatId === request.chatId
        && Boolean(currentWorkspace?.rooms.some((room) => room.id === request.roomId));
}

function clearWriterRequestIdentityMonitor(request: ActiveWriterRequest): void {
    if (request.identityTimer !== null) window.clearInterval(request.identityTimer);
    request.identityTimer = null;
}

async function cancelWriterRequestForSessionChange(request: ActiveWriterRequest): Promise<boolean> {
    if (!ownsWriterRequest(request)) return false;
    const identity = await resolveSessionIdentity();
    if (identity?.characterId === request.characterId && identity.chatId === request.chatId) return true;
    await abandonActiveWriterRequest("봇 또는 채팅이 변경되어 이전 작가 요청을 중단했습니다.");
    currentContext = null;
    try {
        await ensureCurrentWorkspace();
    } catch (error) {
        setStatus(`새 세션을 불러오지 못했습니다: ${errorMessage(error)}`, "error", false);
    }
    render();
    return false;
}

function startWriterRequestIdentityMonitor(request: ActiveWriterRequest): void {
    let checking = false;
    request.identityTimer = window.setInterval(() => {
        if (checking || !ownsWriterRequest(request)) return;
        checking = true;
        void cancelWriterRequestForSessionChange(request)
            .catch((error) => console.warn("[Summon Author] Could not check the active Writer session:", error))
            .finally(() => { checking = false; });
    }, 300);
}

async function readWriterResponse(raw: any, onText: (text: string) => void, request: ActiveWriterRequest): Promise<string> {
    if (!isCurrentRequest(request)) return "";
    if (typeof raw === "string") {
        onText(raw);
        return raw;
    }
    if (raw?.type === "fail") throw new Error(String(raw.result || "Writer model request failed"));
    if (raw?.type === "success") {
        const result = String(raw.result ?? "");
        onText(result);
        return result;
    }
    if (raw?.type === "multiline") {
        const result = firstMultilineWriterAnswer(raw.result);
        if (!result) throw new Error("Writer model returned an empty multiline response.");
        onText(result);
        return result;
    }
    const stream = raw instanceof ReadableStream
        ? raw
        : raw?.type === "streaming" && raw.result instanceof ReadableStream
            ? raw.result
            : null;
    if (stream) {
        const reader = stream.getReader();
        request.reader = reader;
        let accumulated = "";
        const decoder = new TextDecoder();
        let decodedBytes = false;
        while (true) {
            const { done, value } = await reader.read();
            if (!isCurrentRequest(request)) {
                void reader.cancel().catch(() => {});
                return "";
            }
            if (done) break;
            const merged = streamChunkText(value, accumulated, decoder);
            accumulated = merged.text;
            decodedBytes ||= merged.decodedBytes;
            onText(accumulated);
        }
        if (decodedBytes) {
            accumulated += decoder.decode();
            onText(accumulated);
        }
        return accumulated;
    }
    if (raw && typeof raw.result === "string") {
        onText(raw.result);
        return raw.result;
    }
    throw new Error("Writer model returned an unsupported response format.");
}

function writerHistoryContent(message: WriterMessage): string {
    if (!message.pendingActions?.length || (message.actionState !== "pending" && message.actionState !== "discarded")) {
        return message.content;
    }
    const status = message.actionState === "pending"
        ? "PENDING; not applied"
        : "DISCARDED BY USER; not an active memo";
    const actions = message.pendingActions.map((action) => {
        if (action.operation === "create") return `- Create memo: ${JSON.stringify(action.content ?? "")}`;
        if (action.operation === "update") return `- Update Memo(${action.id}): ${JSON.stringify(action.content ?? "")}`;
        return `- Delete Memo(${action.id})`;
    }).join("\n");
    return `${message.content}\n\n[Memo proposal record — ${status}]\n${actions}`;
}

function writerRequestMessages(context: WriterContext, room: WriterRoom, projectedDraft = ""): any[] {
    const base = selectedPreset("base");
    const additional = selectedPreset("additional");
    // The empty assistant placeholder used for streaming is UI state only. It must
    // never be sent to the Writer model as part of the conversation history.
    const history = room.writerMessages
        .filter((message) => message.content.trim().length > 0)
        .map((message) => ({ role: message.role, content: writerHistoryContent(message) }));
    const projected = projectedDraft.trim()
        ? [...history, { role: "user", content: applyWriterMarkdownCleanup(projectedDraft.trim()) }]
        : history;
    return [
        { role: "system", content: base.content },
        { role: "system", content: additional.content },
        { role: "system", content: buildReferenceMaterial(context) },
        ...projected,
    ];
}

interface WriterTokenSummary {
    inputEstimate: number;
    responseEstimate: number;
    maxResponse: number;
    maxContext: number;
    exceedsContext: boolean;
}

function estimateWriterChatTokens(messages: any[]): number {
    return messages.reduce((total, message) => total + estimateTokenCount(String(message?.content ?? "")) + 4, 2);
}

function currentWriterTokenSummary(): WriterTokenSummary | null {
    const room = getCurrentRoom();
    if (!currentContext || !room) return null;
    const latestAssistant = [...room.writerMessages].reverse().find((message) => message.role === "assistant" && message.content.trim());
    const inputEstimate = estimateWriterChatTokens(writerRequestMessages(currentContext, room, writerDraft));
    const responseEstimate = latestAssistant ? estimateTokenCount(latestAssistant.content) : 0;
    const maxResponse = currentContext.maxResponse;
    const maxContext = currentContext.maxContext;
    return {
        inputEstimate,
        responseEstimate,
        maxResponse,
        maxContext,
        exceedsContext: inputEstimate + maxResponse >= maxContext,
    };
}

async function abandonActiveWriterRequest(message = "이전 요청을 취소했습니다."): Promise<void> {
    requestGeneration++;
    const request = activeWriterRequest;
    activeWriterRequest = null;
    isSending = false;
    if (request) clearWriterRequestIdentityMonitor(request);
    if (request?.reader) void request.reader.cancel().catch(() => {});
    let saveError: unknown = null;
    if (request && currentWorkspace && currentIdentity?.characterId === request.characterId) {
        const room = currentWorkspace.rooms.find((item) => item.id === request.roomId);
        if (room) room.writerMessages = room.writerMessages.filter((item) => item.id !== request.assistantMessageId);
        try {
            await saveCurrentWorkspace();
        } catch (error) {
            saveError = error;
        }
    }
    setStatus(saveError ? `${message} 작업공간 저장 실패: ${errorMessage(saveError)}` : message, saveError ? "error" : "info", false);
    render();
}

async function requestWriterReply(room: WriterRoom): Promise<void> {
    if (!currentWorkspace || !currentIdentity || isSending) return;
    const assistantMessage: WriterMessage = {
        id: uuid(),
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        memoNumberMap: memoUidSnapshot(currentWorkspace),
    };
    room.writerMessages.push(assistantMessage);
    const request: ActiveWriterRequest = {
        generation: ++requestGeneration,
        characterId: currentIdentity.characterId,
        chatId: currentIdentity.chatId,
        roomId: room.id,
        assistantMessageId: assistantMessage.id,
        reader: null,
        identityTimer: null,
    };
    activeWriterRequest = request;
    startWriterRequestIdentityMonitor(request);
    isSending = true;
    setStatus("작가가 자료를 검토하고 있습니다…", "info", false);
    render();
    try {
        await saveCurrentWorkspace();
        currentContext = await buildWriterContext();
        if (!isCurrentRequest(request)) return;
        if (!currentContext) throw new Error("현재 세션의 컨텍스트를 만들 수 없습니다.");
        const raw = await Risuai.runLLMModel({
            mode: settings.writerModelMode,
            messages: writerRequestMessages(currentContext, room),
            allowPlugins: true,
        });
        if (!await cancelWriterRequestForSessionChange(request)) return;
        if (!isCurrentRequest(request)) {
            const staleStream = raw instanceof ReadableStream ? raw : raw?.type === "streaming" && raw.result instanceof ReadableStream ? raw.result : null;
            if (staleStream) void staleStream.cancel().catch(() => {});
            return;
        }
        const fullText = await readWriterResponse(raw, (partial) => {
            if (!isCurrentRequest(request)) return;
            assistantMessage.content = partial;
            render();
        }, request);
        if (!await cancelWriterRequestForSessionChange(request)) return;
        if (!isCurrentRequest(request)) return;
        if (!fullText.trim()) throw new Error("작가 모델이 빈 응답을 반환했습니다.");
        const parsed = parseMemoActions(fullText);
        assistantMessage.content = applyWriterMarkdownCleanup(parsed.cleanText);
        if (parsed.actions) {
            assistantMessage.pendingActions = parsed.actions;
            assistantMessage.actionState = "pending";
        }
        if (parsed.error) setStatus(parsed.error, "error", false);
        else setStatus("작가의 답변을 받았습니다.", "success", false);
        await saveCurrentWorkspace();
    } catch (error) {
        if (!isCurrentRequest(request)) return;
        assistantMessage.content = `요청에 실패했습니다: ${errorMessage(error)}`;
        setStatus(assistantMessage.content, "error", false);
        await saveCurrentWorkspace();
    } finally {
        clearWriterRequestIdentityMonitor(request);
        if (ownsWriterRequest(request)) {
            activeWriterRequest = null;
            isSending = false;
            render();
        }
    }
}

async function sendWriterMessage(): Promise<void> {
    const content = writerDraft.trim();
    if (!content || isSending) return;
    if (!await ensureCurrentWorkspace() || !currentWorkspace) return;
    const room = getCurrentRoom();
    if (!room) return;
    writerDraft = "";
    room.writerMessages.push({ id: uuid(), role: "user", content: applyWriterMarkdownCleanup(content), createdAt: Date.now() });
    await requestWriterReply(room);
}
