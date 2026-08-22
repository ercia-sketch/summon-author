function parseMemoActions(text: string): { cleanText: string; actions?: MemoAction[]; error?: string } {
    const pattern = /<writer_memo_actions>\s*([\s\S]*?)\s*<\/writer_memo_actions>/g;
    const matches = [...text.matchAll(pattern)];
    if (matches.length === 0) return { cleanText: text.trim() };
    if (matches.length !== 1) return { cleanText: text.trim(), error: "메모 작업 블록이 둘 이상이어서 실행하지 않았습니다." };
    try {
        const parsed = JSON.parse(matches[0][1]);
        if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("action array is empty");
        const actions: MemoAction[] = parsed.map((value: any) => {
            if (!value || !["create", "update", "delete"].includes(value.operation)) throw new Error("unknown operation");
            if (value.operation === "create") {
                if (typeof value.content !== "string" || !value.content.trim()) throw new Error("create content is empty");
                return { operation: "create", content: value.content.trim() };
            }
            if (!Number.isInteger(value.id) || value.id < 1) throw new Error("memo id is invalid");
            if (value.operation === "update") {
                if (typeof value.content !== "string" || !value.content.trim()) throw new Error("update content is empty");
                return { operation: "update", id: value.id, content: value.content.trim() };
            }
            return { operation: "delete", id: value.id };
        });
        return {
            cleanText: text.replace(matches[0][0], "").trim() || "메모 작업을 제안했습니다.",
            actions,
        };
    } catch (error) {
        return { cleanText: text.trim(), error: `메모 작업 형식이 올바르지 않아 실행하지 않았습니다: ${errorMessage(error)}` };
    }
}

function memoEquals(left: Memo | undefined | null, right: Memo | undefined | null): boolean {
    if (!left || !right) return left === right;
    return left.uid === right.uid
        && left.folderId === right.folderId
        && left.content === right.content
        && left.enabled === right.enabled
        && left.createdAt === right.createdAt;
}

function memoFolderEquals(left: MemoFolder | undefined | null, right: MemoFolder | undefined | null): boolean {
    if (!left || !right) return left === right;
    return left.id === right.id
        && left.name === right.name
        && left.enabled === right.enabled
        && left.createdAt === right.createdAt;
}

function memoUndoChanges(before: Memo[], after: Memo[]): MemoUndoChange[] {
    const beforeByUid = new Map(before.map((memo) => [memo.uid, memo]));
    const afterByUid = new Map(after.map((memo) => [memo.uid, memo]));
    const uids = new Set([...beforeByUid.keys(), ...afterByUid.keys()]);
    return [...uids].filter((uid) => !memoEquals(beforeByUid.get(uid), afterByUid.get(uid))).map((uid) => ({
        uid,
        before: beforeByUid.has(uid) ? safeClone(beforeByUid.get(uid)!) : null,
        after: afterByUid.has(uid) ? safeClone(afterByUid.get(uid)!) : null,
    }));
}

async function applyMemoActions(messageId: string): Promise<void> {
    const room = getCurrentRoom();
    if (!currentWorkspace || !room) return;
    const message = room.writerMessages.find((item) => item.id === messageId);
    if (!message?.pendingActions || message.actionState !== "pending") return;
    const nextMemos = safeClone(currentWorkspace.memos);
    const nextFolders = safeClone(currentWorkspace.memoFolders);
    const numberMap = message.memoNumberMap ?? memoUidSnapshot(currentWorkspace);
    try {
        let writerFolderId = "";
        let createdFolder: MemoFolder | undefined;
        if (message.pendingActions.some((action) => action.operation === "create")) {
            const folderName = writerMemoFolderName();
            let writerFolder = nextFolders.find((folder) => folder.name.trim() === folderName);
            if (!writerFolder) {
                writerFolder = { id: uuid(), name: folderName, enabled: true, createdAt: Date.now() };
                nextFolders.push(writerFolder);
                createdFolder = safeClone(writerFolder);
            }
            writerFolderId = writerFolder.id;
        }
        for (const action of message.pendingActions) {
            if (action.operation === "create") {
                nextMemos.push({ uid: uuid(), folderId: writerFolderId, content: action.content!, enabled: true, createdAt: Date.now() + nextMemos.length });
                continue;
            }
            const targetUid = action.id ? numberMap[String(action.id)] : undefined;
            const index = targetUid ? nextMemos.findIndex((memo) => memo.uid === targetUid) : -1;
            if (index === -1) throw new Error(`Memo(${action.id})을 찾을 수 없습니다.`);
            if (action.operation === "update") nextMemos[index].content = action.content!;
            else nextMemos.splice(index, 1);
        }
        const previousMemos = currentWorkspace.memos;
        const previousFolders = currentWorkspace.memoFolders;
        const previousUndo = message.actionUndo;
        const changes = memoUndoChanges(previousMemos, nextMemos);
        if (changes.length === 0) throw new Error("실제로 변경되는 메모가 없습니다.");
        message.actionUndo = { changes, createdFolder };
        currentWorkspace.memoFolders = nextFolders;
        currentWorkspace.memos = nextMemos.sort((a, b) => a.createdAt - b.createdAt || a.uid.localeCompare(b.uid));
        message.actionState = "applied";
        try {
            await saveCurrentWorkspace();
        } catch (error) {
            currentWorkspace.memoFolders = previousFolders;
            currentWorkspace.memos = previousMemos;
            message.actionUndo = previousUndo;
            message.actionState = "pending";
            throw error;
        }
        if (activeMemos(currentWorkspace).length > 0) await ensureMemoReplacer();
        currentContext = null;
        setStatus("작가가 제안한 메모 작업을 적용했습니다.", "success");
    } catch (error) {
        setStatus(`메모 작업을 적용하지 않았습니다: ${errorMessage(error)}`, "error");
    }
    render();
}

async function undoMemoActions(messageId: string): Promise<void> {
    const room = getCurrentRoom();
    if (!currentWorkspace || !room) return;
    const message = room.writerMessages.find((item) => item.id === messageId);
    if (!message?.actionUndo || message.actionState !== "applied") return;
    try {
        const currentByUid = new Map(currentWorkspace.memos.map((memo) => [memo.uid, memo]));
        for (const change of message.actionUndo.changes) {
            if (!memoEquals(currentByUid.get(change.uid), change.after)) {
                throw new Error("적용 이후 해당 메모가 직접 수정되어 안전하게 실행 취소할 수 없습니다.");
            }
            if (change.before && !currentWorkspace.memoFolders.some((folder) => folder.id === change.before!.folderId)) {
                throw new Error("삭제된 메모의 원래 폴더가 없어 안전하게 실행 취소할 수 없습니다.");
            }
        }

        const previousMemos = currentWorkspace.memos;
        const previousFolders = currentWorkspace.memoFolders;
        const nextMemos = safeClone(currentWorkspace.memos);
        for (const change of message.actionUndo.changes) {
            const index = nextMemos.findIndex((memo) => memo.uid === change.uid);
            if (change.before === null) {
                if (index >= 0) nextMemos.splice(index, 1);
            } else if (index >= 0) {
                nextMemos[index] = safeClone(change.before);
            } else {
                nextMemos.push(safeClone(change.before));
            }
        }
        const nextFolders = safeClone(currentWorkspace.memoFolders);
        const createdFolder = message.actionUndo.createdFolder;
        if (createdFolder && !nextMemos.some((memo) => memo.folderId === createdFolder.id)) {
            const folderIndex = nextFolders.findIndex((folder) => folder.id === createdFolder.id);
            if (folderIndex >= 0 && memoFolderEquals(nextFolders[folderIndex], createdFolder)) nextFolders.splice(folderIndex, 1);
        }
        currentWorkspace.memoFolders = nextFolders;
        currentWorkspace.memos = nextMemos.sort((a, b) => a.createdAt - b.createdAt || a.uid.localeCompare(b.uid));
        message.actionState = "undone";
        try {
            await saveCurrentWorkspace();
        } catch (error) {
            currentWorkspace.memoFolders = previousFolders;
            currentWorkspace.memos = previousMemos;
            message.actionState = "applied";
            throw error;
        }
        currentContext = null;
        setStatus("메모 작업을 실행 취소했습니다.", "success");
    } catch (error) {
        setStatus(`메모 작업을 실행 취소하지 않았습니다: ${errorMessage(error)}`, "error");
    }
    render();
}
