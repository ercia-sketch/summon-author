async function applyTheme(): Promise<void> {
    try {
        await Risuai.getColorScheme();
        document.documentElement.style.colorScheme = "dark";
    } catch (error) {
        console.warn("[Summon Author] Could not read the current color scheme:", error);
    }
}

const RESIZE_DIRECTIONS: ResizeDirection[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
const PANEL_Z_INDEX = 40;
const RESIZE_LAYER_Z_INDEX = 41;
const RESIZE_SHIELD_Z_INDEX = 42;

function resizeCursor(direction: ResizeDirection): string {
    if (direction === "n" || direction === "s") return "ns-resize";
    if (direction === "e" || direction === "w") return "ew-resize";
    return direction === "nw" || direction === "se" ? "nwse-resize" : "nesw-resize";
}

function panelFrameGeometryStyle(geometry: PanelGeometry, minimized = panelMinimized): string {
    const heightConstraints = minimized
        ? ["min-height:64px", "max-height:64px"]
        : ["min-height:min(320px, calc(100vh - 16px))", "max-height:calc(100vh - 8px)"];
    return [
        "position:fixed", "display:block", `z-index:${PANEL_Z_INDEX}`, "right:auto",
        `left:${Math.round(geometry.left)}px`, `top:${Math.round(geometry.top)}px`,
        `width:${Math.round(geometry.width)}px`, `height:${Math.round(geometry.height)}px`,
        "min-width:min(420px, calc(100vw - 16px))", ...heightConstraints,
        "max-width:calc(100vw - 8px)",
        "border:1px solid rgba(127, 145, 170, .55)", "border-radius:14px",
        "box-shadow:0 18px 55px rgba(0, 0, 0, .45)", "overflow:hidden",
        "resize:none", "background-color:transparent", "box-sizing:border-box",
    ].join(";");
}

function resizeHandleStyle(direction: ResizeDirection, geometry: PanelGeometry): string {
    const cornerSize = 28;
    const edgeThickness = 14;
    const cornerOffset = 8;
    let left = geometry.left;
    let top = geometry.top;
    let width = cornerSize;
    let height = cornerSize;
    if (direction === "nw") {
        left -= cornerOffset;
        top -= cornerOffset;
    } else if (direction === "ne") {
        left += geometry.width - cornerSize + cornerOffset;
        top -= cornerOffset;
    } else if (direction === "sw") {
        left -= cornerOffset;
        top += geometry.height - cornerSize + cornerOffset;
    } else if (direction === "se") {
        left += geometry.width - cornerSize + cornerOffset;
        top += geometry.height - cornerSize + cornerOffset;
    } else if (direction === "n" || direction === "s") {
        left += cornerSize - 4;
        top += direction === "n" ? -Math.floor(edgeThickness / 2) : geometry.height - Math.floor(edgeThickness / 2);
        width = Math.max(24, geometry.width - (cornerSize - 4) * 2);
        height = edgeThickness;
    } else {
        left += direction === "w" ? -Math.floor(edgeThickness / 2) : geometry.width - Math.floor(edgeThickness / 2);
        top += cornerSize - 4;
        width = edgeThickness;
        height = Math.max(24, geometry.height - (cornerSize - 4) * 2);
    }
    return [
        "position:fixed", `left:${Math.round(left)}px`, `top:${Math.round(top)}px`,
        `width:${Math.round(width)}px`, `height:${Math.round(height)}px`,
        "display:block", "pointer-events:auto", "touch-action:none", "user-select:none",
        `cursor:${resizeCursor(direction)}`, "box-sizing:border-box",
        "background:transparent", "border:0", "box-shadow:none", "opacity:0",
    ].join(";");
}

function detectResizeDirection(clientX: number, clientY: number, geometry: PanelGeometry): ResizeDirection | null {
    const right = geometry.left + geometry.width;
    const bottom = geometry.top + geometry.height;
    const cornerRange = 22;
    const edgeRange = 12;
    const withinHorizontal = clientX >= geometry.left - edgeRange && clientX <= right + edgeRange;
    const withinVertical = clientY >= geometry.top - edgeRange && clientY <= bottom + edgeRange;
    const nearLeft = Math.abs(clientX - geometry.left) <= cornerRange;
    const nearRight = Math.abs(clientX - right) <= cornerRange;
    const nearTop = Math.abs(clientY - geometry.top) <= cornerRange;
    const nearBottom = Math.abs(clientY - bottom) <= cornerRange;
    if (nearTop && nearLeft) return "nw";
    if (nearTop && nearRight) return "ne";
    if (nearBottom && nearLeft) return "sw";
    if (nearBottom && nearRight) return "se";
    if (withinHorizontal && Math.abs(clientY - geometry.top) <= edgeRange) return "n";
    if (withinHorizontal && Math.abs(clientY - bottom) <= edgeRange) return "s";
    if (withinVertical && Math.abs(clientX - geometry.left) <= edgeRange) return "w";
    if (withinVertical && Math.abs(clientX - right) <= edgeRange) return "e";
    return null;
}

async function ensureParentResizeHandles(): Promise<void> {
    if (!mainDocument || parentResizeLayer) return;
    const parentBody = await mainDocument.querySelector("body");
    if (!parentBody) return;
    parentResizeLayer = await mainDocument.createElement("div");
    await parentResizeLayer.setAttribute("x-author-talk-resize-layer", "true");
    await parentResizeLayer.setStyleAttribute(`position:fixed;inset:0;z-index:${RESIZE_LAYER_Z_INDEX};pointer-events:none;display:block`);
    await parentBody.appendChild(parentResizeLayer);
    parentResizeShield = await mainDocument.createElement("div");
    await parentResizeShield.setAttribute("x-author-talk-resize-shield", "true");
    await parentResizeShield.setStyleAttribute(`position:fixed;inset:0;z-index:${RESIZE_SHIELD_Z_INDEX};display:none;pointer-events:auto;touch-action:none;user-select:none;background:transparent`);
    await parentBody.appendChild(parentResizeShield);
    for (const direction of RESIZE_DIRECTIONS) {
        const handle = await mainDocument.createElement("div");
        await handle.setAttribute("x-author-talk-resize-handle", direction);
        await parentResizeLayer.appendChild(handle);
        parentResizeHandles.set(direction, handle);
    }
}

async function updateParentResizeHandles(geometry?: PanelGeometry): Promise<void> {
    if (!hostFrame || !parentResizeLayer || parentResizeHandles.size === 0) return;
    const rect = geometry ?? await hostFrame.getBoundingClientRect();
    const resolved: PanelGeometry = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    lastPanelGeometry = resolved;
    for (const [direction, handle] of parentResizeHandles) await handle.setStyleAttribute(resizeHandleStyle(direction, resolved));
    await parentResizeLayer.setStyle("display", panelMinimized ? "none" : "block");
}

async function hideParentResizeHandles(): Promise<void> {
    if (parentResizeLayer) await parentResizeLayer.setStyle("display", "none");
}

async function showParentResizeShield(direction: ResizeDirection): Promise<void> {
    if (!parentResizeShield) return;
    await parentResizeShield.setStyleAttribute(`position:fixed;inset:0;z-index:${RESIZE_SHIELD_Z_INDEX};display:block;pointer-events:auto;touch-action:none;user-select:none;background:transparent;cursor:${resizeCursor(direction)}`);
}

async function hideParentResizeShield(): Promise<void> {
    if (parentResizeShield) await parentResizeShield.setStyle("display", "none");
}

async function removeParentResizeHandles(): Promise<void> {
    try {
        if (parentResizeShield) await parentResizeShield.remove();
    } catch {}
    try {
        if (parentResizeLayer) await parentResizeLayer.remove();
    } catch {}
    parentResizeShield = null;
    parentResizeLayer = null;
    parentResizeHandles.clear();
}

async function startParentPanelResize(event: any): Promise<void> {
    if (!panelOpen || !hostFrame || !mainDocument || panelMinimized || panelResize || event.button !== 0) return;
    if (typeof event.clientX !== "number" || typeof event.clientY !== "number") return;
    const [rawRect, viewportWidth, viewportHeight] = await Promise.all([
        lastPanelGeometry ? Promise.resolve(lastPanelGeometry) : hostFrame.getBoundingClientRect(),
        mainDocument.clientWidth(),
        mainDocument.clientHeight(),
    ]);
    const rect: PanelGeometry = { left: rawRect.left, top: rawRect.top, width: rawRect.width, height: rawRect.height };
    const direction = detectResizeDirection(event.clientX, event.clientY, rect);
    if (!direction) return;
    panelResize = {
        direction,
        startMainClientX: event.clientX,
        startMainClientY: event.clientY,
        startLeft: rect.left,
        startTop: rect.top,
        startRight: rect.left + rect.width,
        startBottom: rect.top + rect.height,
        startWidth: rect.width,
        startHeight: rect.height,
        viewportWidth,
        viewportHeight,
    };
    pendingResizeGeometry = null;
    lastPanelGeometry = rect;
    await Promise.all([
        showParentResizeShield(direction),
        hideParentResizeHandles(),
        hostFrame.setStyleAttribute(panelFrameGeometryStyle(rect)),
    ]);
}

async function ensureMainResizeBridge(): Promise<void> {
    if (!mainDocument || mainResizeBridgeListeners.length > 0) return;
    const downId = await mainDocument.addEventListener("pointerdown", (event: any) => void startParentPanelResize(event), true);
    const moveId = await mainDocument.addEventListener("pointermove", (event: any) => {
        if (!panelResize) return;
        if (event.buttons === 0) {
            void finishPanelResize(event);
            return;
        }
        if (typeof event.clientX !== "number" || typeof event.clientY !== "number") return;
        queuePanelResize(event.clientX - panelResize.startMainClientX, event.clientY - panelResize.startMainClientY);
    }, true);
    const upId = await mainDocument.addEventListener("pointerup", (event: any) => void finishPanelResize(event), true);
    const cancelId = await mainDocument.addEventListener("pointercancel", () => void finishPanelResize(), true);
    mainResizeBridgeListeners = [
        { type: "pointerdown", id: downId },
        { type: "pointermove", id: moveId },
        { type: "pointerup", id: upId },
        { type: "pointercancel", id: cancelId },
    ];
}

async function removeMainResizeBridge(): Promise<void> {
    if (!mainDocument) return;
    for (const listener of mainResizeBridgeListeners) {
        try {
            await mainDocument.removeEventListener(listener.type, listener.id, true);
        } catch {
            // RisuAI also removes main-document listeners automatically on plugin unload.
        }
    }
    mainResizeBridgeListeners = [];
}

async function prepareHostFrameDetection(): Promise<Array<{ frame: any; display: string }> | null> {
    try {
        if (!await ensureMainDocumentAccess()) {
            setStatus("플로팅 패널 권한이 거부되어 전체 화면으로 열었습니다.", "error", false);
            return null;
        }
        await ensureMainResizeBridge();
        hostFrame = await mainDocument.querySelector('iframe[x-author-talk-host="true"]');
        if (hostFrame) return [];
        const safeFrames = await mainDocument.querySelectorAll("iframe");
        const frames: any[] = await Risuai.unwarpSafeArray(safeFrames);
        return await Promise.all(frames.map(async (frame) => ({ frame, display: await frame.getStyle("display") })));
    } catch (error) {
        setStatus(`플로팅 패널 권한을 준비하지 못했습니다: ${errorMessage(error)}`, "error", false);
        return null;
    }
}

async function findAndConfigureHostFrame(snapshot: Array<{ frame: any; display: string }> | null): Promise<boolean> {
    try {
        if (!mainDocument || snapshot === null) return false;
        if (!hostFrame) {
            for (let index = snapshot.length - 1; index >= 0; index--) {
                const candidate = snapshot[index];
                const [position, display, zIndex] = await Promise.all([
                    candidate.frame.getStyle("position"),
                    candidate.frame.getStyle("display"),
                    candidate.frame.getStyle("zIndex"),
                ]);
                if (candidate.display !== "block" && position === "fixed" && display === "block" && zIndex === "1000") {
                    hostFrame = candidate.frame;
                    break;
                }
            }
            if (hostFrame) await hostFrame.setAttribute("x-author-talk-host", "true");
        }
        if (!hostFrame) throw new Error("플러그인 iframe을 찾지 못했습니다.");
        const styles: Array<[string, string]> = [
            ["left", "auto"], ["right", "16px"], ["top", "16px"],
            ["zIndex", String(PANEL_Z_INDEX)],
            ["width", "min(760px, calc(100vw - 32px))"], ["height", "calc(100vh - 32px)"],
            ["minWidth", "min(420px, calc(100vw - 16px))"], ["minHeight", "320px"],
            ["maxWidth", "calc(100vw - 8px)"], ["maxHeight", "calc(100vh - 8px)"],
            ["border", "1px solid rgba(127, 145, 170, .55)"], ["borderRadius", "14px"],
            ["boxShadow", "0 18px 55px rgba(0, 0, 0, .45)"], ["overflow", "hidden"],
            ["resize", "none"], ["backgroundColor", "transparent"], ["boxSizing", "border-box"],
        ];
        for (const [property, value] of styles) await hostFrame.setStyle(property, value);
        await ensureParentResizeHandles();
        await updateParentResizeHandles();
        expandedPanelHeight = "calc(100vh - 32px)";
        return true;
    } catch (error) {
        hostFrame = null;
        setStatus(`플로팅 패널을 준비하지 못해 전체 화면으로 열었습니다: ${errorMessage(error)}`, "error", false);
        return false;
    }
}

async function setPanelMinimized(minimized: boolean): Promise<void> {
    if (!hostFrame) return;
    await finishPanelResize();
    if (minimized) {
        const rect = await hostFrame.getBoundingClientRect();
        expandedPanelHeight = `${Math.max(320, Math.round(rect.height))}px`;
        panelMinimized = true;
        await hostFrame.setStyle("minHeight", "64px");
        await hostFrame.setStyle("maxHeight", "64px");
        await hostFrame.setStyle("height", "64px");
        await hostFrame.setStyle("resize", "none");
        await hideParentResizeHandles();
    } else {
        panelMinimized = false;
        await hostFrame.setStyle("minHeight", "320px");
        await hostFrame.setStyle("maxHeight", "calc(100vh - 8px)");
        await hostFrame.setStyle("height", expandedPanelHeight);
        await hostFrame.setStyle("resize", "none");
        await updateParentResizeHandles();
    }
    render();
}

async function startPanelDrag(event: PointerEvent): Promise<void> {
    if (!panelOpen || !hostFrame || !mainDocument || panelResize || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (!target.closest("[data-drag-handle]") || target.closest("button, input, textarea, select, a")) return;
    target.setPointerCapture?.(event.pointerId);
    const [rect, viewportWidth, viewportHeight] = await Promise.all([
        hostFrame.getBoundingClientRect(),
        mainDocument.clientWidth(),
        mainDocument.clientHeight(),
    ]);
    panelDrag = {
        pointerId: event.pointerId,
        startScreenX: event.screenX,
        startScreenY: event.screenY,
        startLeft: rect.left,
        startTop: rect.top,
        width: rect.width,
        height: rect.height,
        viewportWidth,
        viewportHeight,
    };
    lastPanelGeometry = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    await Promise.all([
        hideParentResizeHandles(),
        hostFrame.setStyleAttribute(panelFrameGeometryStyle(lastPanelGeometry)),
    ]);
}

function movePanel(event: PointerEvent): void {
    if (!panelDrag || event.pointerId !== panelDrag.pointerId || !hostFrame) return;
    const maxLeft = Math.max(0, panelDrag.viewportWidth - Math.min(panelDrag.width, 80));
    const maxTop = Math.max(0, panelDrag.viewportHeight - Math.min(panelDrag.height, 52));
    pendingDragPosition = {
        left: Math.min(maxLeft, Math.max(0, panelDrag.startLeft + event.screenX - panelDrag.startScreenX)),
        top: Math.min(maxTop, Math.max(0, panelDrag.startTop + event.screenY - panelDrag.startScreenY)),
        width: panelDrag.width,
        height: panelDrag.height,
    };
    if (dragFramePending) return;
    dragFramePending = true;
    requestAnimationFrame(() => {
        dragFramePending = false;
        const position = pendingDragPosition;
        pendingDragPosition = null;
        if (!position || !hostFrame) return;
        lastPanelGeometry = {
            left: position.left,
            top: position.top,
            width: position.width,
            height: position.height,
        };
        void hostFrame.setStyleAttribute(panelFrameGeometryStyle(lastPanelGeometry)).catch(() => {});
    });
}

function endPanelDrag(event: PointerEvent): void {
    if (!panelDrag || event.pointerId !== panelDrag.pointerId) return;
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
    panelDrag = null;
    if (lastPanelGeometry && !panelMinimized) void updateParentResizeHandles(lastPanelGeometry);
}

function calculatePanelResizeGeometry(dx: number, dy: number): PanelGeometry | null {
    if (!panelResize) return null;
    const minWidth = Math.max(120, Math.min(420, panelResize.viewportWidth - 16));
    const minHeight = Math.max(120, Math.min(320, panelResize.viewportHeight - 16));
    let left = panelResize.startLeft;
    let top = panelResize.startTop;
    let width = panelResize.startWidth;
    let height = panelResize.startHeight;

    if (panelResize.direction.includes("w")) {
        left = Math.min(panelResize.startRight - minWidth, Math.max(0, panelResize.startLeft + dx));
        width = panelResize.startRight - left;
    } else if (panelResize.direction.includes("e")) {
        width = Math.min(panelResize.viewportWidth - panelResize.startLeft, Math.max(minWidth, panelResize.startWidth + dx));
    }
    if (panelResize.direction.includes("n")) {
        top = Math.min(panelResize.startBottom - minHeight, Math.max(0, panelResize.startTop + dy));
        height = panelResize.startBottom - top;
    } else if (panelResize.direction.includes("s")) {
        height = Math.min(panelResize.viewportHeight - panelResize.startTop, Math.max(minHeight, panelResize.startHeight + dy));
    }
    return { left, top, width, height };
}

function schedulePanelResizeFlush(): void {
    if (resizeFramePending) return;
    resizeFramePending = true;
    requestAnimationFrame(() => {
        resizeFramePending = false;
        void flushPanelResizeWrites().catch((error) => console.warn("[Summon Author] Panel resize update failed:", error));
    });
}

function flushPanelResizeWrites(): Promise<void> {
    if (resizeWritePromise) return resizeWritePromise;
    resizeWritePromise = (async () => {
        while (pendingResizeGeometry && hostFrame) {
            const geometry = pendingResizeGeometry;
            pendingResizeGeometry = null;
            await hostFrame.setStyleAttribute(panelFrameGeometryStyle(geometry));
            lastPanelGeometry = geometry;
            expandedPanelHeight = `${Math.round(geometry.height)}px`;
        }
    })().finally(() => {
        resizeWritePromise = null;
        if (pendingResizeGeometry) schedulePanelResizeFlush();
    });
    return resizeWritePromise;
}

function queuePanelResize(dx: number, dy: number): void {
    if (!panelResize || !hostFrame) return;
    const geometry = calculatePanelResizeGeometry(dx, dy);
    if (!geometry) return;
    pendingResizeGeometry = geometry;
    schedulePanelResizeFlush();
}

async function finishPanelResize(event?: any): Promise<void> {
    if (resizeFinishPromise) return resizeFinishPromise;
    if (!panelResize) {
        await hideParentResizeShield();
        return;
    }
    if (typeof event?.clientX === "number" && typeof event?.clientY === "number") {
        const finalGeometry = calculatePanelResizeGeometry(
            event.clientX - panelResize.startMainClientX,
            event.clientY - panelResize.startMainClientY,
        );
        if (finalGeometry) pendingResizeGeometry = finalGeometry;
    }
    panelResize = null;
    resizeFinishPromise = (async () => {
        try {
            await flushPanelResizeWrites();
        } catch (error) {
            console.warn("[Summon Author] Could not apply the final panel size:", error);
        } finally {
            pendingResizeGeometry = null;
            await hideParentResizeShield();
            if (lastPanelGeometry && !panelMinimized) await updateParentResizeHandles(lastPanelGeometry);
        }
    })().finally(() => {
        resizeFinishPromise = null;
    });
    return resizeFinishPromise;
}
