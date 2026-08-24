interface CompiledContextRegex {
    script: ContextRegexScript;
    regex: RegExp;
}

function validateContextRegexScripts(): CompiledContextRegex[] {
    contextRegexErrors.clear();
    const compiled: CompiledContextRegex[] = [];
    for (const script of settings.contextRegexScripts) {
        if (!script.enabled) continue;
        if (!script.input) continue;
        try {
            compiled.push({ script, regex: new RegExp(script.input, "g") });
        } catch (error) {
            contextRegexErrors.set(script.id, errorMessage(error));
        }
    }
    return compiled;
}

function expandRegexReplacement(template: string, match: RegExpExecArray, source: string): string {
    return template.replace(/\$(\$|&|`|'|<[^>]+>|\d{1,2})/g, (token, code: string) => {
        if (code === "$") return "$";
        if (code === "&") return match[0];
        if (code === "`") return source.slice(0, match.index);
        if (code === "'") return source.slice(match.index + match[0].length);
        if (code.startsWith("<") && code.endsWith(">")) {
            const name = code.slice(1, -1);
            return match.groups && Object.prototype.hasOwnProperty.call(match.groups, name) ? match.groups[name] ?? "" : token;
        }
        const index = Number.parseInt(code, 10);
        if (!Number.isFinite(index) || index <= 0) return token;
        if (index < match.length) return match[index] ?? "";
        if (code.length === 2) {
            const first = Number.parseInt(code[0], 10);
            if (first > 0 && first < match.length) return `${match[first] ?? ""}${code[1]}`;
        }
        return token;
    });
}

function sliceRegexSegments(segments: RegexDisplaySegment[], start: number, end: number, includeEndEmpty = false): RegexDisplaySegment[] {
    const sliced: RegexDisplaySegment[] = [];
    let position = 0;
    for (const segment of segments) {
        const segmentStart = position;
        const segmentEnd = position + segment.text.length;
        if (segment.text.length === 0) {
            if (segmentStart >= start && (segmentStart < end || (includeEndEmpty && segmentStart === end))) sliced.push(segment);
            continue;
        }
        const overlapStart = Math.max(start, segmentStart);
        const overlapEnd = Math.min(end, segmentEnd);
        if (overlapStart < overlapEnd) {
            sliced.push({ ...segment, text: segment.text.slice(overlapStart - segmentStart, overlapEnd - segmentStart) });
        }
        position = segmentEnd;
    }
    return sliced;
}

function applyCompiledRegexScripts(value: string, compiled: CompiledContextRegex[]): { text: string; segments: RegexDisplaySegment[]; changed: boolean } {
    let segments: RegexDisplaySegment[] = [{ text: value }];
    let changed = false;
    for (const { script, regex } of compiled) {
        const source = segments.map((segment) => segment.text).join("");
        regex.lastIndex = 0;
        const output: RegexDisplaySegment[] = [];
        let cursor = 0;
        let matched = false;
        while (true) {
            const match = regex.exec(source);
            if (!match) break;
            matched = true;
            output.push(...sliceRegexSegments(segments, cursor, match.index));
            const replacement = expandRegexReplacement(script.output, match, source);
            output.push({
                text: replacement,
                trace: {
                    ruleId: script.id,
                    ruleName: script.name.trim() || "이름 없는 정규식",
                    input: script.input,
                    original: match[0],
                    deleted: script.output === "",
                },
            });
            cursor = match.index + match[0].length;
            if (match[0].length === 0) regex.lastIndex = Math.min(source.length + 1, regex.lastIndex + 1);
        }
        if (!matched) continue;
        output.push(...sliceRegexSegments(segments, cursor, source.length, true));
        segments = output;
        changed = true;
    }
    return { text: segments.map((segment) => segment.text).join(""), segments, changed };
}

function renderRegexDisplaySegments(segments: RegexDisplaySegment[]): string {
    return segments.map((segment) => {
        if (!segment.trace) return escapeHtml(segment.text);
        const trace = segment.trace;
        const title = `${trace.ruleName}\nIN: ${trace.input}`;
        const result = trace.deleted ? "[정규식에 의해 컨텍스트에서 제외]" : segment.text;
        const original = trace.original || "[빈 문자열]";
        return `<button data-action="toggle-regex-trace" class="regex-trace ${trace.deleted ? "deleted" : "replaced"}" title="${escapeHtml(title)}"><span data-regex-result>${escapeHtml(result)}</span><span data-regex-original hidden>${escapeHtml(original)}</span></button>`;
    }).join("");
}

function applyRegexToReference(reference: CbsReferenceResult, compiled: CompiledContextRegex[], protectGeneratedHeadings = false, protectLoreSettings = false): ProcessedWriterReference {
    let transformed: { text: string; segments: RegexDisplaySegment[]; changed: boolean };
    if (!protectGeneratedHeadings && !protectLoreSettings) {
        transformed = applyCompiledRegexScripts(reference.text, compiled);
    } else {
        const splitPattern = protectGeneratedHeadings && protectLoreSettings
            ? /(^\[[^\]\n]+\]\n?|^\s*@@@?[a-z_]+(?:\s+[^\n]*)?\n?)/gimu
            : protectGeneratedHeadings
                ? /(^\[[^\]\n]+\]\n?)/gmu
                : /(^\s*@@@?[a-z_]+(?:\s+[^\n]*)?\n?)/gimu;
        const protectedPattern = protectGeneratedHeadings && protectLoreSettings
            ? /^(?:\[[^\]\n]+\]|\s*@@@?[a-z_]+(?:\s+[^\n]*)?)\n?$/imu
            : protectGeneratedHeadings
                ? /^\[[^\]\n]+\]\n?$/u
                : /^\s*@@@?[a-z_]+(?:\s+[^\n]*)?\n?$/imu;
        const parts = reference.text.split(splitPattern).filter((part) => part !== "");
        const segments: RegexDisplaySegment[] = [];
        let changed = false;
        for (const part of parts) {
            if (protectedPattern.test(part)) {
                segments.push({ text: part });
                continue;
            }
            const processed = applyCompiledRegexScripts(part, compiled);
            segments.push(...processed.segments);
            changed ||= processed.changed;
        }
        transformed = { text: segments.map((segment) => segment.text).join(""), segments, changed };
    }
    return {
        ...reference,
        text: transformed.text,
        html: transformed.changed ? renderRegexDisplaySegments(transformed.segments) : reference.html,
        regexSegments: transformed.segments,
        regexChanged: transformed.changed,
    };
}

function processWriterReference(value: string, environment: CbsEnvironment, omitUnsupported: boolean, compiled: CompiledContextRegex[], protectGeneratedHeadings = false): ProcessedWriterReference {
    return applyRegexToReference(processCbsReference(value, environment, omitUnsupported), compiled, protectGeneratedHeadings);
}
