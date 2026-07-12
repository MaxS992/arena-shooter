/**
 * Sampled input state (keyboard + mouse). No movement logic.
 */

export interface InputState {
  moveX: number;
  moveZ: number;
  sprint: boolean;
  jump: boolean;
  slide: boolean;
  /** True only on the first frame when slide key went down (so we don't enter slide from holding C from start). */
  slideJustPressed: boolean;
  yaw: number;
  pitch: number;
  shoot: boolean;
  reload: boolean;
}

export const defaultInputState: InputState = {
  moveX: 0,
  moveZ: 0,
  sprint: false,
  jump: false,
  slide: false,
  slideJustPressed: false,
  yaw: 0,
  pitch: 0,
  shoot: false,
  reload: false,
};

/** Key codes to lock when pointer lock is active so browser does not handle Ctrl+W / Ctrl+N / Ctrl+T. */
const LOCK_KEYS_FOR_BROWSER_SHORTCUTS = ["KeyW", "KeyN", "KeyT"];

/** Block Ctrl+W / Ctrl+N / Ctrl+T in capture phase so tab doesn't close when pointer locked. */
function installCaptureShortcutBlocker(_getPointerLocked: () => boolean): void {
  document.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      const code = e.code;
      const key = e.key?.toLowerCase();
      const isCtrlClose = e.ctrlKey && (code === "KeyW" || code === "KeyN" || code === "KeyT" || key === "w" || key === "n" || key === "t");
      if (!isCtrlClose) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    { capture: true }
  );
}

export class InputSampler {
  private state: InputState = { ...defaultInputState };
  private pointerLocked = false;
  private sensitivity = 0.002;
  private bound = false;
  /** Keys currently held (code string). Sprint/slide derived from this so they are not overwritten by other key events. */
  private keysDown = new Set<string>();
  private slideWasDown = false;

  getState(): Readonly<InputState> {
    this.state.sprint =
      this.keysDown.has("ShiftLeft") || this.keysDown.has("ShiftRight") || this.keysDown.has("ArrowUp");
    const slideNow = this.keysDown.has("ControlLeft") || this.keysDown.has("ControlRight") || this.keysDown.has("KeyC");
    this.state.slideJustPressed = slideNow && !this.slideWasDown;
    this.slideWasDown = slideNow;
    this.state.slide = slideNow;
    return this.state;
  }

  isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  requestPointerLock(canvas: HTMLCanvasElement): void {
    if (this.bound) return;
    this.bound = true;
    canvas.addEventListener("click", () => {
      canvas.requestPointerLock();
      // Keyboard lock must run in same user gesture as pointer lock. Lock ALL keys so browser
      // never sees Ctrl+W (specific keys alone may not capture modifier combos in some browsers).
      if ((navigator as any).keyboard?.lock) {
        (navigator as any).keyboard.lock().then(() => {}).catch(() => {
          (navigator as any).keyboard!.lock(LOCK_KEYS_FOR_BROWSER_SHORTCUTS).catch(() => {});
        });
      }
    });
    installCaptureShortcutBlocker(() => this.pointerLocked);
    document.addEventListener("pointerlockchange", () => {
      this.pointerLocked = document.pointerLockElement === canvas;
      if (this.pointerLocked) {
        this.keysDown.clear();
        this.slideWasDown = false;
      } else {
        if ((navigator as any).keyboard?.unlock) (navigator as any).keyboard.unlock();
      }
    });
    document.addEventListener("mousemove", (e) => {
      if (!this.pointerLocked) return;
      this.state.yaw -= e.movementX * this.sensitivity;
      this.state.pitch -= e.movementY * this.sensitivity;
      this.state.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.state.pitch));
    });
    const keyOpts = { capture: true };
    const bindKey = (target: EventTarget): void => {
      target.addEventListener("keydown", (e) => this.onKey((e as KeyboardEvent).code, true, e as KeyboardEvent), keyOpts);
      target.addEventListener("keyup", (e) => this.onKey((e as KeyboardEvent).code, false, e as KeyboardEvent), keyOpts);
    };
    bindKey(document);
    bindKey(window);
    bindKey(canvas);
    window.addEventListener("keydown", (e) => this.preventBrowserShortcuts(e), keyOpts);
    window.addEventListener("blur", () => this.syncModifiers(false, false));
  }

  private preventBrowserShortcuts(e: KeyboardEvent): void {
    const key = e.key?.toLowerCase();
    const code = e.code;
    if (e.ctrlKey && (code === "KeyW" || code === "KeyN" || code === "KeyT" || key === "w" || key === "n" || key === "t")) {
      e.preventDefault();
    }
  }

  private syncModifiers(_sprint: boolean, _slide: boolean): void {
    this.keysDown.clear();
    this.slideWasDown = false;
  }

  private onKey(code: string, down: boolean, e?: KeyboardEvent): void {
    if (!e) return;
    const key = e.key?.toLowerCase();
    if (down) this.keysDown.add(code);
    else this.keysDown.delete(code);
    if (code === "KeyW") this.state.moveZ = down ? 1 : (this.state.moveZ === 1 ? 0 : this.state.moveZ);
    if (code === "KeyS") this.state.moveZ = down ? -1 : (this.state.moveZ === -1 ? 0 : this.state.moveZ);
    if (code === "KeyA") this.state.moveX = down ? -1 : (this.state.moveX === -1 ? 0 : this.state.moveX);
    if (code === "KeyD") this.state.moveX = down ? 1 : (this.state.moveX === 1 ? 0 : this.state.moveX);
    if (code === "ShiftLeft" || code === "ShiftRight" || key === "shift") e.preventDefault();
    if (code === "ControlLeft" || code === "ControlRight" || key === "control") e.preventDefault();
    if (code === "KeyC") e.preventDefault();
    if (this.pointerLocked && e.ctrlKey && (code === "KeyW" || code === "KeyN" || code === "KeyT" || key === "w" || key === "n" || key === "t")) {
      e.preventDefault();
    }
    if (code === "Space") {
      e.preventDefault();
      this.state.jump = down;
    }
    if (code === "KeyR") this.state.reload = down;
  }

  setShoot(down: boolean): void {
    this.state.shoot = down;
  }

  /** Call once per frame to sync mouse button (optional) */
  sampleMouse(_canvas: HTMLCanvasElement): void {
    // Mouse buttons sampled via mousedown/mouseup on canvas
  }

  /** Reset one-time actions (call after tick consumed them if needed) */
  consumeOneShoot(): void {
    this.state.shoot = false;
  }
}
