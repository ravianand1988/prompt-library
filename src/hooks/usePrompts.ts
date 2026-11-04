import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  fetchPrompts,
  importPrompts,
  postPrompt,
  putFavorite,
  putMetadata,
  putPrompt,
  removePrompt,
} from "../api/promptApi";
import { hasErrors, validateInput } from "../prompt";
import {
  clearLegacyPrompts,
  readLegacyPrompts,
} from "../storage/legacyStorage";
import type { NewPromptInput, Prompt, PromptEdit } from "../types";

export type AddResult =
  | { ok: true }
  | {
      ok: false;
      errors: {
        title?: string;
        content?: string;
        category?: string;
        model?: string;
        storage?: string;
      };
    };

export type LoadStatus = "loading" | "ready" | "error";

export const SAVE_ERROR =
  "Couldn't reach the prompt server. Check that the app is running and try again.";

const saveFailed: AddResult = { ok: false, errors: { storage: SAVE_ERROR } };

/** Moves prompts left in localStorage by older versions into the database. */
async function migrateLegacyPrompts(): Promise<void> {
  const legacy = readLegacyPrompts();
  if (legacy.length === 0) return;
  // The server ignores ids it already has, so a repeat (StrictMode, two tabs) is harmless.
  await importPrompts(legacy);
  clearLegacyPrompts();
}

export function usePrompts() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      const next = await fetchPrompts();
      if (!active) return;
      setPrompts(next);
      setStatus("ready");
    };

    migrateLegacyPrompts()
      .then(refresh)
      .catch(() => {
        if (active) setStatus("error");
      });

    // Another tab may have changed the database; a failed refetch keeps what we show.
    const onFocus = () => {
      refresh().catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const addPrompt = useCallback(
    async (input: NewPromptInput): Promise<AddResult> => {
      const errors = validateInput(input);
      if (hasErrors(errors)) return { ok: false, errors };
      try {
        const result = await postPrompt(input);
        if (!result.ok) return result;
        setPrompts((current) => [result.prompt, ...current]);
        return { ok: true };
      } catch (error) {
        if (error instanceof ApiError) return saveFailed;
        throw error;
      }
    },
    [],
  );

  const editPrompt = useCallback(
    async (id: string, edit: PromptEdit): Promise<AddResult> => {
      const errors = validateInput(edit);
      if (hasErrors(errors)) return { ok: false, errors };
      try {
        const result = await putPrompt(id, edit);
        if (!result.ok) return result;
        setPrompts((current) =>
          current.map((p) => (p.id === id ? result.prompt : p)),
        );
        return { ok: true };
      } catch (error) {
        if (error instanceof ApiError) return saveFailed;
        throw error;
      }
    },
    [],
  );

  const deletePrompt = useCallback(async (id: string): Promise<AddResult> => {
    try {
      await removePrompt(id);
    } catch (error) {
      if (error instanceof ApiError) return saveFailed;
      throw error;
    }
    setPrompts((current) => current.filter((p) => p.id !== id));
    return { ok: true };
  }, []);

  // Latest toggle per prompt, so a slow failure can't roll back a newer click.
  const favoriteSeq = useRef(new Map<string, number>());

  /**
   * Flips the heart immediately, then saves. If the save fails and no newer click
   * has happened since, the prompt goes back to what it was before this click.
   */
  const toggleFavorite = useCallback(
    async (id: string, isFavorite: boolean): Promise<AddResult> => {
      const seq = (favoriteSeq.current.get(id) ?? 0) + 1;
      favoriteSeq.current.set(id, seq);
      const setFlag = (value: boolean) =>
        setPrompts((current) =>
          current.map((p) => (p.id === id ? { ...p, isFavorite: value } : p)),
        );
      setFlag(isFavorite);
      try {
        await putFavorite(id, isFavorite);
        return { ok: true };
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        if (favoriteSeq.current.get(id) === seq) setFlag(!isFavorite);
        return saveFailed;
      }
    },
    [],
  );

  /** Saves the model for a prompt; the server stamps the timestamps and token estimate. */
  const saveMetadata = useCallback(
    async (id: string, model: string, isCode: boolean): Promise<AddResult> => {
      try {
        const result = await putMetadata(id, model, isCode);
        if (!result.ok) return result;
        setPrompts((current) =>
          current.map((p) => (p.id === id ? result.prompt : p)),
        );
        return { ok: true };
      } catch (error) {
        if (error instanceof ApiError) return saveFailed;
        throw error;
      }
    },
    [],
  );

  return {
    prompts,
    status,
    addPrompt,
    editPrompt,
    deletePrompt,
    toggleFavorite,
    saveMetadata,
  };
}
