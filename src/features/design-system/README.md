# Hush UI system

The design system is the shared visual and interaction layer for feature-owned UI.

## Modules

- `styles/fonts.css` loads and assigns interface, preview, and long-form reader typography.
- `styles/tokens.css` defines color, radius, density, gradient, glass, and shadow values.
- `styles/surfaces.css` owns reusable glass, tile, modal, mail-list, and reader treatments.
- `styles/interactions.css` owns focus, scrolling, motion, selection, and reduced-motion behavior.
- `components/` contains typed action, surface, and empty-state primitives.
- `feedback/` contains queued application notifications and their accessible viewport.

Import React primitives from `@/features/design-system`. Global CSS modules are composed once by
`src/styles.css`; feature code should consume the resulting tokens and utility classes rather than
redeclaring their values.

Feature-specific layouts stay in their feature folders. A primitive belongs here only when it has a
stable API and is useful in more than one workflow.

## Contributor Handoff

The design system is a shared app layer, so small changes can alter trust cues across mail review,
sender-control, payment, and settings workflows. Review contributors should understand these local
contracts before changing primitives or tokens:

- `components/action-button.tsx` and `components/action-button.styles.ts` define the shared action
  affordance and its visual variants.
- `components/surface.tsx` defines reusable surface variants and padding contracts for panels,
  modals, and grouped content.
- `components/empty-state.tsx` defines the empty, waiting, and no-result messaging pattern used by
  feature surfaces.
- `components/trust-badge.tsx` and `TRUST_STATE_META` define sender and protocol trust labels.
- `components/skeleton.tsx` and `components/skeleton-screens.tsx` define loading placeholders that
  should not imply completed verification.
- `feedback/feedback-viewport.tsx` and `feedback/use-feedback.tsx` define queued application
  notifications, tones, and dismissal behavior.
- `styles/tokens.css`, `styles/surfaces.css`, `styles/interactions.css`, and `styles/fonts.css`
  provide the feature-owned CSS foundation that is imported once by [`src/styles.css`](../../styles.css).
- Generic shadcn-style primitives live under [`src/components/ui`](../../components/ui); wrap or
  compose them here only when the Hush app needs a stable, product-specific primitive.

Keep the data contracts narrow. UI primitives may receive labels, tones, variants, trust states,
disabled/loading flags, and children from their callers, but they should not fetch mailbox data,
read payment state, inspect private keys, or infer sender identity on their own.

## User-Facing States

- Default: primitives render stable layout, spacing, and copy for feature-owned app screens.
- Hover/focus/active: action and navigation states must remain visible for keyboard and pointer
  users without relying on color alone.
- Disabled/loading: buttons, skeletons, and surfaces should communicate pending work without
  claiming that verification, delivery, or payment has finished.
- Empty/no-result: `EmptyState` should describe what happened and the next safe action without
  exposing raw mailbox content.
- Feedback: `FeedbackViewport` should show bounded success, warning, and error messages that are
  useful for recovery but do not include secrets or live customer mail.
- Trust badges: trust labels are display hints from upstream feature data. Do not word them as
  cryptographic proof unless the calling feature provides that guarantee.

## Safety And Privacy Notes

- Do not add real user data, private keys, auth tokens, payment accounts, payment QR codes, or live
  customer mail to design-system examples, fixtures, docs, or screenshots.
- Treat skeletons and trust badges as security-sensitive copy surfaces. They must not imply a sender,
  relay, message, or payment is verified before the relevant feature data says so.
- Keep motion and feedback respectful of `prefers-reduced-motion`; do not make warnings or errors
  harder to read through animation.
- Keep shared copy aligned with Hush Mail's safety, speed, and sender-control positioning.
- Do not introduce a new V1/V2 tool folder or standalone product surface from this module.
- Prefer linking to existing files in this folder, `src/components/ui`, or `src/styles.css` instead
  of documenting architecture that is not implemented.

## Lightweight QA Checklist

- Import the changed primitive through `@/features/design-system` and confirm the public export still
  works.
- Check default, hover, focus, active, disabled, and loading states for any changed action control.
- Check success, warning, error, and dismissal behavior for feedback changes.
- Check skeleton screens at narrow and desktop widths so loading placeholders do not shift layout.
- Check trust-badge copy against the calling feature data and avoid stronger claims than the source
  supports.
- Confirm reduced-motion behavior still applies to motion-heavy states.
- Search changed docs/examples for real mail content, secrets, payment details, account numbers, or
  live customer data.
- Run the most relevant local typecheck, lint, unit, or visual regression check when dependencies are
  available.

## Motion System

The motion presets system (`@/lib/motion-presets`) provides centralized, accessible animations for consistent motion across the application.

### Quick Start

```tsx
import { motionPresets } from "@/lib/motion-presets";
import { motion, AnimatePresence } from "framer-motion";

<motion.div {...motionPresets.entrance.slideUp()}>Content with entrance animation</motion.div>;
```

### Categories

- **entrance** - Elements appearing (slideUp, fadeIn, scaleIn, slideLeft, slideRight)
- **exit** - Elements disappearing (slideDown, fadeOut, scaleOut, slideToLeft, slideToRight)
- **promote** - Drawing attention (scale, lift, glow) - use with hover/tap states
- **remove** - Removal emphasis (spinOut, collapse, slideAwayRight)
- **confirm** - Success feedback (bounce, pulse, checkmark)
- **danger** - Error/warning (shake, pulse, spinWarn)

### Accessibility

All presets automatically respect `prefers-reduced-motion`. See the development gallery for testing and examples:

```
http://localhost:5173/motion-gallery (dev mode only)
```

### Documentation

Full documentation is available in [`src/lib/MOTION_PRESETS.md`](../../lib/MOTION_PRESETS.md).
