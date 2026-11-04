import {
  estimateTokens,
  MetadataError,
  parseMetadata,
  trackModel,
  updateTimestamps,
  validateModelName,
} from "./metadata.ts";
import {
  CATEGORIES,
  type Category,
  type NewPromptInput,
  type Prompt,
  type PromptEdit,
} from "./types.ts";

export type ValidationErrors = {
  title?: string;
  content?: string;
  category?: string;
  model?: string;
};

export const DEFAULT_CATEGORY: Category = "General";

export function isCategory(value: unknown): value is Category {
  return (
    typeof value === "string" &&
    (CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * Returns a valid Prompt, or null. Prompts saved before favorites or categories existed
 * lack those fields; they are read as not favorited and General rather than dropped.
 */
export function parsePrompt(value: unknown): Prompt | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const valid =
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    typeof v.content === "string" &&
    typeof v.createdAt === "number" &&
    // Finite numbers beyond the Date range make toISOString() throw at render time.
    !Number.isNaN(new Date(v.createdAt).getTime()) &&
    (v.isFavorite === undefined || typeof v.isFavorite === "boolean") &&
    (v.category === undefined || isCategory(v.category));
  if (!valid) return null;
  // Metadata that fails validation is dropped rather than losing the whole prompt.
  const metadata = parseMetadata(v.metadata);
  return {
    id: v.id as string,
    title: v.title as string,
    content: v.content as string,
    category: isCategory(v.category) ? v.category : DEFAULT_CATEGORY,
    createdAt: v.createdAt as number,
    isFavorite: v.isFavorite === true,
    ...(metadata && { metadata }),
  };
}

/** Keeps the entries that parse as prompts, dropping the rest. */
export function parsePrompts(values: unknown[]): Prompt[] {
  return values.flatMap((v) => parsePrompt(v) ?? []);
}

export function validateInput(input: NewPromptInput): ValidationErrors {
  const errors: ValidationErrors = {};
  if (input.title.trim() === "") errors.title = "Title is required";
  if (input.content.trim() === "") errors.content = "Content is required";
  if (!isCategory(input.category)) errors.category = "Choose a category";
  if (input.model !== undefined) {
    try {
      validateModelName(input.model);
    } catch (error) {
      if (!(error instanceof MetadataError)) throw error;
      errors.model = error.message;
    }
  }
  return errors;
}

/** True when validateInput found at least one problem. */
export const hasErrors = (errors: ValidationErrors): boolean =>
  Object.values(errors).some(Boolean);

/** Call after validateInput: an invalid model name throws a MetadataError. */
export function createPrompt(input: NewPromptInput, now?: number): Prompt {
  const createdAt = now ?? Date.now();
  return {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    content: input.content,
    category: input.category,
    createdAt,
    isFavorite: false,
    // Same instant as the prompt, so sorting by either createdAt gives one order.
    ...(input.model !== undefined && {
      metadata: trackModel(input.model, input.content, {
        isCode: input.isCode,
        now: createdAt,
      }),
    }),
  };
}

/**
 * The prompt with `edit` applied. Call after validateInput. Keeps id, createdAt and the
 * favorite flag; metadata gets a new updatedAt, and a new token estimate if the content changed.
 */
export function applyEdit(
  prompt: Prompt,
  edit: PromptEdit,
  now: number = Date.now(),
): Prompt {
  const { metadata } = prompt;
  const contentChanged = edit.content !== prompt.content;
  const nextMetadata =
    metadata &&
    updateTimestamps(
      contentChanged
        ? {
            ...metadata,
            tokenEstimate: estimateTokens(edit.content, edit.isCode ?? false),
          }
        : metadata,
      now,
    );
  return {
    ...prompt,
    title: edit.title.trim(),
    content: edit.content,
    category: edit.category,
    ...(nextMetadata && { metadata: nextMetadata }),
  };
}
