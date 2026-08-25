const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

(async () => {
const artifactPath = path.join(__dirname, "..", "summon_author_v1.1.3.js");
const source = fs.readFileSync(artifactPath, "utf8");
const initializeMarker = source.lastIndexOf("void initialize()");
assert.notEqual(initializeMarker, -1, "plugin initializer marker must exist");

function loadArtifactApi(risuai = {}) {
    const previousGlobalMarkdownParser = globalThis.markdownit;
    const globalMarkdownParserSentinel = () => "기존 전역 값";
    globalThis.markdownit = globalMarkdownParserSentinel;
    const api = new Function("Risuai", `${source.slice(0, initializeMarker)}\nreturn { renderMarkdown, normalizeContextRegexScript, normalizeWorkspace, memoBlock, orderedMemos, reorderMemoWithinFolder, renderMemoTitleLine, requestInitialPermissions, PANEL_Z_INDEX, RESIZE_LAYER_Z_INDEX, RESIZE_SHIELD_Z_INDEX, compileRegexScripts: (scripts) => { settings.contextRegexScripts = scripts; return validateContextRegexScripts(); } };`)(risuai);
    assert.equal(globalThis.markdownit, globalMarkdownParserSentinel);
    if (previousGlobalMarkdownParser === undefined) delete globalThis.markdownit;
    else globalThis.markdownit = previousGlobalMarkdownParser;
    return api;
}

const api = loadArtifactApi();

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
