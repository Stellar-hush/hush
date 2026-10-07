/**
 * executionContract.fixtures.ts — deterministic fixtures for the shared-draft
 * execution contract (#1346). No production data.
 */
import type { CreateDraftInput } from "./types";

/** Valid create input (success path). */
export const VALID_CREATE: CreateDraftInput = {
  title: "Launch Announcement",
  subject: "Hush v1 launch",
  collaborators: 2,
};

/** Invalid create input: empty title triggers a validation error. */
export const INVALID_CREATE_EMPTY_TITLE: CreateDraftInput = {
  title: "   ",
  subject: "broken",
};

/** Invalid create input: collaborators out of range triggers a validation error. */
export const INVALID_CREATE_BAD_COLLAB: CreateDraftInput = {
  title: "Valid Title",
  collaborators: 999,
};

/** An id that does not exist (not-found path). */
export const UNKNOWN_DRAFT_ID = "draft-does-not-exist";
