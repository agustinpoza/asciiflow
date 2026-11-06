import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Query the measured character cell dimensions from the app's test bridge.
 * Cached per page after the first call.
 */
const cellSizeCache = new WeakMap();
async function getCellSize(page) {
  if (cellSizeCache.has(page)) return cellSizeCache.get(page);
  const size = await page.evaluate(() => window.__asciiflow__.getCellSize());
  cellSizeCache.set(page, size);
  return size;
}

/**
 * Convert a cell offset (relative to grid center) to a screen pixel coordinate.
 * The canvas centers the grid in the viewport; cell size is measured dynamically.
 */
async function cellToPixel(page, cellDx, cellDy) {
  const vp = page.viewportSize();
  const { w, h } = await getCellSize(page);
  return {
    x: vp.width / 2 + cellDx * w,
    y: vp.height / 2 + cellDy * h,
  };
}

/** Read the committed layer as text via the test bridge. */
async function getCommittedText(page) {
  return page.evaluate(() => window.__asciiflow__.getCommittedText());
}

/** Read the render-paint counter (incremented after each actual canvas paint). */
async function getRenderedVersion(page) {
  return page.evaluate(() => window.__asciiflow__.getRenderedVersion());
}

/** Read the number of cells in the committed layer. */
async function getCommittedSize(page) {
  return page.evaluate(() => window.__asciiflow__.getCommittedSize());
}

/** Wait for the canvas to actually repaint after a mutation. */
async function waitForRender(page, previousRenderedVersion) {
  await expect
    .poll(() => getRenderedVersion(page), { timeout: 2000 })
    .toBeGreaterThan(previousRenderedVersion);
}

/** Drag on the canvas from one cell offset to another. */
async function drag(page, fromDx, fromDy, toDx, toDy) {
  const start = await cellToPixel(page, fromDx, fromDy);
  const end = await cellToPixel(page, toDx, toDy);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();
}

/** Click on a specific cell offset. */
async function clickCell(page, cellDx, cellDy) {
  const pos = await cellToPixel(page, cellDx, cellDy);
  await page.mouse.click(pos.x, pos.y);
}

/** Select a tool by test id. */
async function selectTool(page, toolName) {
  await page.getByTestId(`tool-${toolName}`).click();
}

// ---------------------------------------------------------------------------
// Basic tests
// ---------------------------------------------------------------------------

test("loads the application", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("ASCIIFlow");
});

test("renders the canvas", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
});

test("test bridge is available", async ({ page }) => {
  await page.goto("/");
  const version = await getRenderedVersion(page);
  expect(version).toBeGreaterThan(0);
  const text = await getCommittedText(page);
  expect(text).toBe("");
});

// ---------------------------------------------------------------------------
// Box tool
// ---------------------------------------------------------------------------

test("draw a box and verify committed state", async ({ page }) => {
  await page.goto("/");
  await selectTool(page, "boxes");

  const rv = await getRenderedVersion(page);
  await drag(page, -2, -1, 2, 2);
  await waitForRender(page, rv);

  const text = await getCommittedText(page);
  expect(text.split("\n")).toEqual(["┌───┐", "│   │", "│   │", "└───┘"]);
});

test("draw multiple boxes", async ({ page }) => {
  await page.goto("/");
  await selectTool(page, "boxes");

  // First box
  await drag(page, -10, -2, -6, 1);

  const textAfterFirst = await getCommittedText(page);
  expect(textAfterFirst).toContain("┌───┐");

  // Second box (well separated horizontally, same vertical range)
  await drag(page, 6, -2, 10, 1);

  const text = await getCommittedText(page);
  // Both boxes should exist — count corners
  const cornerCount = (text.match(/┌/g) || []).length;
  expect(cornerCount).toBe(2);
});

// ---------------------------------------------------------------------------
// Line tool
// ---------------------------------------------------------------------------

test("draw a line", async ({ page }) => {
  await page.goto("/");
  await selectTool(page, "line");

  const rv = await getRenderedVersion(page);
  await drag(page, -3, 0, 3, 0);
  await waitForRender(page, rv);

  const text = await getCommittedText(page);
  // Horizontal line: should be only horizontal segments
  expect(text.split("\n")).toHaveLength(1);
  // Should span multiple characters
  expect(text.length).toBeGreaterThanOrEqual(5);
  // Every character should be a horizontal line segment
  for (const ch of text) {
    expect("─┼").toContain(ch);
  }
});

// ---------------------------------------------------------------------------
// Arrow tool
// ---------------------------------------------------------------------------

test("draw an arrow", async ({ page }) => {
  await page.goto("/");
  await selectTool(page, "arrow");

  const rv = await getRenderedVersion(page);
  await drag(page, -3, 0, 3, 0);
  await waitForRender(page, rv);

  const text = await getCommittedText(page);
  // Should be a single horizontal line
  expect(text.split("\n")).toHaveLength(1);
  // Should have a shaft of line segments and an arrowhead at the end
  expect(text).toMatch(/[─]+[►>→]/);
});

// ---------------------------------------------------------------------------
// Freeform tool
// ---------------------------------------------------------------------------

test("freeform draw default character", async ({ page }) => {
  await page.goto("/");
  await selectTool(page, "freeform");

  const rv = await getRenderedVersion(page);
  await drag(page, 0, 0, 2, 0);
  await waitForRender(page, rv);

  const text = await getCommittedText(page);
  // Default freeform character is "x", should have placed multiple
  const xCount = (text.match(/x/g) || []).length;
  expect(xCount).toBeGreaterThanOrEqual(2);
});

test("freeform draw trail of characters", async ({ page }) => {
  await page.goto("/");
  await selectTool(page, "freeform");

  // Draw a horizontal trail across 5 cells
  await drag(page, -2, 0, 2, 0);

  const text = await getCommittedText(page);
  const xCount = (text.match(/x/g) || []).length;
  // Dragging across 5 cells should produce at least 3 characters
  expect(xCount).toBeGreaterThanOrEqual(3);
  // Should be a single row
  expect(text.split("\n")).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// Text tool
// ---------------------------------------------------------------------------

test("type text on canvas", async ({ page }) => {
  await page.goto("/");
  await selectTool(page, "text");

  await clickCell(page, 0, 0);

  const rv = await getRenderedVersion(page);
  await page.keyboard.type("Hello");
  await page.keyboard.press("Enter");
  await waitForRender(page, rv);

  const text = await getCommittedText(page);
  expect(text).toBe("Hello");
});

test("type multiline text", async ({ page }) => {
  await page.goto("/");
  await selectTool(page, "text");

  await clickCell(page, 0, 0);

  await page.keyboard.type("AB");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("CD");
  await page.keyboard.press("Enter");

  const text = await getCommittedText(page);
  expect(text.split("\n")).toEqual(["AB", "CD"]);
});

// ---------------------------------------------------------------------------
// Select tool
// ---------------------------------------------------------------------------

test("select and delete region", async ({ page }) => {
  await page.goto("/");

  // First draw a box
  await selectTool(page, "boxes");
  await drag(page, -2, -1, 2, 2);

  const textBefore = await getCommittedText(page);
  expect(textBefore).toContain("┌───┐");

  // Switch to select tool
  await selectTool(page, "select---move");

  // Select the entire box area
  await drag(page, -3, -2, 3, 3);

  // Delete the selection
  const rv = await getRenderedVersion(page);
  await page.keyboard.press("Delete");
  await waitForRender(page, rv);

  const textAfter = await getCommittedText(page);
  expect(textAfter).toBe("");
});

// ---------------------------------------------------------------------------
// Undo / Redo
// ---------------------------------------------------------------------------

test("undo and redo a drawing", async ({ page }) => {
  await page.goto("/");
  await selectTool(page, "boxes");

  await drag(page, -2, -1, 2, 2);
  const textAfterDraw = await getCommittedText(page);
  expect(textAfterDraw.split("\n")).toEqual([
    "┌───┐",
    "│   │",
    "│   │",
    "└───┘",
  ]);

  // Undo
  const rvUndo = await getRenderedVersion(page);
  await page.keyboard.press("Control+z");
  await waitForRender(page, rvUndo);

  const textAfterUndo = await getCommittedText(page);
  expect(textAfterUndo).toBe("");

  // Redo
  const rvRedo = await getRenderedVersion(page);
  await page.keyboard.press("Control+Shift+z");
  await waitForRender(page, rvRedo);

  const textAfterRedo = await getCommittedText(page);
  expect(textAfterRedo.split("\n")).toEqual([
    "┌───┐",
    "│   │",
    "│   │",
    "└───┘",
  ]);
});

// ---------------------------------------------------------------------------
// Canvas rendering responds to store changes
// ---------------------------------------------------------------------------

test("canvas renders after drawing", async ({ page }) => {
  await page.goto("/");
  await selectTool(page, "boxes");

  const rv1 = await getRenderedVersion(page);
  await drag(page, -2, -1, 2, 2);
  await waitForRender(page, rv1);

  const rv2 = await getRenderedVersion(page);
  // Draw a second box
  await drag(page, 5, -1, 9, 2);
  await waitForRender(page, rv2);

  const rv3 = await getRenderedVersion(page);
  // Each drawing action should have caused additional paints
  expect(rv2).toBeGreaterThan(rv1);
  expect(rv3).toBeGreaterThan(rv2);
});

test("canvas committed size matches box perimeter", async ({ page }) => {
  await page.goto("/");
  const sizeBefore = await getCommittedSize(page);
  expect(sizeBefore).toBe(0);

  await selectTool(page, "boxes");
  // Draw a 5-wide x 4-tall box (cells -2..2 x -1..2)
  await drag(page, -2, -1, 2, 2);

  const sizeAfter = await getCommittedSize(page);
  // 5x4 box border = 2*(5+4) - 4 corners counted once = 14 cells
  expect(sizeAfter).toBe(14);
});

// ---------------------------------------------------------------------------
// Dark mode toggle
// ---------------------------------------------------------------------------

test("toggle dark mode", async ({ page }) => {
  await page.goto("/");

  // Verify starts in light mode
  const darkBefore = await page.evaluate(() =>
    window.__asciiflow__.getDarkMode()
  );
  expect(darkBefore).toBe(false);

  const canvas = page.locator("canvas");
  const bgBefore = await canvas.evaluate((el) => el.style.backgroundColor);
  // Nord Snow Storm: #eceff4
  expect(bgBefore).toBe("rgb(236, 239, 244)");

  // Toggle dark mode via bridge
  const rv = await getRenderedVersion(page);
  await page.evaluate(() => window.__asciiflow__.setDarkMode(true));
  await waitForRender(page, rv);

  const darkAfter = await page.evaluate(() =>
    window.__asciiflow__.getDarkMode()
  );
  expect(darkAfter).toBe(true);

  // Nord Polar Night: #2e3440
  const bgAfter = await canvas.evaluate((el) => el.style.backgroundColor);
  expect(bgAfter).toBe("rgb(46, 52, 64)");
});

// ---------------------------------------------------------------------------
// Export with box tool
// ---------------------------------------------------------------------------

test("draw box, export, and copy to clipboard", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto("/");
  await expect(page).toHaveTitle("ASCIIFlow");

  await selectTool(page, "boxes");
  await drag(page, -2, -1, 2, 2);

  // Verify via test bridge
  const committedText = await getCommittedText(page);
  expect(committedText.split("\n")).toEqual([
    "┌───┐",
    "│   │",
    "│   │",
    "└───┘",
  ]);

  // Verify via export panel
  await page.getByTestId("export-button").click();
  const dialog = page.getByTestId("export-dialog");
  await expect(dialog).toBeVisible();

  // Open the preview to see the export text
  await page.getByText("[preview]").click();

  const exportText = page.getByTestId("export-text");
  await expect(exportText).toBeVisible();
  const exportedText = await exportText.textContent();
  expect(exportedText.split("\n")).toEqual([
    "┌───┐",
    "│   │",
    "│   │",
    "└───┘",
  ]);

  // Copy to clipboard. Windows normalizes line endings to CRLF when writing
  // plain text to the clipboard, so compare with normalized newlines.
  await page.getByTestId("copy-to-clipboard").click();
  const clipboardText = await page.evaluate(() =>
    navigator.clipboard.readText()
  );
  expect(clipboardText.replace(/\r\n/g, "\n")).toBe(exportedText);
});

// ---------------------------------------------------------------------------
// Tool switching via keyboard shortcuts
// ---------------------------------------------------------------------------

test("alt+number switches tools", async ({ page }) => {
  await page.goto("/");

  // Click on the canvas to ensure focus is within #root for keyboard events
  await clickCell(page, 0, 0);

  // alt+1 = BOX(1), alt+2 = SELECT(2), alt+3 = FREEFORM(3),
  // alt+4 = ARROWS(6), alt+5 = LINES(4), alt+6 = TEXT(7)

  let mode = await page.evaluate(() => window.__asciiflow__.getToolMode());
  expect(mode).toBe(1); // BOX

  await page.keyboard.press("Alt+6");
  mode = await page.evaluate(() => window.__asciiflow__.getToolMode());
  expect(mode).toBe(7); // TEXT

  await page.keyboard.press("Alt+2");
  mode = await page.evaluate(() => window.__asciiflow__.getToolMode());
  expect(mode).toBe(2); // SELECT

  await page.keyboard.press("Alt+3");
  mode = await page.evaluate(() => window.__asciiflow__.getToolMode());
  expect(mode).toBe(3); // FREEFORM

  await page.keyboard.press("Alt+4");
  mode = await page.evaluate(() => window.__asciiflow__.getToolMode());
  expect(mode).toBe(6); // ARROWS

  await page.keyboard.press("Alt+5");
  mode = await page.evaluate(() => window.__asciiflow__.getToolMode());
  expect(mode).toBe(4); // LINES

  await page.keyboard.press("Alt+1");
  mode = await page.evaluate(() => window.__asciiflow__.getToolMode());
  expect(mode).toBe(1); // BOX
});

// ---------------------------------------------------------------------------
// Composite: draw with multiple tools
// ---------------------------------------------------------------------------

test("draw box then add text inside", async ({ page }) => {
  await page.goto("/");

  // Draw a large box
  await selectTool(page, "boxes");
  await drag(page, -4, -2, 4, 2);

  // Switch to text tool and type inside the box
  await selectTool(page, "text");
  await clickCell(page, -2, 0);
  await page.keyboard.type("Hi!");
  await page.keyboard.press("Enter");

  const text = await getCommittedText(page);
  expect(text).toContain("Hi!");
  expect(text).toContain("┌───────┐");
  expect(text).toContain("└───────┘");
});

test("draw box then arrow into it", async ({ page }) => {
  await page.goto("/");

  // Draw a box on the right side
  await selectTool(page, "boxes");
  await drag(page, 2, -1, 6, 2);

  // Draw an arrow pointing into the box from the left
  await selectTool(page, "arrow");
  await drag(page, -3, 0, 1, 0);

  const text = await getCommittedText(page);
  // Should have the box structure
  expect(text).toContain("┌───┐");
  expect(text).toContain("└───┘");
  // Should have an arrow shaft and arrowhead
  expect(text).toMatch(/[─]+[►>→]/);
});

// ---------------------------------------------------------------------------
// Pan & Zoom (#28, #129, #195, #297)
// ---------------------------------------------------------------------------

test("scroll pans the canvas", async ({ page }) => {
  await page.goto("/");

  const before = await page.evaluate(() =>
    window.__asciiflow__.getOffset()
  );

  const vp = page.viewportSize();
  await page.mouse.move(vp.width / 2, vp.height / 2);

  const rv = await getRenderedVersion(page);
  await page.mouse.wheel(0, 160);
  await waitForRender(page, rv);

  const after = await page.evaluate(() =>
    window.__asciiflow__.getOffset()
  );
  // Scrolling down should increase the Y offset (pan down).
  expect(after.y).toBeGreaterThan(before.y);
  // X should be unchanged for a purely vertical scroll.
  expect(after.x).toBe(before.x);
});

test("ctrl+scroll zooms instead of panning", async ({ page }) => {
  await page.goto("/");

  const initialZoom = await page.evaluate(() =>
    window.__asciiflow__.getZoom()
  );
  expect(initialZoom).toBe(1);

  const vp = page.viewportSize();
  await page.mouse.move(vp.width / 2, vp.height / 2);

  const rv = await getRenderedVersion(page);
  // Ctrl + scroll up = zoom in.
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -300);
  await page.keyboard.up("Control");
  await waitForRender(page, rv);

  const newZoom = await page.evaluate(() =>
    window.__asciiflow__.getZoom()
  );
  expect(newZoom).toBeGreaterThan(1);
});

test("space inserts space in text mode (#195, #297)", async ({ page }) => {
  await page.goto("/");
  await selectTool(page, "text");

  await clickCell(page, 0, 0);

  const rv = await getRenderedVersion(page);
  await page.keyboard.type("a b");
  await page.keyboard.press("Enter");
  await waitForRender(page, rv);

  const text = await getCommittedText(page);
  expect(text).toBe("a b");
});

// ---------------------------------------------------------------------------
// Copy / Paste (#187, #338)
// ---------------------------------------------------------------------------

test("select box, copy, paste duplicates it", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");

  // Draw a box.
  await selectTool(page, "boxes");
  await drag(page, -2, -1, 2, 2);

  const textBefore = await getCommittedText(page);
  expect(textBefore.split("\n")).toEqual(["┌───┐", "│   │", "│   │", "└───┘"]);

  // Select the box area (start from empty cell so we get a selection,
  // not a move — starting on a special character triggers move mode).
  await selectTool(page, "select---move");
  await drag(page, -3, -2, 3, 3);

  // Copy.
  await page.keyboard.press("Control+c");

  // Verify clipboard content contains the box.
  const clipboardText = await page.evaluate(() =>
    navigator.clipboard.readText()
  );
  expect(clipboardText).toContain("┌───┐");
  expect(clipboardText).toContain("└───┘");

  // Click somewhere else to clear the selection, then paste.
  await clickCell(page, 10, 0);

  const rv = await getRenderedVersion(page);
  await page.keyboard.press("Control+v");
  await waitForRender(page, rv);

  const textAfter = await getCommittedText(page);
  // Should have two boxes now (two top-left corners).
  const cornerCount = (textAfter.match(/┌/g) || []).length;
  expect(cornerCount).toBe(2);
});

test("paste text with Windows line endings strips \\r (#187)", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");

  // Write text with \r\n to the clipboard via the browser API.
  await page.evaluate(() =>
    navigator.clipboard.writeText("AB\r\nCD")
  );

  // Paste.
  const rv = await getRenderedVersion(page);
  await page.keyboard.press("Control+v");
  await waitForRender(page, rv);

  const text = await getCommittedText(page);
  expect(text.split("\n")).toEqual(["AB", "CD"]);
});

test("cut removes selection and puts text on clipboard", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");

  // Draw a box.
  await selectTool(page, "boxes");
  await drag(page, -2, -1, 2, 2);

  const textBefore = await getCommittedText(page);
  expect(textBefore).toContain("┌───┐");

  // Select the box area (start from empty cell so we get a selection,
  // not a move — starting on a special character triggers move mode).
  await selectTool(page, "select---move");
  await drag(page, -3, -2, 3, 3);

  // Cut.
  await page.keyboard.press("Control+x");
  await page.waitForTimeout(200);

  // Clipboard should have the box text.
  const clipboardText = await page.evaluate(() =>
    navigator.clipboard.readText()
  );
  expect(clipboardText).toContain("┌───┐");

  // Canvas should be empty after cut.
  const textAfter = await getCommittedText(page);
  expect(textAfter).toBe("");
});

// ---------------------------------------------------------------------------
// Top bar menu items
// ---------------------------------------------------------------------------

test("top bar shows files, export, and help buttons", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("file-button")).toBeVisible();
  await expect(page.getByTestId("export-button")).toBeVisible();
  await expect(page.getByTestId("help-button")).toBeVisible();
});

// ---------------------------------------------------------------------------
// Backspace clears committed text (#193)
// ---------------------------------------------------------------------------

test("backspace erases committed text underneath", async ({ page }) => {
  await page.goto("/");
  await selectTool(page, "text");

  // Type and commit "A"
  await clickCell(page, 0, 0);
  await page.keyboard.type("A");
  await page.keyboard.press("Enter");

  let text = await getCommittedText(page);
  expect(text).toBe("A");

  // Click at the position after "A" (1 cell right of start)
  await clickCell(page, 1, 0);

  // Backspace once to erase "A", then commit.
  const rv = await getRenderedVersion(page);
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Enter");
  await waitForRender(page, rv);

  text = await getCommittedText(page);
  expect(text).toBe("");
});

// ---------------------------------------------------------------------------
// Background image
// ---------------------------------------------------------------------------

/** Create a solid red PNG buffer and import it as the background image. */
async function importBackground(page, { scale = "100" } = {}) {
  await page.getByTestId("bg-import-button").click();
  await expect(page.getByTestId("bg-dialog")).toBeVisible();

  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 100;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ff0000";
    context.fillRect(0, 0, 100, 100);
    return canvas.toDataURL("image/png");
  });
  const buffer = Buffer.from(dataUrl.split(",")[1], "base64");

  await page.getByTestId("bg-scale").selectOption(scale);
  await page.getByTestId("bg-file").setInputFiles({
    name: "red.png",
    mimeType: "image/png",
    buffer,
  });
  await expect(page.getByTestId("bg-meta")).toBeVisible({ timeout: 5000 });

  await page.getByTestId("bg-import").click();
  await expect(page.getByTestId("bg-opacity")).toBeVisible();
  await expect(page.getByTestId("bg-dialog")).toHaveCount(0);
}

async function hideGrid(page) {
  const rv = await getRenderedVersion(page);
  await page.getByTestId("toggle-grid").click();
  await waitForRender(page, rv);
}

/** Sample a canvas pixel at an offset (in CSS px) from the viewport center. */
async function sampleBackground(page, dx = 0, dy = 0) {
  return page.evaluate(
    ({ dx, dy }) => {
      const canvas = document.getElementById("ascii-canvas");
      const context = canvas.getContext("2d");
      const dpr = window.devicePixelRatio || 1;
      const x = Math.round(canvas.width / 2 + dx * dpr);
      const y = Math.round(canvas.height / 2 + dy * dpr);
      const data = context.getImageData(x, y, 1, 1).data;
      return { r: data[0], g: data[1], b: data[2], a: data[3] };
    },
    { dx, dy }
  );
}

test.describe("background image", () => {
  test("imports centered behind the canvas", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("view-button").click();
    await importBackground(page, { scale: "100" });
    await hideGrid(page);

    const background = await page.evaluate(() =>
      window.__asciiflow__.getBackground()
    );
    expect(background).not.toBeNull();
    expect(background.naturalW).toBe(100);
    expect(background.naturalH).toBe(100);
    expect(background.scale).toBe(1);
    expect(background.opacity).toBeCloseTo(0.35, 2);
    expect(background.visible).toBe(true);
    // Default offset is the grid center (MAX_GRID_WIDTH/2, MAX_GRID_HEIGHT/2).
    expect(background.centerCell.x).toBeCloseTo(1000, 0);
    expect(background.centerCell.y).toBeCloseTo(300, 0);

    await expect
      .poll(async () => (await sampleBackground(page)).a)
      .toBeGreaterThan(0);
    const center = await sampleBackground(page);
    expect(center.r).toBeGreaterThan(200);
    // Outside the 100x100 image (half width is 50 px).
    expect((await sampleBackground(page, 80, 0)).a).toBe(0);
  });

  test("opacity slider controls how strongly the image shows", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("view-button").click();
    await importBackground(page);
    await hideGrid(page);

    await expect
      .poll(async () => (await sampleBackground(page)).a)
      .toBeGreaterThan(0);

    let rv = await getRenderedVersion(page);
    await page.getByTestId("bg-opacity").fill("0");
    await waitForRender(page, rv);
    expect((await sampleBackground(page)).a).toBe(0);

    rv = await getRenderedVersion(page);
    await page.getByTestId("bg-opacity").fill("100");
    await waitForRender(page, rv);
    const opaque = await sampleBackground(page);
    expect(opaque.a).toBe(255);
    expect(opaque.r).toBe(255);
    await expect(page.getByTestId("bg-opacity-value")).toHaveText("100%");
  });

  test("scale changes the size and remove clears the image", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("view-button").click();
    await importBackground(page, { scale: "50" });
    await hideGrid(page);

    // 50% of 100px => 50px wide, so 20px from center is inside and 40px outside.
    await expect
      .poll(async () => (await sampleBackground(page, 20, 0)).a)
      .toBeGreaterThan(0);
    expect((await sampleBackground(page, 40, 0)).a).toBe(0);
    await expect(page.getByTestId("bg-scale-value")).toHaveText("50%");

    const rv = await getRenderedVersion(page);
    await page.getByTestId("bg-remove").click();
    await expect(page.getByTestId("bg-opacity")).toHaveCount(0);
    await waitForRender(page, rv);
    expect((await sampleBackground(page)).a).toBe(0);
    expect(
      await page.evaluate(() => window.__asciiflow__.getBackground())
    ).toBeNull();
  });

  test("image stays visible while placing a character", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("view-button").click();
    await importBackground(page, { scale: "100" });
    await hideGrid(page);

    // Draw a character and hold the mouse down: the in-progress cell used to be
    // filled with an opaque gray overlay, hiding the image behind it.
    await selectTool(page, "freeform");
    const cell = await getCellSize(page);
    const start = await cellToPixel(page, 0, 0);
    const end = await cellToPixel(page, 2, 0);
    const rv = await getRenderedVersion(page);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y);
    await waitForRender(page, rv);

    // The cell the pointer started on sits just below-right of the center.
    for (const dx of [cell.w / 2, cell.w * 1.5]) {
      const held = await sampleBackground(page, dx, cell.h / 3);
      expect(held.r).toBeGreaterThan(200);
      expect(held.r - held.g).toBeGreaterThan(30);
    }

    await page.mouse.up();
  });

  test("background survives a reload", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("view-button").click();
    await importBackground(page);
    await hideGrid(page);

    await page.reload();
    await page.getByTestId("view-button").click();

    await expect(page.getByTestId("bg-opacity")).toBeVisible();
    await expect(page.getByTestId("bg-opacity-value")).toHaveText("35%");
    await expect
      .poll(async () => (await sampleBackground(page)).a)
      .toBeGreaterThan(0);
  });
});
