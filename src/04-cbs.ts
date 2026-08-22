function uniqueWarnings(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function cbsTruthy(value: string): boolean {
    return value === "1" || value === "true";
}

function cbsVariable(environment: CbsEnvironment, key: string): string {
    return environment.variables[key] ?? "null";
}

function isEscapedAt(text: string, index: number): boolean {
    let slashes = 0;
    for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor--) slashes++;
    return slashes % 2 === 1;
}

function findNextCbsStart(text: string, from: number): number {
    let index = text.indexOf("{{", from);
    while (index >= 0 && isEscapedAt(text, index)) index = text.indexOf("{{", index + 2);
    return index;
}

function readCbsToken(text: string, start: number): { inner: string; raw: string; end: number } | null {
    if (text.slice(start, start + 2) !== "{{") return null;
    let depth = 1;
    let cursor = start + 2;
    while (cursor < text.length - 1) {
        if (text.slice(cursor, cursor + 2) === "{{" && !isEscapedAt(text, cursor)) {
            depth++;
            cursor += 2;
            continue;
        }
        if (text.slice(cursor, cursor + 2) === "}}" && !isEscapedAt(text, cursor)) {
            depth--;
            cursor += 2;
            if (depth === 0) return {
                inner: text.slice(start + 2, cursor - 2),
                raw: text.slice(start, cursor),
                end: cursor,
            };
            continue;
        }
        cursor++;
    }
    return null;
}

function cbsSyntaxName(inner: string): string {
    const trimmed = inner.trim();
    const command = trimmed.startsWith("#")
        ? trimmed.slice(1).split(/[\s:]/u, 1)[0]
        : trimmed.split(/[:\s]/u, 1)[0];
    const safe = command.slice(0, 40) || "알 수 없는 구문";
    return trimmed.startsWith("#") ? `{{#${safe}}}` : `{{${safe}}}`;
}

function evaluateCbsInline(inner: string, raw: string, environment: CbsEnvironment): { text: string; warning?: string } {
    const trimmed = inner.trim();
    const parts = trimmed.split("::");
    const command = parts.shift()?.trim().toLocaleLowerCase() ?? "";
    const args = parts;
    const bool = (value: boolean) => value ? "1" : "0";
    switch (command) {
        case "getvar": return { text: cbsVariable(environment, args[0] ?? "") };
        case "char":
        case "bot": return { text: environment.charName };
        case "user": return { text: environment.userName };
        case "blank": return { text: "" };
        case "none": return { text: "" };
        case "br": return { text: "\n" };
        case "newline": return { text: "\n" };
        case "equal": return { text: bool((args[0] ?? "") === (args[1] ?? "")) };
        case "notequal":
        case "not_equal": return { text: bool((args[0] ?? "") !== (args[1] ?? "")) };
        case "greater": return { text: bool(Number(args[0]) > Number(args[1])) };
        case "less": return { text: bool(Number(args[0]) < Number(args[1])) };
        case "greaterequal":
        case "greater_equal": return { text: bool(Number(args[0]) >= Number(args[1])) };
        case "lessequal":
        case "less_equal": return { text: bool(Number(args[0]) <= Number(args[1])) };
        // RisuAI's inline boolean functions treat only the literal "1" as true.
        case "and": return { text: bool((args[0] ?? "") === "1" && (args[1] ?? "") === "1") };
        case "or": return { text: bool((args[0] ?? "") === "1" || (args[1] ?? "") === "1") };
        case "not": return { text: bool((args[0] ?? "") !== "1") };
        case "contains": return { text: bool((args[0] ?? "").includes(args[1] ?? "")) };
        case "startswith": return { text: bool((args[0] ?? "").startsWith(args[1] ?? "")) };
        case "endswith": return { text: bool((args[0] ?? "").endsWith(args[1] ?? "")) };
        case "replace": return { text: (args[0] ?? "").split(args[1] ?? "").join(args[2] ?? "") };
        case "trim": return { text: (args[0] ?? "").trim() };
        case "length": return { text: String((args[0] ?? "").length) };
        case "lower": return { text: (args[0] ?? "").toLocaleLowerCase() };
        case "upper": return { text: (args[0] ?? "").toLocaleUpperCase() };
        case "capitalize": {
            const value = args[0] ?? "";
            return { text: value.charAt(0).toLocaleUpperCase() + value.slice(1) };
        }
        case "round": return { text: String(Math.round(Number(args[0]))) };
        case "floor": return { text: String(Math.floor(Number(args[0]))) };
        case "ceil": return { text: String(Math.ceil(Number(args[0]))) };
        case "abs": return { text: String(Math.abs(Number(args[0]))) };
        case "tonumber": return { text: [...(args[0] ?? "")].filter((value) => !Number.isNaN(Number(value)) || value === ".").join("") };
        case "split": return { text: JSON.stringify((args[0] ?? "").split(args[1] ?? "")) };
        case "join": {
            try {
                const values = JSON.parse(args[0] ?? "[]");
                return { text: Array.isArray(values) ? values.join(args[1] ?? "") : "" };
            } catch {
                return { text: "" };
            }
        }
        case "arraylength":
        case "array_length": {
            try {
                const values = JSON.parse(args[0] ?? "[]");
                return { text: String(Array.isArray(values) ? values.length : 0) };
            } catch {
                return { text: "0" };
            }
        }
        case "//": return { text: "" };
        default: return { text: raw, warning: cbsSyntaxName(trimmed) };
    }
}

function resolveCbsHeaderInlines(value: string, environment: CbsEnvironment): CbsProcessResult {
    let output = "";
    const warnings: string[] = [];
    let position = 0;
    while (position < value.length) {
        const start = findNextCbsStart(value, position);
        if (start < 0) {
            output += value.slice(position);
            break;
        }
        output += value.slice(position, start);
        const token = readCbsToken(value, start);
        if (!token) {
            output += value.slice(start);
            warnings.push("닫히지 않은 {{...}} 구문");
            break;
        }
        const nested = resolveCbsHeaderInlines(token.inner, environment);
        warnings.push(...nested.warnings);
        const evaluated = evaluateCbsInline(nested.text, token.raw, environment);
        output += evaluated.text;
        if (evaluated.warning) warnings.push(evaluated.warning);
        position = token.end;
    }
    return { text: output, warnings: uniqueWarnings(warnings) };
}

function evaluateCbsWhen(header: string, environment: CbsEnvironment): { supported: boolean; active: boolean; keepWhitespace: boolean; warning?: string } {
    const trimmed = header.trim();
    if (trimmed.startsWith("#if_pure ")) {
        const state = trimmed.slice(9).split(" ", 1)[0];
        return { supported: true, active: cbsTruthy(state), keepWhitespace: true };
    }
    if (trimmed === "#if_pure") return { supported: false, active: false, keepWhitespace: true, warning: "잘못된 {{#if_pure}} 조건" };
    if (trimmed.startsWith("#if ")) {
        const state = trimmed.slice(4).split(" ", 1)[0];
        return { supported: true, active: cbsTruthy(state), keepWhitespace: false };
    }
    if (trimmed === "#if") return { supported: false, active: false, keepWhitespace: false, warning: "잘못된 {{#if}} 조건" };
    if (trimmed.startsWith("#when ")) {
        const state = trimmed.slice(6).split(" ", 1)[0];
        return { supported: true, active: cbsTruthy(state), keepWhitespace: false };
    }
    if (!trimmed.startsWith("#when::")) return { supported: false, active: false, keepWhitespace: false, warning: cbsSyntaxName(trimmed) };

    const statement = trimmed.slice(7).split("::");
    let keepWhitespace = false;
    while (statement.length > 1) {
        const condition = statement.pop() ?? "";
        const operator = (statement.pop() ?? "").toLocaleLowerCase();
        const pushBoolean = (value: boolean) => statement.push(value ? "1" : "0");
        switch (operator) {
            case "not": pushBoolean(!cbsTruthy(condition)); break;
            case "keep": keepWhitespace = true; statement.push(condition); break;
            case "legacy": statement.push(condition); break;
            case "and": pushBoolean(cbsTruthy(statement.pop() ?? "") && cbsTruthy(condition)); break;
            case "or": pushBoolean(cbsTruthy(statement.pop() ?? "") || cbsTruthy(condition)); break;
            case "is": pushBoolean((statement.pop() ?? "") === condition); break;
            case "isnot": pushBoolean((statement.pop() ?? "") !== condition); break;
            case "var": pushBoolean(cbsTruthy(cbsVariable(environment, condition))); break;
            case "vis": pushBoolean(cbsVariable(environment, statement.pop() ?? "") === condition); break;
            case "visnot": pushBoolean(cbsVariable(environment, statement.pop() ?? "") !== condition); break;
            case ">": pushBoolean(Number(statement.pop()) > Number(condition)); break;
            case "<": pushBoolean(Number(statement.pop()) < Number(condition)); break;
            case ">=": pushBoolean(Number(statement.pop()) >= Number(condition)); break;
            case "<=": pushBoolean(Number(statement.pop()) <= Number(condition)); break;
            case "toggle":
            case "tis":
            case "tisnot": return { supported: false, active: false, keepWhitespace, warning: `{{#when:${operator}}}` };
            default: return { supported: false, active: false, keepWhitespace, warning: `지원하지 않는 #when 연산자 “${operator || "없음"}”` };
        }
    }
    if (statement.length !== 1) return { supported: false, active: false, keepWhitespace, warning: "잘못된 {{#when}} 조건" };
    return { supported: true, active: cbsTruthy(statement[0]), keepWhitespace };
}

interface CbsSequenceResult extends CbsProcessResult {
    position: number;
    stop: "else" | "close" | null;
}

function parseCbsSequence(text: string, from: number, environment: CbsEnvironment, stopOnControl: boolean, omitUnsupported = false): CbsSequenceResult {
    let output = "";
    const warnings: string[] = [];
    let position = from;
    while (position < text.length) {
        const start = findNextCbsStart(text, position);
        if (start < 0) {
            output += text.slice(position);
            return { text: output, warnings: uniqueWarnings(warnings), position: text.length, stop: null };
        }
        output += text.slice(position, start);
        const token = readCbsToken(text, start);
        if (!token) {
            if (!omitUnsupported) output += text.slice(start);
            warnings.push("닫히지 않은 {{...}} 구문");
            return { text: output, warnings: uniqueWarnings(warnings), position: text.length, stop: null };
        }
        const header = resolveCbsHeaderInlines(token.inner, environment);
        warnings.push(...header.warnings);
        const trimmed = header.text.trim();
        if (trimmed === ":else" || trimmed.startsWith("/")) {
            if (stopOnControl) return {
                text: output,
                warnings: uniqueWarnings(warnings),
                position: token.end,
                stop: trimmed === ":else" ? "else" : "close",
            };
            if (!omitUnsupported) output += token.raw;
            warnings.push(trimmed === ":else" ? "짝이 없는 {{:else}}" : "짝이 없는 {{/}}");
            position = token.end;
            continue;
        }
        if (trimmed.startsWith("#")) {
            const condition = evaluateCbsWhen(trimmed, environment);
            if (condition.warning) warnings.push(condition.warning);
            const truthyBranch = parseCbsSequence(text, token.end, environment, true, omitUnsupported);
            warnings.push(...truthyBranch.warnings);
            let falsyBranch: CbsSequenceResult | null = null;
            let blockEnd = truthyBranch.position;
            let closed = truthyBranch.stop === "close";
            if (truthyBranch.stop === "else") {
                falsyBranch = parseCbsSequence(text, truthyBranch.position, environment, true, omitUnsupported);
                warnings.push(...falsyBranch.warnings);
                blockEnd = falsyBranch.position;
                closed = falsyBranch.stop === "close";
            }
            if (!closed) {
                if (!omitUnsupported) output += text.slice(start, blockEnd);
                warnings.push(`닫히지 않은 ${cbsSyntaxName(trimmed)} 블록`);
                position = blockEnd;
                continue;
            }
            if (!condition.supported || header.warnings.length > 0) {
                if (!omitUnsupported) output += text.slice(start, blockEnd);
            } else {
                const selected = condition.active ? truthyBranch.text : falsyBranch?.text ?? "";
                output += condition.keepWhitespace ? selected : selected.trim();
            }
            position = blockEnd;
            continue;
        }
        const inline = evaluateCbsInline(header.text, token.raw, environment);
        if (!inline.warning || !omitUnsupported) output += inline.text;
        if (inline.warning) warnings.push(inline.warning);
        position = token.end;
    }
    return { text: output, warnings: uniqueWarnings(warnings), position, stop: null };
}

function processCbsText(value: string, environment: CbsEnvironment, omitUnsupported = false): CbsProcessResult {
    const parsed = parseCbsSequence(value, 0, environment, false, omitUnsupported);
    const warnings = [...parsed.warnings];
    if (/\{#[\s\S]*?#\}/u.test(value)) warnings.push("레거시 {#...#} 조건문");
    const text = omitUnsupported ? parsed.text.replace(/\{#[\s\S]*?#\}/gu, "") : parsed.text;
    return { text, warnings: uniqueWarnings(warnings) };
}

interface CbsDisplayResult {
    html: string;
    warnings: string[];
}

interface CbsDisplaySequenceResult extends CbsDisplayResult {
    position: number;
    stop: "else" | "close" | null;
    controlRaw: string;
}

function parseCbsDisplaySequence(text: string, from: number, environment: CbsEnvironment, stopOnControl: boolean, forceFalse = false): CbsDisplaySequenceResult {
    let html = "";
    const warnings: string[] = [];
    let position = from;
    while (position < text.length) {
        const start = findNextCbsStart(text, position);
        if (start < 0) {
            html += escapeHtml(text.slice(position));
            return { html, warnings: uniqueWarnings(warnings), position: text.length, stop: null, controlRaw: "" };
        }
        html += escapeHtml(text.slice(position, start));
        const token = readCbsToken(text, start);
        if (!token) {
            html += escapeHtml(text.slice(start));
            warnings.push("닫히지 않은 {{...}} 구문");
            return { html, warnings: uniqueWarnings(warnings), position: text.length, stop: null, controlRaw: "" };
        }
        const header = resolveCbsHeaderInlines(token.inner, environment);
        warnings.push(...header.warnings);
        const trimmed = header.text.trim();
        if (trimmed === ":else" || trimmed.startsWith("/")) {
            if (stopOnControl) return {
                html,
                warnings: uniqueWarnings(warnings),
                position: token.end,
                stop: trimmed === ":else" ? "else" : "close",
                controlRaw: token.raw,
            };
            html += `<span class="cbs-unsupported-fragment">${escapeHtml(token.raw)}</span>`;
            warnings.push(trimmed === ":else" ? "짝이 없는 {{:else}}" : "짝이 없는 {{/}}");
            position = token.end;
            continue;
        }
        if (trimmed.startsWith("#")) {
            const condition = evaluateCbsWhen(trimmed, environment);
            if (condition.warning) warnings.push(condition.warning);
            const unsupported = !condition.supported || header.warnings.length > 0;
            const truthyBranch = parseCbsDisplaySequence(text, token.end, environment, true, forceFalse || unsupported || !condition.active);
            warnings.push(...truthyBranch.warnings);
            let falsyBranch: CbsDisplaySequenceResult | null = null;
            let blockEnd = truthyBranch.position;
            let closed = truthyBranch.stop === "close";
            if (truthyBranch.stop === "else") {
                falsyBranch = parseCbsDisplaySequence(text, truthyBranch.position, environment, true, forceFalse || unsupported || condition.active);
                warnings.push(...falsyBranch.warnings);
                blockEnd = falsyBranch.position;
                closed = falsyBranch.stop === "close";
            }
            if (!closed) {
                html += `<span class="cbs-unsupported-fragment">${escapeHtml(text.slice(start, blockEnd))}</span>`;
                warnings.push(`닫히지 않은 ${cbsSyntaxName(trimmed)} 블록`);
                position = blockEnd;
                continue;
            }
            const elseRaw = truthyBranch.stop === "else" ? truthyBranch.controlRaw : "";
            const closingRaw = (falsyBranch ?? truthyBranch).controlRaw;
            if (unsupported) {
                html += `<span class="cbs-unsupported-fragment">${escapeHtml(text.slice(start, blockEnd))}</span>`;
            } else if (forceFalse) {
                html += `<div class="cbs-false-block"><span class="cbs-if-false-marker cbs-toggle">${escapeHtml(token.raw)}</span><span class="cbs-collapsible" style="display:none"><span class="cbs-if-false-content">${truthyBranch.html}</span>`;
                if (falsyBranch) {
                    html += `<span class="cbs-if-false-marker">${escapeHtml(elseRaw)}</span><span class="cbs-if-false-content">${falsyBranch.html}</span>`;
                }
                html += `<span class="cbs-if-false-marker">${escapeHtml(closingRaw)}</span></span></div>`;
            } else if (condition.active) {
                html += `<span class="cbs-if-true-marker">${escapeHtml(token.raw)}</span><span class="cbs-if-true-content">${truthyBranch.html}</span>`;
                if (falsyBranch) {
                    html += `<div class="cbs-false-block"><span class="cbs-if-false-marker cbs-toggle">${escapeHtml(elseRaw)}</span><span class="cbs-collapsible" style="display:none"><span class="cbs-if-false-content">${falsyBranch.html}</span></span></div>`;
                }
                html += `<span class="cbs-if-true-marker">${escapeHtml(closingRaw)}</span>`;
            } else {
                html += `<div class="cbs-false-block"><span class="cbs-if-false-marker cbs-toggle">${escapeHtml(token.raw)}</span><span class="cbs-collapsible" style="display:none"><span class="cbs-if-false-content">${truthyBranch.html}</span>`;
                if (falsyBranch) {
                    html += `</span></div><span class="cbs-if-true-marker">${escapeHtml(elseRaw)}</span><span class="cbs-if-true-content">${falsyBranch.html}</span><span class="cbs-if-true-marker">${escapeHtml(closingRaw)}</span>`;
                } else {
                    html += `<span class="cbs-if-false-marker">${escapeHtml(closingRaw)}</span></span></div>`;
                }
            }
            position = blockEnd;
            continue;
        }
        const inline = evaluateCbsInline(header.text, token.raw, environment);
        if (inline.warning) {
            html += `<span class="cbs-unsupported-fragment">${escapeHtml(token.raw)}</span>`;
            warnings.push(inline.warning);
        } else {
            html += `<span class="cbs-inline-result">${escapeHtml(inline.text)}</span>`;
        }
        position = token.end;
    }
    return { html, warnings: uniqueWarnings(warnings), position, stop: null, controlRaw: "" };
}

function processCbsDisplay(value: string, environment: CbsEnvironment): CbsDisplayResult {
    const parsed = parseCbsDisplaySequence(value, 0, environment, false);
    const warnings = [...parsed.warnings];
    if (/\{#[\s\S]*?#\}/u.test(value)) warnings.push("레거시 {#...#} 조건문");
    return { html: parsed.html, warnings: uniqueWarnings(warnings) };
}

function processCbsReference(value: string, environment: CbsEnvironment, omitUnsupported = false): CbsReferenceResult {
    const processed = processCbsText(value, environment, omitUnsupported);
    const display = processCbsDisplay(value, environment);
    return {
        text: processed.text,
        html: display.html,
        warnings: uniqueWarnings([...processed.warnings, ...display.warnings]),
    };
}
