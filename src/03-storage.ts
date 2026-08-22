async function readStoredJson<T>(key: string, fallback: T): Promise<T> {
    try {
        const stored = await Risuai.pluginStorage.getItem(key);
        if (stored === null || stored === undefined || stored === "") return safeClone(fallback);
        if (typeof stored === "string") return JSON.parse(stored) as T;
        return safeClone(stored as T);
    } catch (error) {
        storageReadFailures.add(key);
        console.error(`[Summon Author] Failed to read ${key}:`, error);
        throw new Error(`저장 데이터 “${key}”을 읽지 못했습니다. 원본 보호를 위해 이 데이터에는 새 내용을 저장하지 않습니다: ${errorMessage(error)}`);
    }
}

async function writeStoredJson(key: string, value: unknown): Promise<void> {
    if (storageReadFailures.has(key)) {
        throw new Error(`저장 데이터 “${key}”에 읽기 오류가 있어 원본 보호를 위해 덮어쓰지 않았습니다.`);
    }
    await Risuai.pluginStorage.setItem(key, JSON.stringify(value));
}

function normalizePreset(value: any): PromptPreset | null {
    if (!value || typeof value.id !== "string" || typeof value.name !== "string" || typeof value.content !== "string") {
        return null;
    }
    return {
        id: value.id,
        name: value.name,
        content: value.content,
        builtIn: false,
    };
}

function normalizeContextRegexScript(value: any): ContextRegexScript | null {
    if (!value || typeof value !== "object") return null;
    return {
        id: typeof value.id === "string" && value.id ? value.id : `regex-${uuid()}`,
        name: typeof value.name === "string" ? value.name : "",
        input: typeof value.input === "string" ? value.input : "",
        output: typeof value.output === "string" ? value.output : "",
    };
}

function normalizeChatMessageExclusions(value: unknown): Record<string, string[]> {
    if (!value || typeof value !== "object") return {};
    const result: Record<string, string[]> = {};
    for (const [sessionKey, ids] of Object.entries(value as Record<string, unknown>)) {
        if (!sessionKey || !Array.isArray(ids)) continue;
        const normalized = [...new Set(ids.filter((id): id is string => typeof id === "string" && Boolean(id)))];
        if (normalized.length > 0) result[sessionKey] = normalized;
    }
    return result;
}

const CONTEXT_TOGGLE_KEYS = ["botCard", "persona", "memories", "chatHistory", "authorNote", "replaceGlobalNote", "firstMessage", "other"] as const;

function normalizeContextToggles(value: unknown): Record<string, boolean> {
    const source = (value && typeof value === "object") ? value as Record<string, unknown> : {};
    const result: Record<string, boolean> = {};
    for (const key of CONTEXT_TOGGLE_KEYS) {
        result[key] = key === "other" ? source[key] === true : source[key] !== false;
    }
    return result;
}

function normalizeUnsupportedSyntaxSettings(value: unknown): Record<string, boolean> {
    if (!value || typeof value !== "object") return {};
    const result: Record<string, boolean> = {};
    for (const [key, setting] of Object.entries(value as Record<string, unknown>)) {
        if (key && typeof setting === "boolean") result[key] = setting;
    }
    return result;
}

function omitsUnsupportedSyntax(key: string): boolean {
    return settings.omitUnsupportedSyntax[key] !== false;
}

function loreUnsupportedSyntaxKey(key: string): string {
    return `lore:${key}`;
}

async function loadSettings(): Promise<PluginSettings> {
    const stored = await readStoredJson<Partial<PluginSettings>>(SETTINGS_KEY, DEFAULT_SETTINGS);
    const customBasePresets = Array.isArray(stored.customBasePresets)
        ? stored.customBasePresets.map(normalizePreset).filter((preset): preset is PromptPreset => preset !== null)
        : [];
    const customAdditionalPresets = Array.isArray(stored.customAdditionalPresets)
        ? stored.customAdditionalPresets.map(normalizePreset).filter((preset): preset is PromptPreset => preset !== null)
        : [];

    const normalized: PluginSettings = {
        version: 6,
        selectedBasePresetId: typeof stored.selectedBasePresetId === "string" ? stored.selectedBasePresetId : BUILTIN_BASE_ID,
        selectedAdditionalPresetId: typeof stored.selectedAdditionalPresetId === "string" ? stored.selectedAdditionalPresetId : BUILTIN_ADDITIONAL_ID,
        customBasePresets,
        customAdditionalPresets,
        writerModelMode: isModelMode(stored.writerModelMode) ? stored.writerModelMode : "submodel",
        markdownEnabled: stored.markdownEnabled === true,
        writerMarkdownCleanup: stored.writerMarkdownCleanup === true,
        contextToggles: normalizeContextToggles(stored.contextToggles),
        omitUnsupportedSyntax: normalizeUnsupportedSyntaxSettings(stored.omitUnsupportedSyntax),
        collapsedMemoFolderIds: Array.isArray(stored.collapsedMemoFolderIds)
            ? [...new Set(stored.collapsedMemoFolderIds.filter((id): id is string => typeof id === "string" && Boolean(id)))]
            : [],
        collapsedMemoIds: Array.isArray(stored.collapsedMemoIds)
            ? [...new Set(stored.collapsedMemoIds.filter((id): id is string => typeof id === "string" && Boolean(id)))]
            : [],
        contextRegexScripts: Array.isArray(stored.contextRegexScripts)
            ? stored.contextRegexScripts.map(normalizeContextRegexScript).filter((script): script is ContextRegexScript => script !== null)
            : [],
        chatMessageExclusions: normalizeChatMessageExclusions(stored.chatMessageExclusions),
    };

    if (!getPreset("base", normalized.selectedBasePresetId, normalized)) normalized.selectedBasePresetId = BUILTIN_BASE_ID;
    if (!getPreset("additional", normalized.selectedAdditionalPresetId, normalized)) normalized.selectedAdditionalPresetId = BUILTIN_ADDITIONAL_ID;
    return normalized;
}

function normalizeWriterMessage(value: any, memoFolderId: string): WriterMessage | null {
    if (!value || (value.role !== "user" && value.role !== "assistant") || typeof value.content !== "string") return null;
    const normalizeUndoMemo = (memo: any): Memo | null => {
        if (!memo || typeof memo.uid !== "string" || !memo.uid || typeof memo.content !== "string") return null;
        return {
            uid: memo.uid,
            folderId: typeof memo.folderId === "string" ? memo.folderId : memoFolderId,
            content: memo.content,
            enabled: memo.enabled !== false,
            createdAt: typeof memo.createdAt === "number" ? memo.createdAt : Date.now(),
        };
    };
    const undoChanges: MemoUndoChange[] | null = Array.isArray(value.actionUndo?.changes)
        ? value.actionUndo.changes.map((change: any): MemoUndoChange | null => {
            if (!change || typeof change.uid !== "string" || !change.uid) return null;
            const before = change.before === null ? null : normalizeUndoMemo(change.before);
            const after = change.after === null ? null : normalizeUndoMemo(change.after);
            if (before === null && after === null) return null;
            if ((change.before !== null && before === null) || (change.after !== null && after === null)) return null;
            return { uid: change.uid, before, after };
        }).filter((change: MemoUndoChange | null): change is MemoUndoChange => change !== null)
        : null;
    const undoFolderValue = value.actionUndo?.createdFolder;
    const undoFolder: MemoFolder | undefined = undoFolderValue
        && typeof undoFolderValue.id === "string"
        && typeof undoFolderValue.name === "string"
        ? {
            id: undoFolderValue.id,
            name: undoFolderValue.name.trim() || "이름 없는 폴더",
            enabled: undoFolderValue.enabled !== false,
            createdAt: typeof undoFolderValue.createdAt === "number" ? undoFolderValue.createdAt : Date.now(),
        }
        : undefined;
    return {
        id: typeof value.id === "string" ? value.id : uuid(),
        role: value.role,
        content: value.content,
        createdAt: typeof value.createdAt === "number" ? value.createdAt : Date.now(),
        pendingActions: Array.isArray(value.pendingActions) ? value.pendingActions : undefined,
        memoNumberMap: value.memoNumberMap && typeof value.memoNumberMap === "object"
            ? Object.fromEntries(Object.entries(value.memoNumberMap).filter(([number, uid]) => /^\d+$/.test(number) && typeof uid === "string")) as Record<string, string>
            : undefined,
        actionState: value.actionState,
        // v0.15.5 and earlier stored a full-workspace snapshot here. It is deliberately
        // not migrated because restoring it could erase unrelated edits made afterward.
        actionUndo: undoChanges && undoChanges.length > 0 ? { changes: undoChanges, createdFolder: undoFolder } : undefined,
    };
}

function createEmptyWorkspace(): BotWorkspace {
    const roomId = uuid();
    const folderId = uuid();
    return {
        version: 4,
        rooms: [{ id: roomId, name: "회의실 1", writerMessages: [], createdAt: Date.now() }],
        selectedRoomId: roomId,
        memoFolders: [{ id: folderId, name: "기본 메모", enabled: true, createdAt: Date.now() }],
        memos: [],
    };
}

function normalizeWorkspace(value: any): BotWorkspace {
    if (!value || typeof value !== "object") return createEmptyWorkspace();
    const fallbackFolderId = typeof value.memoFolders?.[0]?.id === "string" ? value.memoFolders[0].id : uuid();
    const memoFolders: MemoFolder[] = Array.isArray(value.memoFolders)
        ? value.memoFolders
            .filter((folder: any) => folder && typeof folder.id === "string" && typeof folder.name === "string")
            .map((folder: any) => ({
                id: folder.id,
                name: folder.name.trim() || "이름 없는 폴더",
                enabled: folder.enabled !== false,
                createdAt: typeof folder.createdAt === "number" ? folder.createdAt : Date.now(),
            }))
        : [];
    if (memoFolders.length === 0) memoFolders.push({ id: fallbackFolderId, name: "기본 메모", enabled: true, createdAt: Date.now() });
    const validFolderIds = new Set(memoFolders.map((folder) => folder.id));
    const defaultFolderId = memoFolders[0].id;
    const rooms: WriterRoom[] = Array.isArray(value.rooms)
        ? value.rooms
            .filter((room: any) => room && typeof room.id === "string")
            .map((room: any, index: number) => ({
                id: room.id,
                name: typeof room.name === "string" && room.name.trim() ? room.name.trim() : `회의실 ${index + 1}`,
                writerMessages: Array.isArray(room.writerMessages)
                    ? room.writerMessages.map((message: any) => normalizeWriterMessage(message, defaultFolderId)).filter((message: WriterMessage | null): message is WriterMessage => message !== null)
                    : [],
                createdAt: typeof room.createdAt === "number" ? room.createdAt : Date.now(),
            }))
        : [];
    if (rooms.length === 0) rooms.push({ id: uuid(), name: "회의실 1", writerMessages: [], createdAt: Date.now() });
    const memos: Memo[] = Array.isArray(value.memos)
        ? value.memos
            .filter((memo: any) => memo && typeof memo.content === "string")
            .map((memo: any, index: number) => ({
                uid: typeof memo.uid === "string" && memo.uid ? memo.uid : uuid(),
                folderId: typeof memo.folderId === "string" && validFolderIds.has(memo.folderId) ? memo.folderId : defaultFolderId,
                content: memo.content,
                enabled: memo.enabled !== false,
                createdAt: typeof memo.createdAt === "number" ? memo.createdAt : Date.now() + index,
            }))
            .sort((a: Memo, b: Memo) => a.createdAt - b.createdAt || a.uid.localeCompare(b.uid))
        : [];
    return {
        version: 4,
        rooms,
        selectedRoomId: rooms.some((room) => room.id === value.selectedRoomId) ? value.selectedRoomId : rooms[0].id,
        memoFolders,
        memos,
    };
}

function normalizeLoreOverrides(value: any): Record<string, LoreMode> {
    const normalized: Record<string, LoreMode> = {};
    if (!value || typeof value !== "object") return normalized;
    for (const [key, mode] of Object.entries(value)) {
        // AUTO means "inherit the default", so it does not need a stored override.
        if (isLoreMode(mode) && mode !== DEFAULT_LORE_MODE) normalized[key] = mode;
    }
    return normalized;
}

function loreOverridesStorageKey(characterId: string): string {
    return `${LORE_OVERRIDES_KEY_PREFIX}${encodeURIComponent(characterId)}`;
}

async function migrateLegacyWorkspace(characterId: string, currentChatId: string): Promise<{ workspace: BotWorkspace; loreOverrides: Record<string, LoreMode> }> {
    const workspace = createEmptyWorkspace();
    const loreOverrides: Record<string, LoreMode> = {};
    const legacyPrefix = `${LEGACY_SESSION_KEY_PREFIX}${encodeURIComponent(characterId)}:`;
    let keys: string[] = [];
    try {
        keys = (await Risuai.pluginStorage.keys()).filter((key: string) => key.startsWith(legacyPrefix));
    } catch (error) {
        throw new Error(`기존 회의실과 메모 목록을 읽지 못했습니다. 원본 보호를 위해 마이그레이션하지 않습니다: ${errorMessage(error)}`);
    }
    if (keys.length === 0) return { workspace, loreOverrides };
    workspace.rooms = [];
    workspace.memoFolders = [];
    workspace.memos = [];
    for (let index = 0; index < keys.length; index++) {
        const key = keys[index];
        const legacy = await readStoredJson<any>(key, {});
        const isCurrentChat = key.endsWith(`:${encodeURIComponent(currentChatId)}`);
        const folderId = uuid();
        const roomId = uuid();
        workspace.memoFolders.push({ id: folderId, name: keys.length === 1 ? "기본 메모" : `이전 메모 ${index + 1}`, enabled: true, createdAt: Date.now() + index });
        const messages = Array.isArray(legacy.writerMessages)
            ? legacy.writerMessages.map((message: any) => normalizeWriterMessage({ ...message, pendingActions: undefined, actionUndo: undefined }, folderId)).filter((message: WriterMessage | null): message is WriterMessage => message !== null)
            : [];
        workspace.rooms.push({
            id: roomId,
            name: isCurrentChat ? "현재 채팅 · 기존 회의실" : `이전 회의실 ${index + 1}`,
            writerMessages: messages,
            createdAt: Date.now() + index,
        });
        if (isCurrentChat || !workspace.selectedRoomId) workspace.selectedRoomId = roomId;
        if (Array.isArray(legacy.memos)) {
            for (const memo of legacy.memos) {
                if (!memo || typeof memo.content !== "string") continue;
                workspace.memos.push({ uid: uuid(), folderId, content: memo.content, enabled: memo.enabled !== false, createdAt: Date.now() + workspace.memos.length });
            }
        }
        if (legacy.loreOverrides && typeof legacy.loreOverrides === "object") {
            Object.assign(loreOverrides, normalizeLoreOverrides(legacy.loreOverrides));
        }
    }
    if (workspace.rooms.length === 0) workspace.rooms.push({ id: uuid(), name: "회의실 1", writerMessages: [], createdAt: Date.now() });
    if (!workspace.rooms.some((room) => room.id === workspace.selectedRoomId)) workspace.selectedRoomId = workspace.rooms[0].id;
    if (workspace.memoFolders.length === 0) workspace.memoFolders.push({ id: uuid(), name: "기본 메모", enabled: true, createdAt: Date.now() });
    return { workspace: normalizeWorkspace(workspace), loreOverrides };
}

function emptyMigrationWorkspace(): BotWorkspace {
    return { version: 4, rooms: [], selectedRoomId: "", memoFolders: [], memos: [] };
}

function mergeWorkspace(target: BotWorkspace, source: BotWorkspace): void {
    const targetWasEmpty = target.rooms.length === 0;
    const folderIdMap = new Map<string, string>();
    const memoUidMap = new Map<string, string>();
    const roomIdMap = new Map<string, string>();

    for (const folder of source.memoFolders) {
        const id = uuid();
        folderIdMap.set(folder.id, id);
        target.memoFolders.push({ ...safeClone(folder), id });
    }
    const fallbackFolderId = folderIdMap.get(source.memoFolders[0]?.id) ?? target.memoFolders[0]?.id ?? uuid();
    const mappedMemoUid = (oldUid: string): string => {
        let mapped = memoUidMap.get(oldUid);
        if (!mapped) {
            mapped = uuid();
            memoUidMap.set(oldUid, mapped);
        }
        return mapped;
    };
    for (const memo of source.memos) {
        target.memos.push({
            ...safeClone(memo),
            uid: mappedMemoUid(memo.uid),
            folderId: folderIdMap.get(memo.folderId) ?? fallbackFolderId,
        });
    }
    for (const room of source.rooms) {
        const id = uuid();
        roomIdMap.set(room.id, id);
        const writerMessages = room.writerMessages.map((message) => {
            const cloned = safeClone(message);
            cloned.id = uuid();
            if (cloned.memoNumberMap) {
                cloned.memoNumberMap = Object.fromEntries(Object.entries(cloned.memoNumberMap).map(([number, uid]) => [number, mappedMemoUid(uid)]));
            }
            // Undo records from a separately migrated workspace cannot be reconciled
            // safely after memo and folder IDs are remapped.
            cloned.actionUndo = undefined;
            return cloned;
        });
        target.rooms.push({ ...safeClone(room), id, writerMessages });
    }
    if (targetWasEmpty) target.selectedRoomId = roomIdMap.get(source.selectedRoomId) ?? target.rooms[0]?.id ?? "";
}

function characterIdFromLegacySessionKey(key: string): string | null {
    const encoded = key.slice(LEGACY_SESSION_KEY_PREFIX.length).split(":", 1)[0];
    if (!encoded) return null;
    try {
        return decodeURIComponent(encoded);
    } catch {
        return encoded;
    }
}

async function storeMigratedLoreOverrides(characterId: string, overrides: Record<string, LoreMode>): Promise<void> {
    if (Object.keys(overrides).length === 0) return;
    const key = loreOverridesStorageKey(characterId);
    const existing = await readStoredJson<any>(key, null);
    if (existing === null) await writeStoredJson(key, overrides);
}

async function migrateGlobalWorkspace(): Promise<BotWorkspace> {
    const target = emptyMigrationWorkspace();
    let keys: string[];
    try {
        keys = await Risuai.pluginStorage.keys();
    } catch (error) {
        throw new Error(`기존 회의실과 메모를 확인하지 못했습니다: ${errorMessage(error)}`);
    }

    const migratedCharacters = new Set<string>();
    const oldWorkspaceKeys = keys.filter((key) => key.startsWith(LEGACY_WORKSPACE_KEY_PREFIX)).sort();
    for (const key of oldWorkspaceKeys) {
        const encodedCharacterId = key.slice(LEGACY_WORKSPACE_KEY_PREFIX.length);
        let characterId = encodedCharacterId;
        try {
            characterId = decodeURIComponent(encodedCharacterId);
        } catch {}
        const stored = await readStoredJson<any>(key, null);
        if (!stored) continue;
        mergeWorkspace(target, normalizeWorkspace(stored));
        await storeMigratedLoreOverrides(characterId, normalizeLoreOverrides(stored.loreOverrides));
        migratedCharacters.add(characterId);
    }

    const legacyCharacters = new Set(keys
        .filter((key) => key.startsWith(LEGACY_SESSION_KEY_PREFIX))
        .map(characterIdFromLegacySessionKey)
        .filter((characterId): characterId is string => Boolean(characterId)));
    for (const characterId of legacyCharacters) {
        if (migratedCharacters.has(characterId)) continue;
        const migrated = await migrateLegacyWorkspace(characterId, "");
        mergeWorkspace(target, migrated.workspace);
        await storeMigratedLoreOverrides(characterId, migrated.loreOverrides);
    }

    return target.rooms.length > 0 || target.memoFolders.length > 0
        ? normalizeWorkspace(target)
        : createEmptyWorkspace();
}

async function loadWorkspace(): Promise<BotWorkspace> {
    if (currentWorkspace) return currentWorkspace;
    if (!workspaceLoadPromise) {
        workspaceLoadPromise = (async () => {
            const stored = await readStoredJson<any>(GLOBAL_WORKSPACE_KEY, null);
            const workspace = stored ? normalizeWorkspace(stored) : await migrateGlobalWorkspace();
            if (!stored || stored.version !== 4) await writeStoredJson(GLOBAL_WORKSPACE_KEY, workspace);
            return workspace;
        })();
    }
    return workspaceLoadPromise;
}

async function loadLoreOverrides(characterId: string): Promise<Record<string, LoreMode>> {
    return normalizeLoreOverrides(await readStoredJson<any>(loreOverridesStorageKey(characterId), {}));
}

async function saveSettings(): Promise<void> {
    await writeStoredJson(SETTINGS_KEY, settings);
}

async function saveCurrentWorkspace(): Promise<void> {
    if (currentWorkspace) await writeStoredJson(GLOBAL_WORKSPACE_KEY, currentWorkspace);
    if (currentIdentity) await writeStoredJson(loreOverridesStorageKey(currentIdentity.characterId), currentLoreOverrides);
}

function scheduleSettingsSave(): void {
    if (settingsSaveTimer !== undefined) window.clearTimeout(settingsSaveTimer);
    settingsSaveTimer = window.setTimeout(() => {
        void saveSettings().catch((error) => setStatus(`설정 저장 실패: ${errorMessage(error)}`, "error"));
    }, 250);
}

function scheduleRegexContextRefresh(): void {
    if (regexContextRefreshTimer !== undefined) window.clearTimeout(regexContextRefreshTimer);
    const generation = ++regexContextRefreshGeneration;
    regexContextRefreshTimer = window.setTimeout(() => {
        regexContextRefreshTimer = undefined;
        void (async () => {
            try {
                const rebuilt = await buildWriterContext();
                if (generation !== regexContextRefreshGeneration || !rebuilt) return;
                currentContext = rebuilt;
                if (activeTab === "context") renderPreservingPanelScroll();
                else updateWriterTokenInfoDom();
            } catch (error) {
                console.warn("[Summon Author] Could not refresh regex-processed context:", error);
            }
        })();
    }, 300);
}

function allPresets(kind: PromptKind, sourceSettings: PluginSettings = settings): PromptPreset[] {
    return kind === "base"
        ? [BUILTIN_BASE_PRESET, ...sourceSettings.customBasePresets]
        : [BUILTIN_ADDITIONAL_PRESET, ...sourceSettings.customAdditionalPresets];
}

function getPreset(kind: PromptKind, id: string, sourceSettings: PluginSettings = settings): PromptPreset | undefined {
    return allPresets(kind, sourceSettings).find((preset) => preset.id === id);
}

function selectedPreset(kind: PromptKind): PromptPreset {
    const selectedId = kind === "base" ? settings.selectedBasePresetId : settings.selectedAdditionalPresetId;
    return getPreset(kind, selectedId) ?? (kind === "base" ? BUILTIN_BASE_PRESET : BUILTIN_ADDITIONAL_PRESET);
}

async function resolveSessionIdentity(): Promise<SessionIdentity | null> {
    const character = await Risuai.getCharacter();
    if (!character || !Array.isArray(character.chats)) return null;
    const chatPage = Number.isInteger(character.chatPage) ? character.chatPage : 0;
    const chat = character.chats[chatPage];
    if (!chat) return null;
    const characterId = String(character.chaId || `character-${await Risuai.getCurrentCharacterIndex()}`);
    const chatId = String(chat.id || `page-${chatPage}`);
    return {
        characterId,
        chatId,
        title: `${character.name || "현재 캐릭터"} · ${chat.name || `채팅 ${chatPage + 1}`}`,
        character,
        chat,
    };
}

async function ensureCurrentWorkspace(): Promise<boolean> {
    currentWorkspace = await loadWorkspace();
    const identity = await resolveSessionIdentity();
    if (!identity) {
        currentIdentity = null;
        currentLoreOverrides = {};
        currentContext = null;
        setStatus("선택된 캐릭터와 채팅이 없습니다.", "error");
        return false;
    }
    if (!currentIdentity || currentIdentity.characterId !== identity.characterId) {
        if (currentIdentity) await writeStoredJson(loreOverridesStorageKey(currentIdentity.characterId), currentLoreOverrides);
        currentIdentity = identity;
        currentLoreOverrides = await loadLoreOverrides(identity.characterId);
        editingMessageId = null;
        currentContext = null;
    } else {
        if (currentIdentity.chatId !== identity.chatId) currentContext = null;
        currentIdentity = identity;
    }
    return true;
}

function getCurrentRoom(workspace: BotWorkspace | null = currentWorkspace): WriterRoom | null {
    if (!workspace) return null;
    return workspace.rooms.find((room) => room.id === workspace.selectedRoomId) ?? workspace.rooms[0] ?? null;
}

function getMemoFolder(folderId: string, workspace: BotWorkspace | null = currentWorkspace): MemoFolder | null {
    return workspace?.memoFolders.find((folder) => folder.id === folderId) ?? null;
}

function isMemoEffectivelyEnabled(memo: Memo, workspace: BotWorkspace | null = currentWorkspace): boolean {
    const folder = getMemoFolder(memo.folderId, workspace);
    return Boolean(workspace && folder?.enabled && memo.enabled && memo.content.trim());
}

function activeMemos(workspace: BotWorkspace | null = currentWorkspace): Memo[] {
    return workspace
        ? workspace.memos
            .filter((memo) => isMemoEffectivelyEnabled(memo, workspace))
            .sort((a, b) => a.createdAt - b.createdAt || a.uid.localeCompare(b.uid))
        : [];
}

function activeMemoNumberMap(workspace: BotWorkspace | null = currentWorkspace): Map<string, number> {
    return new Map(activeMemos(workspace).map((memo, index) => [memo.uid, index + 1]));
}

function memoUidSnapshot(workspace: BotWorkspace | null = currentWorkspace): Record<string, string> {
    return Object.fromEntries(activeMemos(workspace).map((memo, index) => [String(index + 1), memo.uid]));
}

function visibleMemoNumber(memo: Memo, workspace: BotWorkspace | null = currentWorkspace): number | null {
    return activeMemoNumberMap(workspace).get(memo.uid) ?? null;
}
