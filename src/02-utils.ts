function safeClone<T>(value: T): T {
    try {
        return structuredClone(value);
    } catch {
        return JSON.parse(JSON.stringify(value)) as T;
    }
}

function uuid(): string {
    return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function isLoreMode(value: unknown): value is LoreMode {
    return value === "on" || value === "off" || value === "auto";
}

function isModelMode(value: unknown): value is WriterModelMode {
    return value === "model" || value === "submodel";
}

function escapeHtml(value: unknown): string {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function renderPlainText(value: string): string {
    return escapeHtml(value).replace(/\n/g, "<br>");
}

async function copyTextToClipboard(value: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(value);
            return;
        } catch {
            // Fall back to a selection-based copy for restricted iframe contexts.
        }
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    let copied = false;
    try {
        textarea.focus();
        textarea.select();
        copied = document.execCommand("copy");
    } finally {
        textarea.remove();
    }
    if (!copied) throw new Error("클립보드에 복사할 수 없습니다.");
}

function isSafeMarkdownLink(value: string): boolean {
    const link = value.trim().toLocaleLowerCase();
    return link.startsWith("https://") || link.startsWith("http://") || link.startsWith("mailto:") || link.startsWith("#");
}

type MarkdownRenderRule = (tokens: any[], index: number, options: any, env: any, self: any) => string;

const markdownRenderer = summonAuthorMarkdownParser({
    html: false,
    linkify: true,
    typographer: false,
    breaks: false,
});

markdownRenderer.validateLink = isSafeMarkdownLink;

markdownRenderer.core.ruler.after("inline", "summon_author_task_lists", (state: any): void => {
    for (let index = 2; index < state.tokens.length; index++) {
        const inlineToken = state.tokens[index];
        const paragraphToken = state.tokens[index - 1];
        const listItemToken = state.tokens[index - 2];
        if (inlineToken.type !== "inline" || paragraphToken.type !== "paragraph_open" || listItemToken.type !== "list_item_open") continue;
        const firstChild = inlineToken.children?.[0];
        if (firstChild?.type !== "text") continue;
        const taskMarker = firstChild.content.match(/^\[([ xX])\][ \t]+/);
        if (!taskMarker) continue;

        firstChild.content = firstChild.content.slice(taskMarker[0].length);
        const checkbox = new state.Token("html_inline", "", 0);
        checkbox.content = `<input class="md-task-checkbox" type="checkbox" disabled${taskMarker[1].toLowerCase() === "x" ? " checked" : ""}>`;
        inlineToken.children.unshift(checkbox);
        listItemToken.attrJoin("class", "md-task-list-item");

        let closedListDepth = 0;
        for (let parentIndex = index - 3; parentIndex >= 0; parentIndex--) {
            const parentToken = state.tokens[parentIndex];
            if (parentToken.type === "bullet_list_close" || parentToken.type === "ordered_list_close") {
                closedListDepth++;
                continue;
            }
            if (parentToken.type === "bullet_list_open" || parentToken.type === "ordered_list_open") {
                if (closedListDepth > 0) {
                    closedListDepth--;
                    continue;
                }
                const classes = String(parentToken.attrGet("class") ?? "").split(/\s+/);
                if (!classes.includes("md-task-list")) parentToken.attrJoin("class", "md-task-list");
                break;
            }
        }
    }
});

const defaultMarkdownLinkOpen: MarkdownRenderRule = markdownRenderer.renderer.rules.link_open
    ?? ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));
markdownRenderer.renderer.rules.link_open = (tokens: any[], index: number, options: any, env: any, self: any): string => {
    tokens[index].attrSet("target", "_blank");
    tokens[index].attrSet("rel", "noopener noreferrer");
    return defaultMarkdownLinkOpen(tokens, index, options, env, self);
};

const defaultMarkdownImage: MarkdownRenderRule = markdownRenderer.renderer.rules.image;
markdownRenderer.renderer.rules.image = (tokens: any[], index: number, options: any, env: any, self: any): string => {
    tokens[index].attrSet("loading", "lazy");
    tokens[index].attrSet("decoding", "async");
    tokens[index].attrSet("referrerpolicy", "no-referrer");
    return defaultMarkdownImage(tokens, index, options, env, self);
};

markdownRenderer.renderer.rules.fence = (tokens: any[], index: number): string => {
    const token = tokens[index];
    const language = String(token.info ?? "").trim().split(/\s+/)[0] ?? "";
    const languageLabel = language ? `<span class="md-code-language">${escapeHtml(language)}</span>` : "";
    return `<div class="md-code-wrap">${languageLabel}<pre class="md-code-block"><code>${escapeHtml(token.content)}</code></pre></div>`;
};

markdownRenderer.renderer.rules.code_block = (tokens: any[], index: number): string => {
    return `<div class="md-code-wrap"><pre class="md-code-block"><code>${escapeHtml(tokens[index].content)}</code></pre></div>`;
};

function renderMarkdown(value: string): string {
    return markdownRenderer.render(value);
}

function cleanupWriterMarkdown(value: string): string {
    const stripEmphasis = (segment: string): string => {
        let result = segment;
        const before = "(^|[\\s\\(\\[\\{>\"'“‘])";
        const after = "(?=$|[\\s\\)\\]\\}.,!?;:\"'”’<])";
        result = result.replace(new RegExp(`${before}\\*{3}(?=\\S)([^*\\n]*?\\S)\\*{3}${after}`, "g"), "$1$2");
        result = result.replace(new RegExp(`${before}\\*{2}(?=\\S)([^*\\n]*?\\S)\\*{2}${after}`, "g"), "$1$2");
        result = result.replace(new RegExp(`${before}\\*(?=\\S)([^*\\n]*?\\S)\\*${after}`, "g"), "$1$2");
        return result;
    };
    const cleanOutsideInlineCode = (line: string): string => {
        let output = "";
        let position = 0;
        const code = /(`+)([^`\n]*?)\1/g;
        for (const match of line.matchAll(code)) {
            const index = match.index ?? 0;
            output += stripEmphasis(line.slice(position, index));
            output += match[0];
            position = index + match[0].length;
        }
        return output + stripEmphasis(line.slice(position));
    };

    const lines = value.replace(/\r\n?/g, "\n").split("\n");
    let fence: "`" | "~" | null = null;
    return lines.map((line) => {
        const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
        if (fence) {
            if (fenceMatch?.[1].startsWith(fence)) fence = null;
            return line;
        }
        if (fenceMatch) {
            fence = fenceMatch[1][0] as "`" | "~";
            return line;
        }

        const trailing = line.match(/[ \t]+$/)?.[0] ?? "";
        const trailingSpaces = Math.min(2, [...trailing].filter((character) => character === " ").length);
        let result = trailing ? line.slice(0, -trailing.length) : line;
        result = result.replace(/^(#{1,6})([^\s#])/, "$1 $2");
        result = result.replace(/^(#{1,6}\s+)(?:(?:\d+|[IVXLCDM]+)\.)\s+/i, "$1");
        result = result.replace(/^(#{1,6}\s+.+?):+$/, "$1");
        result = cleanOutsideInlineCode(result);
        return result + " ".repeat(trailingSpaces);
    }).join("\n");
}

function applyWriterMarkdownCleanup(value: string): string {
    return settings.writerMarkdownCleanup ? cleanupWriterMarkdown(value) : value;
}

function renderWriterMessageText(value: string): string {
    return settings.markdownEnabled ? renderMarkdown(value) : renderPlainText(value);
}

function hashText(value: string): string {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function estimateTokenCount(value: string): number {
    const text = value.trim();
    if (!text) return 0;
    const cjk = (text.match(/[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length;
    const withoutCjk = text.replace(/[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu, " ");
    const latinWords = withoutCjk.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];
    const wordTokens = latinWords.reduce((total, word) => total + Math.max(1, Math.ceil(word.length / 4)), 0);
    const punctuation = (withoutCjk.match(/[^\s\p{L}\p{N}]/gu) ?? []).length;
    return Math.max(1, Math.ceil(cjk * 1.15 + wordTokens + punctuation * 0.35));
}

function currentBotDisplayName(): string {
    const name = String(currentIdentity?.character?.name ?? "").trim();
    return name || "현재 봇";
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nextBotRoomName(workspace: BotWorkspace): string {
    const base = `${currentBotDisplayName()} 회의실`;
    const pattern = new RegExp(`^${escapeRegExp(base)}\\s+(\\d+)$`);
    const used = new Set<number>();
    for (const room of workspace.rooms) {
        const match = room.name.match(pattern);
        if (match) used.add(Number(match[1]));
    }
    let number = 1;
    while (used.has(number)) number++;
    return `${base} ${number}`;
}

function writerMemoFolderName(): string {
    return `${currentBotDisplayName()} 메모`;
}
