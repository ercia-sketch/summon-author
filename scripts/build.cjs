const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const projectRoot = path.resolve(__dirname, "..");
const configPath = path.join(projectRoot, "tsconfig.json");
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error) {
    console.error(ts.formatDiagnosticsWithColorAndContext([configFile.error], diagnosticHost()));
    process.exit(1);
}

const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, projectRoot, undefined, configPath);
const outputPath = path.resolve(parsedConfig.options.outFile ?? path.join(projectRoot, "summon_author_v1.1.2.js"));
let pluginSource = "";
const compilerHost = ts.createCompilerHost(parsedConfig.options);
compilerHost.writeFile = (fileName, content) => {
    if (path.resolve(fileName) === outputPath) pluginSource = content;
};

const program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options, compilerHost);
const emitResult = program.emit();
const diagnostics = [...ts.getPreEmitDiagnostics(program), ...emitResult.diagnostics];
if (diagnostics.length > 0) {
    console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, diagnosticHost()));
}
if (emitResult.emitSkipped || !pluginSource) process.exit(1);

const metadata = pluginSource.match(/^((?:\/\/@[^\r\n]*\r?\n)+)/)?.[1];
if (!metadata) throw new Error("플러그인 메타데이터 헤더를 찾을 수 없습니다.");

const markdownBundlePath = require.resolve("markdown-it/browser");
const markdownBundle = fs.readFileSync(markdownBundlePath, "utf8")
    .replace(/\r?\n?\/\/# sourceMappingURL=.*?\s*$/, "");
const thirdPartyNotices = buildThirdPartyNotices();
const parserBundle = `const summonAuthorMarkdownParser = (() => {
    const module = undefined;
    const exports = undefined;
    const define = undefined;
    const previousMarkdownParser = globalThis.markdownit;
    ${markdownBundle}
    const bundledMarkdownParser = globalThis.markdownit;
    if (previousMarkdownParser === undefined) delete globalThis.markdownit;
    else globalThis.markdownit = previousMarkdownParser;
    return bundledMarkdownParser;
})();`;
const output = `${metadata}${thirdPartyNotices}\n${parserBundle}\n${pluginSource.slice(metadata.length)}`;
fs.writeFileSync(outputPath, output, "utf8");

console.log(`Built ${path.basename(outputPath)} with markdown-it ${require("markdown-it/package.json").version}.`);

function diagnosticHost() {
    return {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => projectRoot,
        getNewLine: () => "\n",
    };
}

function buildThirdPartyNotices() {
    const markdownItLicense = `Copyright (c) 2014 Vitaly Puzrin, Alex Kocharin.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
    const bundledLicenses = [
        ["markdown-it", markdownItLicense],
        ["entities", readDependencyLicense("entities", "LICENSE")],
        ["linkify-it", readDependencyLicense("linkify-it", "LICENSE")],
        ["mdurl", readDependencyLicense("mdurl", "LICENSE")],
        ["punycode.js", readDependencyLicense("punycode.js", "LICENSE-MIT.txt")],
        ["uc.micro", readDependencyLicense("uc.micro", "LICENSE.txt")],
    ];
    const noticeBody = bundledLicenses
        .map(([name, license]) => `----- ${name} -----\n${license.trim()}`)
        .join("\n\n");
    return `/*!\nBundled third-party software licenses\n\n${noticeBody}\n*/`;
}

function readDependencyLicense(packageName, fileName) {
    const packageRoot = path.join(projectRoot, "node_modules", packageName);
    return fs.readFileSync(path.join(packageRoot, fileName), "utf8");
}
