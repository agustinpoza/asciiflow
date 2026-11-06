import {
  computeBackgroundScale,
  percentToScale,
} from "#asciiflow/client/background_scale";
import {
  fileToBackgroundSource,
  IBackgroundSource,
} from "#asciiflow/client/background_image";
import {
  CHAR_PIXELS_H,
  CHAR_PIXELS_V,
} from "#asciiflow/client/constants";
import { store, useAppStore } from "#asciiflow/client/store";
import {
  Button,
  Dialog,
  Select,
  Toast,
} from "#asciiflow/client/ui/components";
import styles from "#asciiflow/client/toolbar.module.css";
import * as React from "react";
import { useEffect, useRef, useState } from "react";

import type { BackgroundScaleMode } from "#asciiflow/client/background_scale";

// ---------------------------------------------------------------------------
// Import dialog
// ---------------------------------------------------------------------------

const SCALE_OPTIONS: Array<{ value: BackgroundScaleMode; label: string }> = [
  { value: "fit", label: "fit" },
  { value: "fit-width", label: "fit width" },
  { value: "fit-height", label: "fit height" },
  { value: "25", label: "25%" },
  { value: "50", label: "50%" },
  { value: "100", label: "100%" },
  { value: "200", label: "200%" },
  { value: "custom", label: "custom..." },
];

function getViewportSize() {
  return {
    w: document.documentElement.clientWidth,
    h: document.documentElement.clientHeight,
  };
}

function stopKeys(e: React.KeyboardEvent) {
  e.stopPropagation();
  e.nativeEvent.stopImmediatePropagation();
}

/**
 * Dialog shown before a background image is imported. The scale is chosen
 * here, while the image is only placed on the canvas when "import" is pressed.
 */
export function BackgroundImportDialog({
  open,
  onClose,
  onPersistFailure,
}: {
  open: boolean;
  onClose: () => void;
  onPersistFailure: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<IBackgroundSource | null>(null);
  const [mode, setMode] = useState<BackgroundScaleMode>("fit");
  const [customPercent, setCustomPercent] = useState("100");
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewport, setViewport] = useState(getViewportSize);
  const loadToken = useRef(0);

  useEffect(() => {
    if (!open) {
      return;
    }
    // Start from a clean slate every time the dialog opens.
    loadToken.current++;
    setFile(null);
    setSource(null);
    setMode("fit");
    setCustomPercent("100");
    setPreparing(false);
    setError(null);
    setViewport(getViewportSize());
  }, [open]);

  const customScale = percentToScale(parseFloat(customPercent));
  const scale =
    mode === "custom"
      ? customScale
      : source
      ? computeBackgroundScale(
          mode,
          source.naturalW,
          source.naturalH,
          viewport.w,
          viewport.h
        )
      : 1;

  async function handleFile(next: File | null) {
    const token = ++loadToken.current;
    setFile(next);
    setSource(null);
    setError(null);
    if (!next) {
      return;
    }
    if (!next.type.startsWith("image/")) {
      setError("that file is not an image");
      return;
    }
    setPreparing(true);
    try {
      const prepared = await fileToBackgroundSource(next);
      if (token === loadToken.current) {
        setSource(prepared);
      }
    } catch {
      if (token === loadToken.current) {
        setError("could not read that image");
      }
    } finally {
      if (token === loadToken.current) {
        setPreparing(false);
      }
    }
  }

  function handleImport() {
    if (!source) {
      return;
    }
    const persisted = store.currentCanvas.importBackground(source, scale);
    if (!persisted) {
      onPersistFailure();
    }
    onClose();
  }

  const charsW = source
    ? Math.max(1, Math.round((source.naturalW * scale) / CHAR_PIXELS_H))
    : 0;
  const charsH = source
    ? Math.max(1, Math.round((source.naturalH * scale) / CHAR_PIXELS_V))
    : 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="background image"
      testId="bg-dialog"
      actions={
        <>
          <Button onClick={onClose}>cancel</Button>
          <Button
            variant="primary"
            data-testid="bg-import"
            disabled={!source || preparing}
            onClick={handleImport}
          >
            {preparing ? "preparing..." : "import"}
          </Button>
        </>
      }
    >
      <div className={styles.bgDialogBody} onKeyDown={stopKeys}>
        <Select
          label="scale"
          testId="bg-scale"
          value={mode}
          onChange={(value) => setMode(value as BackgroundScaleMode)}
        >
          {SCALE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        {mode === "custom" && (
          <label className={styles.bgRow}>
            <span className={styles.viewLabel}>percent:</span>
            <input
              className={styles.bgNumberInput}
              data-testid="bg-custom-scale"
              type="number"
              min={5}
              max={500}
              step={5}
              value={customPercent}
              onChange={(e) => setCustomPercent(e.target.value)}
              onKeyDown={stopKeys}
            />
            <span className={styles.viewLabel}>%</span>
          </label>
        )}

        <div className={styles.bgRow}>
          <label className={styles.bgFileLabel}>
            [choose image]
            <input
              className={styles.bgFileInput}
              data-testid="bg-file"
              type="file"
              accept="image/*"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <span className={styles.bgFileName}>
            {file ? file.name : "no file selected"}
          </span>
        </div>

        {error && <div className={styles.bgError}>{error}</div>}

        {source && (
          <>
            <div className={styles.bgPreviewBox}>
              <img
                className={styles.bgPreviewImage}
                src={source.dataUrl}
                alt="background preview"
              />
            </div>
            <div className={styles.bgMeta} data-testid="bg-meta">
              {source.naturalW}{"\u00d7"}{source.naturalH} px {"\u2192"}{" "}
              {Math.round(scale * 100)}% {"\u2192"} {"\u2248"}{charsW}
              {"\u00d7"}{charsH} characters
            </div>
          </>
        )}

        {preparing && <div className={styles.bgMeta}>preparing image...</div>}

        <div className={styles.bgMeta}>
          the image is placed under the grid and centered on the current view.
          large images are downscaled before saving.
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Background controls (inside the view panel)
// ---------------------------------------------------------------------------

/** Inline controls shown in the view panel once an image is imported. */
export function BackgroundControls() {
  // Subscribing to canvasVersion keeps these controls in sync with the store.
  useAppStore((s) => s.canvasVersion);
  const background = store.currentCanvas.background;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  return (
    <>
      <span className={styles.sep}>{"\u2502"}</span>
      {!background ? (
        <>
          <span className={styles.viewLabel}>
            background: <span className={styles.viewValue}>none</span>
          </span>
          <button
            className={styles.actionBtn}
            style={{ color: "var(--color-accent)" }}
            data-testid="bg-import-button"
            onClick={() => setDialogOpen(true)}
          >
            [import]
          </button>
        </>
      ) : (
        <>
          <span className={styles.viewLabel}>
            bg:{" "}
            <span className={styles.viewValue} data-testid="bg-opacity-value">
              {Math.round(background.opacity * 100)}%
            </span>
          </span>
          <input
            className={styles.bgSlider}
            data-testid="bg-opacity"
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(background.opacity * 100)}
            onChange={(e) =>
              store.currentCanvas.setBackgroundOpacity(
                Number(e.target.value) / 100
              )
            }
          />
          <span className={styles.viewLabel}>
            scale:{" "}
            <span className={styles.viewValue} data-testid="bg-scale-value">
              {Math.round(background.scale * 100)}%
            </span>
          </span>
          <button
            className={styles.bgScaleStep}
            title="smaller background"
            data-testid="bg-scale-down"
            onClick={() =>
              store.currentCanvas.setBackgroundScale(background.scale / 1.25)
            }
          >
            [-]
          </button>
          <button
            className={styles.bgScaleStep}
            title="larger background"
            data-testid="bg-scale-up"
            onClick={() =>
              store.currentCanvas.setBackgroundScale(background.scale * 1.25)
            }
          >
            [+]
          </button>
          <button
            className={styles.actionBtn}
            style={{ color: "var(--color-success)" }}
            data-testid="bg-visible"
            onClick={() =>
              store.currentCanvas.setBackgroundVisible(!background.visible)
            }
          >
            [{background.visible ? "hide" : "show"}]
          </button>
          <button
            className={styles.actionBtn}
            style={{ color: "var(--color-orange)" }}
            data-testid="bg-recenter"
            onClick={() => store.currentCanvas.recenterBackground()}
          >
            [re-center]
          </button>
          <button
            className={styles.actionBtn}
            style={{ color: "var(--color-cyan)" }}
            data-testid="bg-replace"
            onClick={() => setDialogOpen(true)}
          >
            [replace]
          </button>
          <button
            className={styles.actionBtn}
            style={{ color: "var(--color-danger)" }}
            data-testid="bg-remove"
            onClick={() => store.currentCanvas.removeBackground()}
          >
            [remove]
          </button>
        </>
      )}
      <BackgroundImportDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onPersistFailure={() =>
          setToastMessage(
            "image too large to save: it will be lost when you reload"
          )
        }
      />
      <Toast
        open={toastMessage !== null}
        message={toastMessage ?? ""}
        onClose={() => setToastMessage(null)}
      />
    </>
  );
}
