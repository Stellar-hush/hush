# Hush light theme

Choose **Settings → Appearance → Theme → Light** and save. The appearance provider keeps the selection across the inbox, authentication, onboarding, and administrative routes. System mode follows the device setting; the dark Hush theme remains available.

## Color system

The source of truth is [`styles/tokens.css`](./styles/tokens.css). The light palette uses pale periwinkle surfaces, deep indigo text, blue-violet actions, cyan/teal highlights, and dark semantic status colors. The dark theme uses midnight navy, electric blue, and luminous cyan. Both themes share the same meaning for each token.

Use tokens instead of copying literal color values into components:

- Use `background`, `card`, `popover`, `secondary`, `muted`, and `surface-*` for content layers.
- Use `foreground` and `muted-foreground` for text; pair `primary` actions with `primary-foreground`.
- Use `icon-foreground` for neutral chrome icons. Use the `status-*` tokens for semantic states and keep labels or icons so color is never the only signal.
- Use `glass` and `glass-strong` for translucent layers. Their intensity varies by appearance preference and theme.
- Use `overlay` for dialog backdrops and `surface-depth` for the light-theme depth color. Do not assume a black backdrop or amber light surface.
- Preserve the colors of uploaded images, avatars, QR codes, and sender artwork; do not invert content to theme it.

Status text and icons must remain legible on the background, card, selected, and hover surfaces. The light palette contract checks WCAG AA contrast for text and semantic status colors. When adding a token, test its contrast against every surface where it appears; transparency and overlays can change the rendered result.

## Navigation and surfaces

The header, sidebar, search, and mobile navigation share the custom postal SVG family in `components/mail-icons.tsx`. Icons use `currentColor` in both themes; action labels and tooltips remain unchanged. Compose uses the nib-and-note glyph. Keep verified checks and sender artwork separate from navigation icons.

Scrollbar indicators are hidden app-wide, while overflow remains available to mouse, trackpad, touch, and keyboard input. Shared scroll-area viewports are keyboard-focusable and retain a visible focus outline. Dialogs, calendar, OTP, and glass surfaces should consume the same theme tokens rather than defining standalone colors.

See `tokens-and-surfaces.test.ts` and `light-palette.test.ts` for the palette contracts. Check rendered combinations when changing opacity or layering, since a foreground token that passes on an opaque card may fail over a translucent surface.
