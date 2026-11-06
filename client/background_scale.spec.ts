import { assert } from "chai";
import {
  clampBackgroundScale,
  computeBackgroundScale,
  percentToScale,
} from "#asciiflow/client/background_scale";

describe("background scale", () => {
  describe("clampBackgroundScale", () => {
    it("keeps values in range", () => {
      assert.equal(clampBackgroundScale(0.5), 0.5);
      assert.equal(clampBackgroundScale(0), 1);
      assert.equal(clampBackgroundScale(-2), 1);
      assert.equal(clampBackgroundScale(Number.NaN), 1);
      assert.equal(clampBackgroundScale(100), 5);
      assert.equal(clampBackgroundScale(0.0001), 0.05);
    });
  });

  describe("percentToScale", () => {
    it("converts percentages to multipliers", () => {
      assert.equal(percentToScale(100), 1);
      assert.equal(percentToScale(25), 0.25);
      assert.equal(percentToScale(5000), 5);
    });
  });

  describe("computeBackgroundScale", () => {
    it("fits the image inside the viewport with a margin", () => {
      const scale = computeBackgroundScale("fit", 1000, 500, 1000, 500);
      assert.closeTo(scale, 0.9, 0.0001);
    });

    it("fits width and height independently", () => {
      assert.closeTo(
        computeBackgroundScale("fit-width", 1000, 500, 1000, 200),
        0.9,
        0.0001
      );
      assert.closeTo(
        computeBackgroundScale("fit-height", 1000, 500, 100, 500),
        0.9,
        0.0001
      );
    });

    it("uses the fixed percentages directly", () => {
      assert.equal(computeBackgroundScale("25", 10, 10, 100, 100), 0.25);
      assert.equal(computeBackgroundScale("50", 10, 10, 100, 100), 0.5);
      assert.equal(computeBackgroundScale("100", 10, 10, 100, 100), 1);
      assert.equal(computeBackgroundScale("200", 10, 10, 100, 100), 2);
    });

    it("falls back to 100% for invalid image dimensions", () => {
      assert.equal(computeBackgroundScale("fit", 0, 0, 100, 100), 1);
    });

    it("clamps extreme fits", () => {
      assert.equal(computeBackgroundScale("fit", 1, 1, 10000, 10000), 5);
    });
  });
});
