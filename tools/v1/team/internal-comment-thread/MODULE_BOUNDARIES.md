# Internal Comment Thread - Module Boundaries

This document defines the internal contracts, public interfaces, and dependency rules for each module inside the Internal Comment Thread tool. The tool is a V1, team-audience mini-product that allows team members to leave internal annotations on shared inbox messages. Comments are visible only inside the team and must never reach an external sender. It is built in isolation and is not wired into the main application yet.

## 1. Module: Types (shared contracts)

Location: `types/` (for example, `types/index.ts`).

Responsibility: declares the shared TypeScript interfaces used across the tool. Owns no logic and imports nothing.

Public API:

    export type CommentTarget =
      | { kind: "message"; id: string }
      | { kind: "thread"; id: string };

    export interface InternalComment {
      id: string;
      target: CommentTarget;
      author: string;        // Hush address of team member
      body: string;
      createdAt: string;
      updatedAt?: string;
    }

    export interface CommentResult {
      comment: InternalComment;
    }

    export interface ListCommentsResult {
      comments: InternalComment[];
    }

Dependencies: no imports from `components/`, `services/`, `hooks/`, or the main application.

## 2. Module: Services (business logic)

Location: `services/` (for example, `services/comment.service.ts`).

Responsibility: encapsulates all framework-free logic — target resolution, comment creation, ownership checks, and list filtering. Services never import React and never reach outside this folder. They must enforce the team-only visibility rule in every operation.

Public API:

    export function createCommentService(): {
      addComment: (
        target: CommentTarget,
        body: string,
        author: string,
      ) => InternalComment;
      listComments: (target: CommentTarget) => InternalComment[];
      updateComment: (
        id: string,
        newBody: string,
        author: string,
      ) => InternalComment;
      deleteComment: (id: string, author: string) => void;
    };

Dependencies:

- Allowed to import: TypeScript types from `../types/`.
- Forbidden: React or hooks, presentational components, main app stores or APIs, and any code that could serialize comment body for external delivery.

## 3. Module: Hooks (React integration)

Location: `hooks/` (for example, `hooks/use-internal-comments.ts`).

Responsibility: synchronizes the service with React components, managing the current target, the list of comments, authoring state, and error/loading state. Hooks must never allow comment data to escape into any external rendering or delivery path.

Public API:

    export function useInternalComments(target: CommentTarget): {
      comments: InternalComment[];
      add: (body: string) => void;
      update: (id: string, newBody: string) => void;
      remove: (id: string) => void;
      isLoading: boolean;
      error: string | null;
    };

Dependencies:

- Allowed to import: React hooks, the service factory from `../services/`, and types from `../types/`.
- Forbidden: presentational components and core app state contexts.

## 4. Module: Components (user interface)

Location: `components/`.

Responsibility: renders the visual elements of the tool (comment list, composer, edit/delete controls). Components stay presentational and delegate all actions to the hook. They must never render or log comment content in a way that could be captured by external sender flows.

Public API:

    // InternalCommentList.tsx
    export const InternalCommentList: React.FC<{
      target: CommentTarget;
    }>;

    // InternalCommentComposer.tsx
    export const InternalCommentComposer: React.FC<{
      onSubmit: (body: string) => void;
    }>;

    // InternalCommentThread.tsx
    export const InternalCommentThread: React.FC<{
      target: CommentTarget;
    }>;

Dependencies:

- Allowed to import: hooks from `../hooks/`, types from `../types/`, and external presentational assets such as icons.
- Forbidden: core app features, layout navigation, or importing service functions directly.

## Import rules checklist

- [ ] Only import from files inside `tools/v1/team/internal-comment-thread/`.
- [ ] Maintain a one-way dependency flow: components -> hooks -> services -> types.
- [ ] No circular dependencies.
- [ ] All shared interfaces are imported from `types/`.
- [ ] No path may ever allow comment body text to be included in any output intended for an external sender.
