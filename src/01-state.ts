const DEFAULT_SETTINGS: PluginSettings = {
    version: 7,
    selectedBasePresetId: BUILTIN_BASE_ID,
    selectedAdditionalPresetId: BUILTIN_ADDITIONAL_ID,
    customBasePresets: [],
    customAdditionalPresets: [],
    writerModelMode: "submodel",
    markdownEnabled: false,
    writerMarkdownCleanup: false,
    contextToggles: { botCard: true, persona: true, memories: true, chatHistory: true, authorNote: true, replaceGlobalNote: true, firstMessage: true, other: false },
    omitUnsupportedSyntax: {},
    collapsedMemoFolderIds: [],
    collapsedMemoIds: [],
    contextRegexScripts: [],
    chatMessageExclusions: {},
};

let settings: PluginSettings = safeClone(DEFAULT_SETTINGS);
let currentIdentity: SessionIdentity | null = null;
let currentWorkspace: BotWorkspace | null = null;
let currentLoreOverrides: Record<string, LoreMode> = {};
let currentContext: WriterContext | null = null;
let activeTab: "writer" | "memos" | "context" | "settings" = "writer";
let writerDraft = "";
let isSending = false;
let isRefreshingContext = false;
let statusMessage = "";
let statusKind: "info" | "success" | "error" = "info";
let memoReplacerReady = false;
let memoReplacerPermissionDenied = false;
let mainDomPermissionDenied = false;
let settingsSaveTimer: number | undefined;
let workspaceSaveTimer: number | undefined;
let workspaceSavePromise: Promise<void> = Promise.resolve();
let regexContextRefreshTimer: number | undefined;
let regexContextRefreshGeneration = 0;
let regexManagerOpen = false;
const expandedRegexScriptIds = new Set<string>();
const collapsedChatMessageKeys = new Set<string>();
const contextRegexErrors = new Map<string, string>();
type ReorderKind = "regex" | "memo" | "memo-folder";
interface ReorderTarget {
    kind: ReorderKind;
    id: string;
    scopeId: string;
    position: "before" | "after";
}
let activeReorderDrag: { kind: ReorderKind; id: string; scopeId: string } | null = null;
let activeReorderTarget: ReorderTarget | null = null;
let root: HTMLDivElement;
let editingMessageId: string | null = null;
let editingMessageDraft = "";
let writerScrollRestore: number | null = null;
let tokenInfoOpen = false;
let requestGeneration = 0;
let activeWriterRequest: ActiveWriterRequest | null = null;
let mainDocument: any = null;
let hostFrame: any = null;
let panelOpen = false;
let panelMinimized = false;
let firstMessageIndex = 0;
let expandedPanelHeight = "calc(100vh - 40px)";
let panelDrag: {
    pointerId: number;
    startScreenX: number;
    startScreenY: number;
    startLeft: number;
    startTop: number;
    width: number;
    height: number;
    viewportWidth: number;
    viewportHeight: number;
} | null = null;
let pendingDragPosition: { left: number; top: number; width: number; height: number } | null = null;
let dragFramePending = false;
type ResizeDirection = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
interface PanelGeometry {
    left: number;
    top: number;
    width: number;
    height: number;
}
let panelResize: {
    direction: ResizeDirection;
    startMainClientX: number;
    startMainClientY: number;
    startLeft: number;
    startTop: number;
    startRight: number;
    startBottom: number;
    startWidth: number;
    startHeight: number;
    viewportWidth: number;
    viewportHeight: number;
} | null = null;
let pendingResizeGeometry: PanelGeometry | null = null;
let lastPanelGeometry: PanelGeometry | null = null;
let resizeFramePending = false;
let resizeWritePromise: Promise<void> | null = null;
let resizeFinishPromise: Promise<void> | null = null;
let mainResizeBridgeListeners: Array<{ type: string; id: string }> = [];
let memoReceiptGeneration = 0;
let memoReceiptObserver: any = null;
let memoReceiptRepairTimer: number | undefined;
let memoReceiptSyncPromise: Promise<void> = Promise.resolve();
interface VisualMemoReceiptItem {
    uid: string;
    number: number;
    displayName: string;
    content: string;
}
let memoReceiptState: {
    generation: number;
    characterId: string;
    chatId: string;
    userMessageIndex: number;
    memos: VisualMemoReceiptItem[];
} | null = null;
const parentResizeHandles = new Map<ResizeDirection, any>();
let parentResizeLayer: any = null;
let parentResizeShield: any = null;

let workspaceLoadPromise: Promise<BotWorkspace> | null = null;
const storageReadFailures = new Set<string>();
