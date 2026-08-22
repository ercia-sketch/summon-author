function loreSignature(entry: any): string {
    return hashText(JSON.stringify({
        id: entry?.id ?? "",
        comment: entry?.comment ?? "",
        key: entry?.key ?? "",
        secondkey: entry?.secondkey ?? "",
        content: entry?.content ?? "",
    }));
}

function multisetSignatures(entries: any[]): Map<string, number> {
    const result = new Map<string, number>();
    for (const entry of entries) {
        const signature = loreSignature(entry);
        result.set(signature, (result.get(signature) ?? 0) + 1);
    }
    return result;
}

function consumeSignature(set: Map<string, number>, signature: string): boolean {
    const count = set.get(signature) ?? 0;
    if (count < 1) return false;
    if (count === 1) set.delete(signature);
    else set.set(signature, count - 1);
    return true;
}

function parseRegexKey(value: string): RegExp | null {
    if (!value.startsWith("/")) return null;
    const finalSlash = value.lastIndexOf("/");
    if (finalSlash <= 0) return null;
    try {
        return new RegExp(value.slice(1, finalSlash), value.slice(finalSlash + 1));
    } catch {
        return null;
    }
}

function splitLoreKeys(value: unknown): string[] {
    return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function normalizedLoreSearchText(value: string): string {
    return value
        .toLocaleLowerCase()
        .replace(/\{\{\/\/(.+?)\}\}/g, "")
        .replace(/\{\{comment:(.+?)\}\}/g, "");
}

function matchLoreQuery(keys: string[], documents: LoreSearchDocument[], useRegex: boolean, fullWord: boolean, all = false): { matched: boolean; key?: string; source?: LoreMatchSource; invalidRegex?: string } {
    const cleanKeys = keys.map((key) => key.trim()).filter(Boolean);
    if (cleanKeys.length === 0) return { matched: false };
    const findKey = (key: string): { matched: boolean; source?: LoreMatchSource; invalidRegex?: string } => {
        if (useRegex) {
            const regex = parseRegexKey(key);
            if (!regex) return { matched: false, invalidRegex: key };
            for (const document of documents) {
                regex.lastIndex = 0;
                if (regex.test(document.text)) return { matched: true, source: document.source };
            }
            return { matched: false };
        }
        const loweredKey = normalizedLoreSearchText(key);
        for (const document of documents) {
            const loweredText = normalizedLoreSearchText(document.text);
            if (fullWord) {
                if (loweredText.split(" ").includes(loweredKey)) return { matched: true, source: document.source };
            } else if (loweredText.replace(/ /g, "").includes(loweredKey.replace(/ /g, ""))) {
                return { matched: true, source: document.source };
            }
        }
        return { matched: false };
    };

    if (all) {
        let firstSource: LoreMatchSource | undefined;
        for (const key of cleanKeys) {
            const result = findKey(key);
            if (result.invalidRegex) return { matched: false, invalidRegex: result.invalidRegex };
            if (!result.matched) return { matched: false };
            firstSource ??= result.source;
        }
        return { matched: true, key: cleanKeys.join(", "), source: firstSource };
    }
    for (const key of cleanKeys) {
        const result = findKey(key);
        if (result.invalidRegex) return { matched: false, invalidRegex: result.invalidRegex };
        if (result.matched) return { matched: true, key, source: result.source };
    }
    return { matched: false };
}

const NON_ACTIVATION_LORE_DECORATORS = new Set([
    "end", "depth", "reverse_depth", "role", "position", "priority", "ignore_on_max_context",
    "inject_lore", "inject_at", "inject_replace", "inject_prepend", "disable_ui_prompt",
    "instruct_depth", "reverse_instruct_depth", "instruct_scan_depth", "is_user_icon",
    "assistant", "user", "system",
]);

function lorePersistentState(identity: SessionIdentity, prefix: string, entry: any): boolean {
    const id = String(entry?.id ?? "").trim();
    if (!id) return false;
    const state = identity.chat?.scriptstate;
    if (!state || typeof state !== "object") return false;
    const key = `${prefix}${id}`;
    return state[`$${key}`] === "true" || state[key] === "true";
}

function parseLoreActivationConfig(entry: any, identity: SessionIdentity, defaultScanDepth: number, defaultFullWord: boolean): LoreActivationConfig {
    const config: LoreActivationConfig = {
        content: "",
        scanDepth: defaultScanDepth,
        fullWord: defaultFullWord,
        recursive: "global",
        dontSearchWhenRecursive: false,
        force: "none",
        eligible: true,
        queries: [],
        unsupportedFeatures: [],
    };
    const contentLines: string[] = [];
    const chatLength = (Array.isArray(identity.chat?.message) ? identity.chat.message.length : 0) + 1;
    const greetingNumber = Number(identity.chat?.fmIndex ?? -1) + 1;
    const rawContent = String(entry?.content ?? "");
    const addUnsupported = (feature: string) => config.unsupportedFeatures.push(feature);

    for (const line of rawContent.replace(/\r\n?/g, "\n").split("\n")) {
        const match = line.match(/^\s*@@@?([a-z_]+)(?:\s+([\s\S]*?))?\s*$/i);
        if (!match) {
            contentLines.push(line);
            continue;
        }
        const name = match[1].toLocaleLowerCase();
        const rawArgs = (match[2] ?? "").trim();
        const args = splitLoreKeys(rawArgs);
        let recognized = true;
        switch (name) {
            case "scan_depth": {
                const value = Number.parseInt(rawArgs, 10);
                if (Number.isFinite(value)) config.scanDepth = clampInteger(value, defaultScanDepth, 1, 1000);
                else addUnsupported("잘못된 검색 깊이 설정");
                break;
            }
            case "additional_keys": config.queries.push({ keys: args, negative: false }); break;
            case "exclude_keys": config.queries.push({ keys: args, negative: true }); break;
            case "exclude_keys_all": config.queries.push({ keys: args, negative: true, all: true }); break;
            case "match_full_word": config.fullWord = true; break;
            case "match_partial_word": config.fullWord = false; break;
            case "activate": config.force = "activate"; break;
            case "dont_activate": config.force = "deactivate"; break;
            case "activate_only_after": {
                const value = Number.parseInt(rawArgs, 10);
                if (Number.isFinite(value)) config.eligible &&= chatLength >= value;
                else addUnsupported("잘못된 활성화 시점 설정");
                break;
            }
            case "activate_only_every": {
                const value = Number.parseInt(rawArgs, 10);
                if (Number.isFinite(value) && value > 0) config.eligible &&= chatLength % value === 0;
                else addUnsupported("잘못된 반복 활성화 설정");
                break;
            }
            case "is_greeting": {
                const value = Number.parseInt(rawArgs, 10);
                if (Number.isFinite(value)) config.eligible &&= greetingNumber === value;
                else addUnsupported("잘못된 퍼스트 메시지 조건");
                break;
            }
            case "keep_activate_after_match":
                if (lorePersistentState(identity, "__internal_ka_", entry)) config.force = "activate";
                break;
            case "dont_activate_after_match":
                if (lorePersistentState(identity, "__internal_da_", entry)) config.force = "deactivate";
                break;
            case "recursive": config.recursive = true; break;
            case "unrecursive": config.recursive = false; break;
            case "no_recursive_search": config.dontSearchWhenRecursive = true; break;
            case "probability": {
                const value = Number(rawArgs);
                if (!Number.isFinite(value) || value < 100) addUnsupported("활성 확률 설정 미지원");
                break;
            }
            default:
                if (!NON_ACTIVATION_LORE_DECORATORS.has(name)) {
                    addUnsupported(`미지원 로어북 기능: @@${name}`);
                    recognized = false;
                }
                break;
        }
        if (!recognized) contentLines.push(line);
    }

    const directProbability = Number(entry?.activationPercent ?? entry?.extensions?.probability);
    if (Number.isFinite(directProbability) && directProbability < 100) addUnsupported("활성 확률 설정 미지원");
    config.content = contentLines.join("\n").trim();
    config.unsupportedFeatures = uniqueWarnings(config.unsupportedFeatures);
    return config;
}

function loreReasonForSource(source: LoreMatchSource | undefined): string {
    if (source === "memo") return "AUTO · 활성 메모에서 활성화 키 발견";
    if (source === "recursive") return "AUTO · 로어북 재귀 검색에서 활성화 키 발견";
    return "AUTO · 본편 대화에서 활성화 키 발견";
}

function evaluateLoreEntry(view: LoreView, identity: SessionIdentity, searchableMessages: string[], memoTexts: string[], recursiveDocuments: LoreSearchDocument[]): { active: boolean; reason: string } {
    if (view.mode === "on") return { active: true, reason: "ON · 사용자 지정" };
    if (view.mode === "off") return { active: false, reason: "OFF · 사용자 지정" };
    const config = view.activation;
    if (config.unsupportedFeatures.length > 0) return { active: false, reason: "AUTO · 미지원 기능이 있어 작가에게 미포함" };
    if (config.force === "activate") return { active: true, reason: "AUTO · 항상 활성화" };
    if (config.force === "deactivate" || !config.eligible) return { active: false, reason: "AUTO · 검색 깊이 내 활성화 키 없음" };
    if (view.locallyActivated) return { active: true, reason: "AUTO · 현재 채팅에서 로컬 활성화" };
    if (view.raw?.alwaysActive) return { active: true, reason: "AUTO · 항상 활성화" };

    const documents: LoreSearchDocument[] = searchableMessages
        .slice(-Math.max(1, config.scanDepth))
        .map((text) => ({ text, source: "chat" }));
    documents.push(...memoTexts.filter(Boolean).map((text) => ({ text, source: "memo" as const })));
    if (!config.dontSearchWhenRecursive) documents.push(...recursiveDocuments);
    const queries: LoreSearchQuery[] = [
        ...config.queries,
        { keys: splitLoreKeys(view.raw?.key), negative: false },
    ];
    if (view.raw?.selective && String(view.raw?.secondkey ?? "").trim()) {
        queries.push({ keys: splitLoreKeys(view.raw.secondkey), negative: false });
    }
    let matchedSource: LoreMatchSource | undefined;
    for (const query of queries) {
        if (query.keys.length === 0) {
            if (!query.negative) return { active: false, reason: "AUTO · 검색 깊이 내 활성화 키 없음" };
            continue;
        }
        const result = matchLoreQuery(query.keys, documents, Boolean(view.raw?.useRegex), config.fullWord, query.all);
        if (result.invalidRegex) {
            view.unsupportedFeatures = uniqueWarnings([...view.unsupportedFeatures, `잘못된 정규식 활성화 키: ${result.invalidRegex}`]);
            return { active: false, reason: "AUTO · 미지원 기능이 있어 작가에게 미포함" };
        }
        if (query.negative ? result.matched : !result.matched) {
            return { active: false, reason: "AUTO · 검색 깊이 내 활성화 키 없음" };
        }
        if (!query.negative) matchedSource ??= result.source;
    }
    return { active: true, reason: loreReasonForSource(matchedSource) };
}

function evaluateLoreViews(views: LoreView[], identity: SessionIdentity, searchableMessages: string[], memos: Memo[]): void {
    const recursiveScanning = identity.character?.loreSettings?.recursiveScanning ?? true;
    const memoTexts = memos.map((memo) => memo.content.trim()).filter(Boolean);
    const recursiveDocuments: LoreSearchDocument[] = [];
    const activated = new Set<string>();
    for (const view of views) {
        view.active = false;
        view.reason = view.mode === "on" ? "ON · 사용자 지정" : view.mode === "off" ? "OFF · 사용자 지정" : "AUTO · 검색 깊이 내 활성화 키 없음";
        view.unsupportedFeatures = [...view.activation.unsupportedFeatures];
    }

    for (let pass = 0; pass < Math.max(1, views.length); pass++) {
        let changed = false;
        for (const view of views) {
            if (activated.has(view.key)) continue;
            const result = evaluateLoreEntry(view, identity, searchableMessages, memoTexts, recursiveDocuments);
            view.active = result.active;
            view.reason = result.reason;
            if (!result.active) continue;
            activated.add(view.key);
            changed = true;
            const recursive = view.activation.recursive === "global" ? recursiveScanning : view.activation.recursive;
            if (recursive && view.searchContent.trim()) recursiveDocuments.push({ text: view.searchContent, source: "recursive" });
        }
        if (!changed) break;
    }

    for (const view of views) {
        if (activated.has(view.key)) continue;
        const result = evaluateLoreEntry(view, identity, searchableMessages, memoTexts, recursiveDocuments);
        view.active = result.active;
        view.reason = result.reason;
    }
}

async function buildLoreViews(identity: SessionIdentity, searchableMessages: string[], cbsEnvironment: CbsEnvironment, memos: Memo[], compiledRegex: CompiledContextRegex[]): Promise<{ views: LoreView[]; folders: LoreFolderView[] }> {
    if (!currentWorkspace) return { views: [], folders: [] };
    let allEntries: any[] = [];
    try {
        const result = await Risuai.getCurrentLorebookEntries();
        allEntries = Array.isArray(result) ? result : [];
    } catch (error) {
        console.error("[Summon Author] Failed to read lorebook entries:", error);
    }
    const characterEntries = Array.isArray(identity.character?.globalLore) ? identity.character.globalLore : [];
    const chatEntries = Array.isArray(identity.chat?.localLore) ? identity.chat.localLore : [];
    const characterSet = multisetSignatures(characterEntries);
    const chatSet = multisetSignatures(chatEntries);
    const duplicateCounter = new Map<string, number>();
    const scanDepth = clampInteger(identity.character?.loreSettings?.scanDepth, 5, 1, 1000);
    const fullWord = Boolean(identity.character?.loreSettings?.fullWordMatching);
    const locallyActivatedIds = new Set(chatEntries
        .filter((entry: any) => entry?.mode === "child" && typeof entry?.id === "string" && entry.id)
        .map((entry: any) => entry.id));
    const folders: LoreFolderView[] = [];
    const folderKeys = new Set<string>();

    const classified = allEntries.map((entry) => {
        const signature = loreSignature(entry);
        const source: LoreView["source"] = consumeSignature(characterSet, signature)
            ? "character"
            : consumeSignature(chatSet, signature)
                ? "chat"
                : "module";
        return { entry, signature, source };
    });

    for (const { entry, source } of classified) {
        if (entry?.mode !== "folder") continue;
        const rawKey = String(entry?.key ?? "");
        if (!rawKey) continue;
        const uniqueKey = `${source}:${rawKey}`;
        if (folderKeys.has(uniqueKey)) continue;
        folderKeys.add(uniqueKey);
        folders.push({ key: rawKey, name: String(entry?.comment || "이름 없는 폴더"), source });
    }

    const views = classified.filter(({ entry }) => entry?.mode !== "folder" && entry?.mode !== "child").map(({ entry, signature, source }, index): LoreView => {
        const occurrenceKey = `${source}:${signature}`;
        const occurrence = (duplicateCounter.get(occurrenceKey) ?? 0) + 1;
        duplicateCounter.set(occurrenceKey, occurrence);
        const key = `${source}:${entry?.id || signature}:${occurrence}`;
        const mode = currentLoreOverrides[key] ?? DEFAULT_LORE_MODE;
        const rawContent = String(entry?.content ?? "");
        const activation = parseLoreActivationConfig(entry, identity, scanDepth, fullWord);
        const cbsContent = processCbsReference(activation.content, cbsEnvironment, omitsUnsupportedSyntax(loreUnsupportedSyntaxKey(key)));
        const processedContent = applyRegexToReference(cbsContent, compiledRegex, false, true);
        return {
            key,
            name: String(entry?.comment || entry?.key || `Lorebook ${index + 1}`),
            source,
            mode,
            active: false,
            reason: "",
            content: processedContent.text.trim(),
            searchContent: cbsContent.text.trim(),
            rawContent,
            displayHtml: processedContent.html,
            estimatedTokens: estimateTokenCount(processedContent.text),
            rawEstimatedTokens: estimateTokenCount(rawContent),
            unsupportedCbs: cbsContent.warnings,
            unsupportedFeatures: [...activation.unsupportedFeatures],
            activation,
            raw: entry,
            folderKey: String(entry?.folder ?? ""),
            locallyActivated: source === "character" && locallyActivatedIds.has(String(entry?.id ?? "")),
        };
    });
    evaluateLoreViews(views, identity, searchableMessages, memos);
    return { views, folders };
}
