const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

(async () => {
const artifactPath = path.join(__dirname, "..", "summon_author_v1.1.4.js");
const source = fs.readFileSync(artifactPath, "utf8");
const initializeMarker = source.lastIndexOf("void initialize()");
assert.notEqual(initializeMarker, -1, "plugin initializer marker must exist");

function loadArtifactApi(risuai = {}) {
    const previousGlobalMarkdownParser = globalThis.markdownit;
    const globalMarkdownParserSentinel = () => "기존 전역 값";
    globalThis.markdownit = globalMarkdownParserSentinel;
    const api = new Function("Risuai", `${source.slice(0, initializeMarker)}\nreturn { renderMarkdown, normalizeContextRegexScript, normalizeWorkspace, memoBlock, orderedMemos, reorderMemoWithinFolder, renderMemoTitleLine, requestInitialPermissions, buildCharacterDescription, buildCurrentCharacterDescription, resolvePersona, buildReferenceMaterial, writerRequestMessages, renderContextDisplay, renderLoreCardsForScope, PANEL_Z_INDEX, RESIZE_LAYER_Z_INDEX, RESIZE_SHIELD_Z_INDEX, buildCbsEnvironment, processCbsText, compileRegexScripts: (scripts) => { settings.contextRegexScripts = scripts; return validateContextRegexScripts(); } };`)(risuai);
    assert.equal(globalThis.markdownit, globalMarkdownParserSentinel);
    if (previousGlobalMarkdownParser === undefined) delete globalThis.markdownit;
    else globalThis.markdownit = previousGlobalMarkdownParser;
    return api;
}

const api = loadArtifactApi();

assert.equal(api.buildCharacterDescription({}), "");
assert.equal(api.buildCurrentCharacterDescription({ type: "group", characters: [] }, { characters: [] }), "");
assert.equal(api.resolvePersona({ personas: [], selectedPersona: 0 }, {}), "");

const emptyWriterContext = {
    botCard: "",
    other: "",
    persona: "",
    memories: [],
    chatHistory: "",
    authorNote: "",
    replaceGlobalNote: "",
    firstMessages: [""],
    loreEntries: [],
    activeMemos: [],
};
assert.equal(api.buildReferenceMaterial(emptyWriterContext), "");
assert.equal(api.writerRequestMessages(emptyWriterContext, { writerMessages: [] }).length, 2);
assert.equal(api.buildReferenceMaterial({
    ...emptyWriterContext,
    loreEntries: [{ active: true, content: "   " }],
    activeMemos: [{ content: "\n\t" }],
}), "");

const characterOnlyReference = api.buildReferenceMaterial({ ...emptyWriterContext, botCard: "[Name]\nCharacter" });
assert.match(characterOnlyReference, /===== CHARACTER NAME AND DESCRIPTION =====\n\[Name\]\nCharacter/);
assert.doesNotMatch(characterOnlyReference, /PERSONA DESCRIPTION|LONG-TERM MEMORIES|PRIOR MAIN-CHAT CONTEXT|WRITER-FACING LOREBOOK|ACTIVE MEMOS/);

assert.equal(api.renderContextDisplay("", "페르소나 없음", []), '<span class="empty-context">페르소나 없음</span>');
assert.equal(api.renderLoreCardsForScope([], [], "캐릭터 로어북 없음"), '<div class="empty-context context-empty-block">캐릭터 로어북 없음</div>');
assert.doesNotMatch(source, /No character name or description was available\.|No persona description was available|The selected persona has no description\.|No long-term memory is stored for this chat\.|No Writer-facing lorebook entries are active\.|No active memos\./);
assert.match(source, /\.empty-context\s*\{\s*color:var\(--at-muted\);\s*font-style:normal;\s*\}/);

const cbsEnvironment = api.buildCbsEnvironment({
    character: { name: "Character", defaultVariables: "score=12px" },
    chat: {
        scriptstate: {},
        GLGlobalVariables: {
            toggle_enabled: "1",
            toggle_disabled: "0",
            toggle_first: "0",
            toggle_style: "2",
            toggle_text: "literary",
            local_note: "available",
            toggle_Mediken_Naoki: "1",
        },
    },
}, { personas: [], selectedPersona: 0 });

assert.equal(api.processCbsText("{{#when::toggle::enabled}}ON{{:else}}OFF{{/when}}", cbsEnvironment).text, "ON");
assert.equal(api.processCbsText("{{#when::toggle::disabled}}ON{{:else}}OFF{{/when}}", cbsEnvironment).text, "OFF");
assert.equal(api.processCbsText("{{#when::style::tis::2}}SELECTED{{/when}}", cbsEnvironment).text, "SELECTED");
assert.equal(api.processCbsText("{{#when::style::tisnot::1}}SELECTED{{/when}}", cbsEnvironment).text, "SELECTED");
assert.equal(api.processCbsText("{{#when::first::tis::0}}FIRST{{/when}}", cbsEnvironment).text, "FIRST");
assert.equal(api.processCbsText("{{#when::first::tisnot::0}}WRONG{{:else}}NOT-FIRST{{/when}}", cbsEnvironment).text, "NOT-FIRST");
assert.equal(api.processCbsText("{{#when::text::tis::literary}}TEXT{{/when}}", cbsEnvironment).text, "TEXT");
assert.equal(api.processCbsText("{{#when::{{getglobalvar::toggle_Mediken_Naoki}}}}LOCAL{{/when}}", cbsEnvironment).text, "LOCAL");
assert.equal(api.processCbsText("{{getglobalvar::local_note}}", cbsEnvironment).text, "available");
assert.equal(api.processCbsText("{{getglobalvar::toggle_disabled}}", cbsEnvironment).text, "0");
assert.equal(api.processCbsText("{{#when::{{getglobalvar::toggle_disabled}}}}ON{{:else}}OFF{{/when}}", cbsEnvironment).text, "OFF");
assert.equal(api.processCbsText("{{#when::1::and::toggle::enabled}}BOTH{{/when}}", cbsEnvironment).text, "BOTH");
assert.equal(api.processCbsText("{{#when::1::and::style::tis::2}}RIGHT-TO-LEFT{{/when}}", cbsEnvironment).text, "RIGHT-TO-LEFT");
assert.equal(api.processCbsText("{{#when::score::vis::12px}}VARIABLE{{/when}}", cbsEnvironment).text, "VARIABLE");
assert.equal(api.processCbsText("{{#when::12px::>::10px}}NUMBER{{/when}}", cbsEnvironment).text, "NUMBER");
assert.equal(api.processCbsText("{{#when::0::TIS::1}}UNKNOWN-OPERATOR{{/when}}", cbsEnvironment).text, "UNKNOWN-OPERATOR");

const unsupportedToggle = "{{#when::toggle::global_only}}UNKNOWN{{/when}}";
const unsupportedToggleResult = api.processCbsText(unsupportedToggle, cbsEnvironment);
assert.equal(unsupportedToggleResult.text, unsupportedToggle);
assert.deepEqual(unsupportedToggleResult.warnings, ["{{#when:toggle}}"]);
assert.equal(api.processCbsText(unsupportedToggle, cbsEnvironment, true).text, "");

const unsupportedSelect = "{{#when::global_style::tisnot::0}}UNKNOWN{{/when}}";
const unsupportedSelectResult = api.processCbsText(unsupportedSelect, cbsEnvironment);
assert.equal(unsupportedSelectResult.text, unsupportedSelect);
assert.deepEqual(unsupportedSelectResult.warnings, ["{{#when:tisnot}}"]);

const fallbackOnlyEnvironment = api.buildCbsEnvironment({
    character: {},
    chat: { GLGlobalVariables: { toggle_empty: "", toggle_null: "null", toggle_zero: "0" } },
}, { personas: [], selectedPersona: 0 });
assert.deepEqual(fallbackOnlyEnvironment.localGlobalVariables, { toggle_zero: "0" });
assert.deepEqual(api.processCbsText("{{#when::toggle::empty}}UNKNOWN{{/when}}", fallbackOnlyEnvironment).warnings, ["{{#when:toggle}}"]);
assert.equal(api.processCbsText("{{#when::zero::tis::0}}ZERO{{/when}}", fallbackOnlyEnvironment).text, "ZERO");

for (const unavailableKey of ["toggle_empty", "toggle_null", "toggle_missing"]) {
    const syntax = `{{getglobalvar::${unavailableKey}}}`;
    const result = api.processCbsText(syntax, fallbackOnlyEnvironment);
    assert.equal(result.text, syntax);
    assert.deepEqual(result.warnings, ["{{getglobalvar}}"]);
    assert.equal(api.processCbsText(syntax, fallbackOnlyEnvironment, true).text, "");
}

const unsupportedGlobalVariable = "{{#when::{{getglobalvar::toggle_global_only}}}}UNKNOWN{{/when}}";
const unsupportedGlobalVariableResult = api.processCbsText(unsupportedGlobalVariable, cbsEnvironment);
assert.equal(unsupportedGlobalVariableResult.text, unsupportedGlobalVariable);
assert.deepEqual(unsupportedGlobalVariableResult.warnings, ["{{getglobalvar}}"]);
assert.equal(api.processCbsText(unsupportedGlobalVariable, cbsEnvironment, true).text, "");

const cbsWhitespaceBody = "\n\n  C  \n  B  \n  S  \n\n";
assert.equal(api.processCbsText("{{#when 1}}SPACE{{/}}", cbsEnvironment).text, "SPACE");
assert.equal(api.processCbsText("{{#when::1}}SPACE{{/when}}", cbsEnvironment).text, "SPACE");
assert.equal(api.processCbsText("{{#when::1}}YES{{:else}}NO{{/}}", cbsEnvironment).text, "YES");
assert.equal(api.processCbsText("{{#when::0}}YES{{:else}}NO{{/}}", cbsEnvironment).text, "NO");
assert.equal(api.processCbsText("{{#when::1}}YES\n{{:else}}\nNO{{/}}", cbsEnvironment).text, "YES");
assert.equal(api.processCbsText("{{#when::0}}YES\n{{:else}}\nNO{{/}}", cbsEnvironment).text, "NO");
assert.equal(api.processCbsText("{{#when::1}}" + cbsWhitespaceBody + "{{/}}", cbsEnvironment).text, "  C  \n  B  \n  S  ");
assert.equal(api.processCbsText("{{#when::keep::1}}" + cbsWhitespaceBody + "{{/}}", cbsEnvironment).text, cbsWhitespaceBody);
assert.equal(api.processCbsText("{{#when::legacy::1}}" + cbsWhitespaceBody + "{{/}}", cbsEnvironment).text, "C  \nB  \nS");
assert.equal(api.processCbsText("{{#when::legacy::1}}TRUE\n{{:else}}\nFALSE{{/}}", cbsEnvironment).text, "TRUE\n{{:else}}\nFALSE");
assert.equal(api.processCbsText("{{#when::legacy::0}}TRUE\n{{:else}}\nFALSE{{/}}", cbsEnvironment).text, "");

const nestedWhen = `{{#when 1}}
{{#when 0}}TRUE{{:else}}INNER-ELSE{{/}}
{{:else}}
OUTER-ELSE
{{/}}`;
assert.equal(api.processCbsText(nestedWhen, cbsEnvironment).text, "INNER-ELSE");
assert.equal(api.processCbsText(nestedWhen.replace("#when 1", "#when 0"), cbsEnvironment).text, "OUTER-ELSE");

assert.equal(api.processCbsText("{{#when::1::or::0::and::0}}RIGHT{{/}}", cbsEnvironment).text, "RIGHT");
assert.equal(api.processCbsText("{{#when::0::or::1::and::0}}WRONG{{/}}", cbsEnvironment).text, "");
assert.equal(api.processCbsText("{{#when::1::and::0::or::1}}RIGHT{{/}}", cbsEnvironment).text, "RIGHT");
assert.equal(api.processCbsText("{{#when::0::and::1::or::1}}WRONG{{/}}", cbsEnvironment).text, "");
assert.equal(api.processCbsText("{{#when::1::and::not::false}}RIGHT{{/}}", cbsEnvironment).text, "RIGHT");
assert.equal(api.processCbsText("{{#when::12px::>::10px}}PARSE-FLOAT{{/}}", cbsEnvironment).text, "PARSE-FLOAT");

const malformedWhen = "{{#when}}OPEN{{/}}";
assert.equal(api.processCbsText(malformedWhen, cbsEnvironment).text, malformedWhen);
assert.deepEqual(api.processCbsText(malformedWhen, cbsEnvironment).warnings, ["{{#when}}"]);
const unclosedWhen = "{{#when::1}}OPEN";
assert.equal(api.processCbsText(unclosedWhen, cbsEnvironment).text, unclosedWhen);
assert.deepEqual(api.processCbsText(unclosedWhen, cbsEnvironment).warnings, ["닫히지 않은 {{#when}} 블록"]);
assert.equal(api.processCbsText(unclosedWhen, cbsEnvironment, true).text, "");
const unclosedToken = "{{#when::1";
assert.equal(api.processCbsText(unclosedToken, cbsEnvironment).text, unclosedToken);
assert.deepEqual(api.processCbsText(unclosedToken, cbsEnvironment).warnings, ["닫히지 않은 {{...}} 구문"]);
assert.equal(api.processCbsText(unclosedToken, cbsEnvironment, true).text, "");
assert.deepEqual(api.processCbsText("{{/}}", cbsEnvironment).warnings, ["짝이 없는 {{/}}"]);

const numbered = api.renderMarkdown("1. 첫 문장\n\n2. 둘째 문장\n\n3. 셋째 문장");
assert.equal((numbered.match(/<ol(?:\s|>)/g) ?? []).length, 1);
assert.equal((numbered.match(/<li>/g) ?? []).length, 3);

const startingAtThree = api.renderMarkdown("3. 셋째\n4. 넷째");
assert.match(startingAtThree, /^<ol start="3">/);

const nested = api.renderMarkdown("1. 첫째\n   - 하위 하나\n   - 하위 둘\n2. 둘째");
assert.match(nested, /<ol>.*<ul>.*하위 하나.*하위 둘.*<\/ul>.*둘째.*<\/ol>/s);

const tildeFence = api.renderMarkdown("~~~js\nconst x = 1;\n~~~");
assert.match(tildeFence, /md-code-language">js<\/span>/);
assert.match(tildeFence, /<code>const x = 1;\n<\/code>/);

const gfm = api.renderMarkdown("| 항목 | 값 |\n| --- | ---: |\n| 하나 | 1 |\n\n~~삭제~~\n\n- [x] 완료\n- [ ] 예정");
assert.match(gfm, /<table>/);
assert.match(gfm, /<th>항목<\/th>/);
assert.match(gfm, /<s>삭제<\/s>/);
assert.match(gfm, /class="md-task-list"/);
assert.doesNotMatch(gfm, /md-task-list md-task-list/);
assert.match(gfm, /type="checkbox" disabled checked/);
assert.match(gfm, /type="checkbox" disabled>/);

const references = api.renderMarkdown("[공식 문서][docs]\n\n[docs]: https:\/\/commonmark.org \"CommonMark\"");
assert.match(references, /href="https:\/\/commonmark\.org"/);
assert.match(references, /target="_blank"/);
assert.match(references, /rel="noopener noreferrer"/);

const image = api.renderMarkdown("![설명](https:\/\/example.com\/image.png)");
assert.match(image, /<img src="https:\/\/example\.com\/image\.png" alt="설명"/);
assert.match(image, /loading="lazy"/);
assert.match(image, /referrerpolicy="no-referrer"/);

const unsafe = api.renderMarkdown("<img src=x onerror=alert(1)>\n\n[위험](javascript:alert(1))");
assert.doesNotMatch(unsafe, /<img/i);
assert.doesNotMatch(unsafe, /href=/i);
assert.match(unsafe, /&lt;img src=x onerror=alert\(1\)&gt;/);

const blockedImage = api.renderMarkdown("![위험](data:image\/svg+xml;base64,PHN2Zz4=)");
assert.doesNotMatch(blockedImage, /<img/i);

assert.match(source, /Bundled third-party software licenses/);
assert.doesNotMatch(source, /function renderMarkdownInline/);

assert.equal(api.normalizeContextRegexScript({ id: "old", name: "규칙", input: "a", output: "b" }).enabled, true);
assert.equal(api.normalizeContextRegexScript({ id: "off", enabled: false }).enabled, false);
assert.equal(api.compileRegexScripts([{ id: "off-invalid", name: "꺼진 오류", input: "[", output: "", enabled: false }]).length, 0);
assert.equal(api.compileRegexScripts([{ id: "on-valid", name: "켜진 규칙", input: "a", output: "b", enabled: true }]).length, 1);

const workspace = api.normalizeWorkspace({
    version: 4,
    rooms: [{ id: "room", name: "회의실", writerMessages: [], createdAt: 1 }],
    selectedRoomId: "room",
    memoFolders: [{ id: "folder", name: "폴더", enabled: true, createdAt: 1 }],
    memos: [{ uid: "memo", folderId: "folder", content: "내용", enabled: true, createdAt: 1 }],
});
assert.equal(workspace.memos[0].displayName, "");
workspace.memos[0].displayName = "화면 전용 이름";
assert.equal(api.memoBlock(workspace.memos), "(Memo(1): 내용)");
assert.match(api.renderMemoTitleLine(workspace.memos[0], 1), /화면 전용 이름.*Memo\(1\)/);
workspace.memos[0].displayName = "";
assert.doesNotMatch(api.renderMemoTitleLine(workspace.memos[0], 1), /이름 없음/);

workspace.memos.push({ uid: "memo-2", folderId: "folder", displayName: "", content: "둘째", enabled: true, createdAt: 2 });
assert.equal(api.reorderMemoWithinFolder(workspace, "folder", "memo-2", "memo", false), true);
assert.deepEqual(api.orderedMemos(workspace).map((memo) => memo.uid), ["memo-2", "memo"]);

assert.doesNotMatch(source, />\s*메모 ON<\/label>/);
assert.doesNotMatch(source, />\s*폴더 ON<\/label>/);
assert.doesNotMatch(source, /이번 모델 요청에만 포함됨/);

const permissionCheckIndex = source.indexOf("initialPermissionsGranted = await requestInitialPermissions()");
const buttonRegistrationIndex = source.indexOf("await Risuai.registerButton");
assert.notEqual(permissionCheckIndex, -1);
assert.notEqual(buttonRegistrationIndex, -1);
assert.ok(permissionCheckIndex < buttonRegistrationIndex, "permission confirmation must finish before the launch button is registered");
assert.match(source, /if \(!initialPermissionsGranted\)\s*return;/);
assert.equal(api.PANEL_Z_INDEX, 40);
assert.equal(api.RESIZE_LAYER_Z_INDEX, 41);
assert.equal(api.RESIZE_SHIELD_Z_INDEX, 42);
assert.ok(api.RESIZE_SHIELD_Z_INDEX < 50, "all plugin layers must stay below RisuAI permission dialogs");

const grantedCalls = [];
const grantedApi = loadArtifactApi({
    requestPluginPermission: async (permission) => {
        grantedCalls.push(permission);
        return true;
    },
    getRootDocument: async () => ({}),
    addRisuReplacer: async () => undefined,
});
assert.equal(await grantedApi.requestInitialPermissions(), true);
assert.deepEqual(grantedCalls, ["db", "mainDom", "replacer"]);

const requiredPermissions = ["db", "mainDom", "replacer"];
for (const deniedPermission of requiredPermissions) {
    const deniedCalls = [];
    const deniedApi = loadArtifactApi({
        requestPluginPermission: async (permission) => {
            deniedCalls.push(permission);
            return permission !== deniedPermission;
        },
        getRootDocument: async () => ({}),
        addRisuReplacer: async () => undefined,
    });
    assert.equal(await deniedApi.requestInitialPermissions(), false);
    assert.deepEqual(deniedCalls, requiredPermissions.slice(0, requiredPermissions.indexOf(deniedPermission) + 1));
}

const failedApi = loadArtifactApi({
    requestPluginPermission: async () => {
        throw new Error("permission unavailable");
    },
});
const originalWarn = console.warn;
console.warn = () => undefined;
try {
    assert.equal(await failedApi.requestInitialPermissions(), false);
} finally {
    console.warn = originalWarn;
}

console.log("Built artifact regression checks passed.");
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
