function parseDefaultVariables(value: unknown): Record<string, string> {
    const variables: Record<string, string> = {};
    if (typeof value !== "string") return variables;
    for (const line of value.split("\n")) {
        const [key, variableValue] = line.split("=");
        if (key && variableValue) variables[key] = variableValue;
    }
    return variables;
}

function selectedPersona(database: any, chat: any): any | null {
    const personas = Array.isArray(database?.personas) ? database.personas : [];
    if (chat?.bindedPersona) {
        const bound = personas.find((item: any) => item?.id === chat.bindedPersona);
        if (bound) return bound;
    }
    return Number.isInteger(database?.selectedPersona) ? personas[database.selectedPersona] ?? null : null;
}

function buildCbsEnvironment(identity: SessionIdentity, database: any): CbsEnvironment {
    const variables = parseDefaultVariables(identity.character?.defaultVariables);
    const scriptState = identity.chat?.scriptstate;
    if (scriptState && typeof scriptState === "object") {
        for (const [storedKey, value] of Object.entries(scriptState)) {
            if (!storedKey.startsWith("$") || value === undefined || value === null) continue;
            variables[storedKey.slice(1)] = String(value);
        }
    }
    const persona = selectedPersona(database, identity.chat);
    return {
        variables,
        charName: String(identity.character?.name || "Character"),
        userName: String(persona?.name || "User"),
    };
}

function appendField(lines: string[], label: string, value: unknown): void {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (trimmed) lines.push(`[${label}]\n${trimmed}`);
}

function appendListField(lines: string[], label: string, value: unknown): void {
    const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
    const normalized = items.map((item) => String(item ?? "").trim()).filter(Boolean);
    if (normalized.length > 0) lines.push(`[${label}]\n${[...new Set(normalized)].join(", ")}`);
}

function buildCharacterDescription(character: any): string {
    const lines: string[] = [];
    appendField(lines, "Name", character.name);
    appendField(lines, "Description", character.desc);
    return lines.join("\n\n") || "No character name or description was available.";
}

function firstText(...values: unknown[]): string {
    for (const value of values) {
        if (typeof value === "string" && value.trim()) return value;
    }
    return "";
}

function buildCharacterOther(character: any): string {
    const lines: string[] = [];
    appendField(lines, "Personality", character.personality);
    appendField(lines, "Scenario", character.scenario);
    appendField(lines, "Example Dialogue", character.exampleMessage);
    appendField(lines, "Character System Prompt", character.systemPrompt);
    appendField(lines, "Post-History Instructions", character.postHistoryInstructions);
    appendField(lines, "Notes", character.notes);
    appendField(lines, "Creator Notes", firstText(character.creatorNotes, character.creator_notes));
    appendField(lines, "Creator Name", firstText(character.creator, character.additionalData?.creator));
    appendField(lines, "Character Version", firstText(character.characterVersion, character.character_version, character.additionalData?.character_version));
    appendListField(lines, "Tags", [
        ...(Array.isArray(character.tags) ? character.tags : []),
        ...(Array.isArray(character.additionalData?.tag) ? character.additionalData.tag : []),
    ]);
    if (character.type === "group" && Array.isArray(character.characters)) {
        lines.push(`[Group Character IDs]\n${character.characters.join(", ")}`);
    }
    return lines.join("\n\n");
}

function groupMembers(character: any, database: any): any[] {
    if (character?.type !== "group" || !Array.isArray(character.characters)) return [];
    const allCharacters = Array.isArray(database?.characters) ? database.characters : [];
    return character.characters
        .map((characterId: unknown) => allCharacters.find((candidate: any) => candidate?.chaId === characterId))
        .filter((candidate: any) => candidate && candidate.type !== "group");
}

function buildCurrentCharacterDescription(character: any, database: any): string {
    const primary = buildCharacterDescription(character);
    if (character?.type !== "group" || !Array.isArray(character.characters)) return primary;
    const members = groupMembers(character, database);
    if (members.length === 0) return primary;
    return `${primary}\n\n${members.map((member: any, index: number) => `[Group Member ${index + 1}]\n${buildCharacterDescription(member)}`).join("\n\n")}`;
}

function buildCurrentCharacterOther(character: any, database: any): string {
    const blocks: string[] = [];
    const primary = buildCharacterOther(character);
    if (primary) blocks.push(primary);
    for (const [index, member] of groupMembers(character, database).entries()) {
        const other = buildCharacterOther(member);
        if (other) blocks.push(`[Group Member ${index + 1}: ${String(member.name || "Unnamed")}]\n${other}`);
    }
    return blocks.join("\n\n");
}

function resolvePersona(database: any, chat: any): string {
    const persona = selectedPersona(database, chat);
    if (!persona) return "No persona description was available or database permission was not granted.";
    const parts: string[] = [];
    appendField(parts, "Persona Name", persona.name);
    appendField(parts, "Persona Description", persona.personaPrompt);
    return parts.join("\n\n") || "The selected persona has no description.";
}

function collectLongTermMemories(chat: any): string[] {
    const memories: string[] = [];
    const seen = new Set<string>();
    const add = (label: string, text: unknown) => {
        if (typeof text !== "string" || !text.trim()) return;
        const normalized = text.trim();
        if (seen.has(normalized)) return;
        seen.add(normalized);
        memories.push(`[${label}]\n${normalized}`);
    };

    if (Array.isArray(chat?.hypaV3Data?.summaries)) {
        chat.hypaV3Data.summaries.forEach((summary: any, index: number) => add(`HypaMemory V3 #${index + 1}`, summary?.text));
    }
    if (Array.isArray(chat?.hypaV2Data?.mainChunks)) {
        chat.hypaV2Data.mainChunks.forEach((chunk: any, index: number) => add(`HypaMemory V2 #${index + 1}`, chunk?.text));
    }
    add("SupaMemory", chat?.supaMemoryData);
    return memories;
}

function usableChatMessages(chat: any): any[] {
    const raw = Array.isArray(chat?.message) ? chat.message : [];
    let startIndex = 0;
    for (let index = 0; index < raw.length; index++) {
        if (raw[index]?.disabled === "allBefore") startIndex = index + 1;
    }
    return raw.slice(startIndex).filter((message: any) => message && message.disabled !== true && !message.isComment && typeof message.data === "string");
}

function chatMessageSettingsKey(identity: SessionIdentity): string {
    return `${encodeURIComponent(identity.characterId)}:${encodeURIComponent(identity.chatId)}`;
}

function stableChatMessageKey(message: any, occurrences: Map<string, number>): string {
    const explicitId = typeof message?.chatId === "string" && message.chatId.trim() ? message.chatId.trim() : "";
    const signature = explicitId
        ? `id:${message.role === "user" ? "user" : "char"}:${explicitId}`
        : `fallback:${message.role === "user" ? "user" : "char"}:${String(message?.time ?? "")}:${hashText(String(message?.data ?? ""))}`;
    const occurrence = (occurrences.get(signature) ?? 0) + 1;
    occurrences.set(signature, occurrence);
    return `${signature}:${occurrence}`;
}

function buildChatHistory(
    identity: SessionIdentity,
    environment: CbsEnvironment,
    compiledRegex: CompiledContextRegex[],
): {
    text: string;
    totalText: string;
    total: number;
    included: number;
    searchable: string[];
    messages: ChatHistoryMessageView[];
    warnings: string[];
} {
    const usable = usableChatMessages(identity.chat);
    const storageKey = chatMessageSettingsKey(identity);
    const excluded = new Set(settings.chatMessageExclusions[storageKey] ?? []);
    const occurrences = new Map<string, number>();
    const messages: ChatHistoryMessageView[] = [];
    const searchable: string[] = [];
    const warnings: string[] = [];

    for (const message of usable) {
        const role: ChatHistoryMessageView["role"] = message.role === "user" ? "user" : "char";
        const speaker = role === "user" ? environment.userName : environment.charName;
        const key = stableChatMessageKey(message, occurrences);
        const rawText = String(message.data ?? "");
        const cbsReference = processCbsReference(rawText, environment, omitsUnsupportedSyntax("chatHistory"));
        const processed = applyRegexToReference(cbsReference, compiledRegex);
        const searchText = processCbsText(rawText, environment, omitsUnsupportedSyntax("chatHistory"));
        searchable.push(searchText.text);
        warnings.push(...cbsReference.warnings, ...searchText.warnings);
        messages.push({
            key,
            role,
            speaker,
            text: processed.text,
            rawText,
            displayHtml: processed.html,
            warnings: uniqueWarnings([...cbsReference.warnings, ...searchText.warnings]),
            enabled: !excluded.has(key),
            tokenEstimate: estimateTokenCount(`${speaker}:\n${processed.text}`),
            rawTokenEstimate: estimateTokenCount(`${speaker}:\n${rawText}`),
        });
    }

    const validKeys = new Set(messages.map((message) => message.key));
    const retainedExclusions = [...excluded].filter((key) => validKeys.has(key));
    if (retainedExclusions.length !== excluded.size) {
        if (retainedExclusions.length > 0) settings.chatMessageExclusions[storageKey] = retainedExclusions;
        else delete settings.chatMessageExclusions[storageKey];
        scheduleSettingsSave();
    }
    const line = (message: ChatHistoryMessageView, raw: boolean) => `${message.speaker}:\n${raw ? message.rawText : message.text}`;
    return {
        text: messages.filter((message) => message.enabled).map((message) => line(message, false)).join("\n\n"),
        totalText: messages.map((message) => line(message, true)).join("\n\n"),
        total: messages.length,
        included: messages.filter((message) => message.enabled).length,
        searchable,
        messages,
        warnings: uniqueWarnings(warnings),
    };
}
