// Must be first import: shims localStorage and window for Node.js.
import "#asciiflow/testing/test_setup";

import { assert } from "chai";
import * as constants from "#asciiflow/client/constants";
import { DrawingId, storageKey } from "#asciiflow/client/store";
import { CanvasStore } from "#asciiflow/client/store/canvas";
import { Vector } from "#asciiflow/client/vector";

const SOURCE = {
  dataUrl: "data:image/webp;base64,AAAA",
  naturalW: 200,
  naturalH: 100,
};

function newCanvas(id = "background-test") {
  return new CanvasStore(DrawingId.local(id), () => {});
}

describe("CanvasStore background", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts with no background", () => {
    assert.isNull(newCanvas().background);
  });

  it("imports an image centered on the current viewport", () => {
    const canvas = newCanvas();
    canvas.setOffset(new Vector(500 * constants.CHAR_PIXELS_H, 120 * constants.CHAR_PIXELS_V));

    const persisted = canvas.importBackground(SOURCE, 0.5);

    assert.isTrue(persisted);
    assert.deepInclude(canvas.background, {
      dataUrl: SOURCE.dataUrl,
      naturalW: 200,
      naturalH: 100,
      scale: 0.5,
      opacity: 0.35,
      visible: true,
    });
    assert.deepEqual(canvas.background.centerCell, { x: 500, y: 120 });
  });

  it("persists the image and settings per drawing", () => {
    const canvas = newCanvas("persisted");
    canvas.importBackground(SOURCE, 2);
    canvas.setBackgroundOpacity(0.6);
    canvas.setBackgroundVisible(false);

    const reloaded = newCanvas("persisted");
    assert.deepInclude(reloaded.background, {
      dataUrl: SOURCE.dataUrl,
      naturalW: 200,
      naturalH: 100,
      scale: 2,
      opacity: 0.6,
      visible: false,
    });

    assert.isNull(newCanvas("other").background);
  });

  it("clamps opacity and scale", () => {
    const canvas = newCanvas();
    canvas.importBackground(SOURCE, 1);

    canvas.setBackgroundOpacity(-1);
    assert.equal(canvas.background.opacity, 0);
    canvas.setBackgroundOpacity(5);
    assert.equal(canvas.background.opacity, 1);

    canvas.setBackgroundScale(100);
    assert.equal(canvas.background.scale, 5);
    canvas.setBackgroundScale(0);
    assert.equal(canvas.background.scale, 1);
    canvas.setBackgroundScale(0.001);
    assert.equal(canvas.background.scale, 0.05);
  });

  it("re-centers on the current viewport", () => {
    const canvas = newCanvas();
    canvas.importBackground(SOURCE, 1);
    canvas.setOffset(new Vector(40 * constants.CHAR_PIXELS_H, 60 * constants.CHAR_PIXELS_V));

    canvas.recenterBackground();

    assert.deepEqual(canvas.background.centerCell, { x: 40, y: 60 });
  });

  it("removes the image and both storage keys", () => {
    const drawingId = DrawingId.local("removable");
    const canvas = newCanvas("removable");
    canvas.importBackground(SOURCE, 1);

    canvas.removeBackground();

    assert.isNull(canvas.background);
    assert.isNull(localStorage.getItem(storageKey(drawingId, "background-image")));
    assert.isNull(localStorage.getItem(storageKey(drawingId, "background-settings")));
  });

  it("reports a failed write without losing the in-memory image", () => {
    const canvas = newCanvas();
    const originalSetItem = localStorage.setItem;
    (localStorage as any).setItem = () => {
      throw new Error("QuotaExceededError");
    };
    try {
      const persisted = canvas.importBackground(SOURCE, 1);
      assert.isFalse(persisted);
      assert.isNotNull(canvas.background);
    } finally {
      (localStorage as any).setItem = originalSetItem;
    }
  });
});
