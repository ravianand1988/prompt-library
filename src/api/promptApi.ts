import { type ValidationErrors, parsePrompt, parsePrompts } from "../prompt";
import type { NewPromptInput, Prompt, PromptEdit } from "../types";

/** The server couldn't be reached or answered with an unexpected status. */
export class ApiError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ApiError";
  }
}

export async function request(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(path, init);
  } catch (error) {
    throw new ApiError(`Network error for ${path}`, { cause: error });
  }
}

export async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch (error) {
    throw new ApiError(`Invalid JSON from ${res.url}`, { cause: error });
  }
}

export const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export async function fetchPrompts(): Promise<Prompt[]> {
  const res = await request("/api/prompts");
  if (!res.ok) throw new ApiError(`GET /api/prompts failed: ${res.status}`);
  const body = await readJson(res);
  if (!Array.isArray(body))
    throw new ApiError("GET /api/prompts returned a non-array");
  return parsePrompts(body);
}

export async function postPrompt(
  input: NewPromptInput,
): Promise<
  { ok: true; prompt: Prompt } | { ok: false; errors: ValidationErrors }
> {
  const res = await request("/api/prompts", jsonInit("POST", input));
  if (res.status === 201) {
    const prompt = parsePrompt(await readJson(res));
    if (!prompt)
      throw new ApiError("POST /api/prompts returned an invalid prompt");
    return { ok: true, prompt };
  }
  if (res.status === 400) {
    const body = (await readJson(res)) as { errors?: ValidationErrors } | null;
    if (body?.errors) return { ok: false, errors: body.errors };
  }
  throw new ApiError(`POST /api/prompts failed: ${res.status}`);
}

/** Saves new title, content and category for an existing prompt. */
export async function putPrompt(
  id: string,
  edit: PromptEdit,
): Promise<
  { ok: true; prompt: Prompt } | { ok: false; errors: ValidationErrors }
> {
  const res = await request(
    `/api/prompts/${encodeURIComponent(id)}`,
    jsonInit("PUT", edit),
  );
  if (res.ok) {
    const prompt = parsePrompt(await readJson(res));
    if (!prompt)
      throw new ApiError("PUT /api/prompts returned an invalid prompt");
    return { ok: true, prompt };
  }
  if (res.status === 400) {
    const body = (await readJson(res)) as { errors?: ValidationErrors } | null;
    if (body?.errors) return { ok: false, errors: body.errors };
  }
  throw new ApiError(`PUT /api/prompts failed: ${res.status}`);
}

export async function removePrompt(id: string): Promise<void> {
  const res = await request(`/api/prompts/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new ApiError(`DELETE /api/prompts failed: ${res.status}`);
}

/** Sets (not toggles) the flag, so a retried request can't undo itself. */
export async function putFavorite(
  id: string,
  isFavorite: boolean,
): Promise<Prompt> {
  const res = await request(
    `/api/prompts/${encodeURIComponent(id)}/favorite`,
    jsonInit("PUT", { isFavorite }),
  );
  if (!res.ok) throw new ApiError(`PUT favorite failed: ${res.status}`);
  const prompt = parsePrompt(await readJson(res));
  if (!prompt) throw new ApiError("PUT favorite returned an invalid prompt");
  return prompt;
}

/** Adds metadata to a prompt, or changes the model on metadata it already has. */
export async function putMetadata(
  id: string,
  model: string,
  isCode: boolean,
): Promise<
  { ok: true; prompt: Prompt } | { ok: false; errors: ValidationErrors }
> {
  const res = await request(
    `/api/prompts/${encodeURIComponent(id)}/metadata`,
    jsonInit("PUT", { model, isCode }),
  );
  if (res.ok) {
    const prompt = parsePrompt(await readJson(res));
    if (!prompt) throw new ApiError("PUT metadata returned an invalid prompt");
    return { ok: true, prompt };
  }
  if (res.status === 400) {
    const body = (await readJson(res)) as { errors?: ValidationErrors } | null;
    if (body?.errors) return { ok: false, errors: body.errors };
  }
  throw new ApiError(`PUT metadata failed: ${res.status}`);
}

export async function importPrompts(prompts: Prompt[]): Promise<number> {
  const res = await request(
    "/api/prompts/import",
    jsonInit("POST", { prompts }),
  );
  if (!res.ok)
    throw new ApiError(`POST /api/prompts/import failed: ${res.status}`);
  const body = (await readJson(res)) as { imported?: unknown } | null;
  return typeof body?.imported === "number" ? body.imported : 0;
}
