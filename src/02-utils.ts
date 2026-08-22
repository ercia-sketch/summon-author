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

function isSafeMarkdownLink(value: string): boolean {
    const link = value.trim().toLocaleLowerCase();
    return link.startsWith("https://") || link.startsWith("http://") || link.startsWith("mailto:") || link.startsWith("#");
}

function renderMarkdownInline(value: string): string {
    const protectedHtml: string[] = [];
    const protect = (html: string): string => {
        const token = `\u0001${protectedHtml.length}\u0002`;
        protectedHtml.push(html);
        return token;
    };
    let working = value.replace(/`([^`\n]+)`/g, (_match, code: string) => protect(`<code>${escapeHtml(code)}</code>`));
    working = working.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (match, label: string, href: string) => {
        if (!isSafeMarkdownLink(href)) return match;
        return protect(`<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`);
    });
    working = escapeHtml(working)
        .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
        .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
        .replace(/~~([^~\n]+)~~/g, "<del>$1</del>")
        .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
        .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");
    return working.replace(/\u0001(\d+)\u0002/g, (_match, index: string) => protectedHtml[Number(index)] ?? "");
}

function isMarkdownBlockStart(line: string): boolean {
    return /^\s*```/.test(line)
        || /^\s{0,3}#{1,6}\s+/.test(line)
        || /^\s*>\s?/.test(line)
        || /^\s*[-+*]\s+/.test(line)
        || /^\s*\d+[.)]\s+/.test(line)
        || /^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line);
}

function renderMarkdown(value: string): string {
    const lines = value.replace(/\r\n?/g, "\n").split("\n");
    const html: string[] = [];
    let index = 0;
    while (index < lines.length) {
        const line = lines[index];
        if (!line.trim()) {
            index++;
            continue;
        }
        const fence = line.match(/^\s*```\s*([^\s`]*)\s*$/);
        if (fence) {
            const code: string[] = [];
            index++;
            while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) code.push(lines[index++]);
            if (index < lines.length) index++;
            const language = fence[1] ? `<span class="md-code-language">${escapeHtml(fence[1])}</span>` : "";
            html.push(`<div class="md-code-wrap">${language}<pre class="md-code-block"><code>${escapeHtml(code.join("\n"))}</code></pre></div>`);
            continue;
        }
        const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
        if (heading) {
            const level = heading[1].length;
            html.push(`<h${level}>${renderMarkdownInline(heading[2])}</h${level}>`);
            index++;
            continue;
        }
        if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
            html.push("<hr>");
            index++;
            continue;
        }
        if (/^\s*>\s?/.test(line)) {
            const quoted: string[] = [];
            while (index < lines.length && /^\s*>\s?/.test(lines[index])) quoted.push(lines[index++].replace(/^\s*>\s?/, ""));
            html.push(`<blockquote>${quoted.map(renderMarkdownInline).join("<br>")}</blockquote>`);
            continue;
        }
        const unordered = line.match(/^\s*[-+*]\s+(.+)$/);
        const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
        if (unordered || ordered) {
            const orderedList = Boolean(ordered);
            const items: string[] = [];
            const pattern = orderedList ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-+*]\s+(.+)$/;
            while (index < lines.length) {
                const item = lines[index].match(pattern);
                if (!item) break;
                items.push(`<li>${renderMarkdownInline(item[1])}</li>`);
                index++;
            }
            const tag = orderedList ? "ol" : "ul";
            html.push(`<${tag}>${items.join("")}</${tag}>`);
            continue;
        }
        const paragraph: string[] = [];
        while (index < lines.length && lines[index].trim() && (paragraph.length === 0 || !isMarkdownBlockStart(lines[index]))) {
            paragraph.push(lines[index++]);
        }
        html.push(`<p>${paragraph.map(renderMarkdownInline).join("<br>")}</p>`);
    }
    return html.join("");
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
