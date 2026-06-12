interface AutoSaverOptions {
    /** Debounce time in milliseconds before scheduling a save. Defaults to 1500. */
    debounceMs?: number;
    /** Timeout for requestIdleCallback in milliseconds. Defaults to 2000. */
    idleTimeout?: number;
    /** The async function that performs the save operation. */
    onSave: () => Promise<void>;
    /** Optional error handler for when onSave fails. */
    onError?: (err: unknown) => void;
}

interface AutoSaver {
    /**
     * Schedules a save operation. Resets the debounce timer on each call.
     * The save will be performed after `debounceMs` when the browser is idle.
     */
    schedule: () => void;
    /**
     * Cancels any pending scheduled save and immediately performs the save operation.
     * @returns A promise that resolves when the save is complete.
     */
    flush: () => Promise<void>;
    /**
     * Cancels any pending scheduled save. Does not cancel a save that is already in progress.
     */
    cancel: () => void;
    /**
     * Cleans up any timers. Should be called when the component unmounts.
     */
    destroy: () => void;
}

/**
 * Creates an auto-saver that uses a combination of debouncing and `requestIdleCallback`
 * to save data without blocking the main thread during user interaction.
 *
 * @param options Configuration for the auto-saver.
 * @returns An AutoSaver instance with `schedule`, `flush`, `cancel`, and `destroy` methods.
 */
export function createAutoSaver({
    debounceMs = 1500,
    idleTimeout = 2000,
    onSave,
    onError = console.error,
}: AutoSaverOptions): AutoSaver {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let isSaving = false;

    const performSave = async () => {
        if (isSaving) {
            return; // A save is already in progress, skip this one to prevent stacking.
        }

        isSaving = true;
        try {
            await onSave();
        } catch (err) {
            onError(err);
        } finally {
            isSaving = false;
        }
    };

    const idleSave = () => {
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(() => performSave(), { timeout: idleTimeout });
        } else {
            // Fallback for environments without requestIdleCallback (e.g., some test runners or older browsers)
            setTimeout(() => performSave(), 0);
        }
    };

    const schedule = () => {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(idleSave, debounceMs);
    };

    const cancel = () => {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
    };

    const flush = async () => {
        cancel(); // Cancel any scheduled save.
        await performSave(); // And run it immediately.
    };

    const destroy = () => {
        cancel();
    };

    return {
        schedule,
        flush,
        cancel,
        destroy,
    };
}