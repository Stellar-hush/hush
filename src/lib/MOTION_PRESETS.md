# Motion Presets System

A centralized, tested animation system for consistent motion across the Hush application. All presets respect `prefers-reduced-motion` preferences for accessibility.

## Overview

The motion presets system provides:

- **Named presets** for 6 animation categories (entrance, exit, promote, remove, confirm, danger)
- **Reduced-motion support** - automatically responds to system accessibility settings
- **Framer Motion integration** - spring physics for natural, responsive animations
- **Development gallery** - `/motion-gallery` route for testing and documentation
- **TypeScript support** - full type safety for animation variants

## Quick Start

```tsx
import { motionPresets } from "@/lib/motion-presets";
import { motion, AnimatePresence } from "framer-motion";

// Use a preset variant
<motion.div {...motionPresets.entrance.slideUp()}>
  Content appears with slide-up animation
</motion.div>;

// Check reduced-motion preference
const preference = motionPresets.getMotionPreference(); // "full" | "reduced"
```

## Animation Categories

### Entrance

Animations for elements appearing or entering the viewport.

- **slideUp** - Slide up from bottom with fade. Best for: modals, panels, notifications
- **fadeIn** - Fade in only. Best for: overlays, backdrop, text replacements
- **scaleIn** - Scale up from center with fade. Best for: popovers, alerts, confirmations
- **slideLeft** - Slide from left with fade. Best for: sidebars, left panels
- **slideRight** - Slide from right with fade. Best for: right panels, drawers

**Example:**

```tsx
<motion.div {...motionPresets.entrance.slideUp()}>Notification message</motion.div>
```

### Exit

Animations for elements disappearing or leaving the viewport.

- **slideDown** - Slide down with fade (opposite of slideUp)
- **fadeOut** - Fade out only (opposite of fadeIn)
- **scaleOut** - Scale down to center (opposite of scaleIn)
- **slideToLeft** - Slide to left with fade
- **slideToRight** - Slide to right with fade

**Example:**

```tsx
<AnimatePresence>
  {isVisible && <motion.div {...motionPresets.exit.slideDown()}>Content disappears</motion.div>}
</AnimatePresence>
```

### Promote

Animations to draw attention and bring elements to focus. Typically paired with `whileHover`, `whileTap`, or other interaction states.

- **scale** - Subtle scale increase on hover/tap. Best for: buttons, cards, interactive elements
- **lift** - Lift effect with shadow and upward movement. Best for: card elevation, draggable items
- **glow** - Highlight with opacity increase. Best for: focus states, active items

**Example:**

```tsx
<motion.button {...motionPresets.promote.scale(1.04)}>Click me</motion.button>
```

### Remove

Animations when removing elements with emphasis. Used for deletion, dismissal, or removal actions.

- **spinOut** - Spin out with fade. Best for: deleting items, closing notifications
- **collapse** - Collapse height with fade. Best for: list item removal, expandable sections
- **slideAwayRight** - Slide to right and fade. Best for: dismissible alerts, swipe-to-dismiss

**Example:**

```tsx
<motion.div {...motionPresets.remove.collapse()}>Item to be removed</motion.div>
```

### Confirm

Animations for positive actions and confirmation feedback.

- **bounce** - Bounce in with success feel. Best for: success messages, confirmations
- **pulse** - Pulse effect (scale oscillation). Best for: highlighting success, emphasis
- **checkmark** - Quick scale-in appear. Best for: checkmark icons, validation success

**Example:**

```tsx
<motion.div {...motionPresets.confirm.bounce()}>✓ Success!</motion.div>
```

### Danger

Animations for destructive actions, warnings, and errors.

- **shake** - Shake effect (horizontal oscillation). Best for: errors, invalid input, failed actions
- **pulse** - Pulse with opacity shift. Best for: warnings, alerts, attention-grabbing
- **spinWarn** - Spin with fade. Best for: error icons, system warnings, loading failures

**Example:**

```tsx
<motion.div {...motionPresets.danger.shake()}>Error message</motion.div>
```

## Transition Presets

Ready-to-use transition configurations:

```tsx
import { motionPresets } from "@/lib/motion-presets";

// Spring-based transitions (recommended for UI)
motionPresets.transitions.spring; // Standard spring (stiffness: 300, damping: 30)
motionPresets.transitions.springSmooth; // Slower, more elastic (stiffness: 200, damping: 20)
motionPresets.transitions.springSnappy; // Faster, tighter (stiffness: 400, damping: 40)

// Tween-based transitions (for specific timing)
motionPresets.transitions.linear; // Linear easing
motionPresets.transitions.easeInOut; // Natural acceleration/deceleration
```

**Usage:**

```tsx
<motion.div animate={{ opacity: 1 }} transition={motionPresets.transitions.springSmooth}>
  Content
</motion.div>
```

## Combined Patterns

For common UI patterns, use pre-combined presets:

```tsx
// Modal dialog
<motion.div {...motionPresets.patterns.modal.backdrop} />
<motion.div {...motionPresets.patterns.modal.content} />

// Toast/notification
<motion.div {...motionPresets.patterns.notification.entrance} />
<motion.div {...motionPresets.patterns.notification.exit} />

// Sidebar/panel
<motion.div {...motionPresets.patterns.sidePanel.backdrop} />
<motion.div {...motionPresets.patterns.sidePanel.panel} />

// List item with removal
<motion.div {...motionPresets.patterns.listItem.entrance} />
<motion.div {...motionPresets.patterns.listItem.exit} />
```

## Accessibility

### Respecting Reduced Motion

All presets automatically respect the system `prefers-reduced-motion` setting:

```tsx
// These are equivalent - both respect user preferences
<motion.div {...motionPresets.entrance.slideUp()} />
<motion.div initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={motionPresets.transitions.spring} />
```

When `prefers-reduced-motion: reduce` is active, animations use:

- Duration: 0.01ms (instant)
- Spring stiffness/damping: very high (minimizes motion)

### Best Practices

1. **Test with reduced motion enabled**
   - macOS: System Preferences → Accessibility → Display → Reduce motion
   - Windows: Settings → Ease of Access → Display → Show animations
   - Use the dev gallery's "Reduced Motion" toggle

2. **Use animations purposefully**
   - Avoid animations on critical paths
   - Don't animate when content changes instantly
   - Keep animations under 500ms for attention-grabbing

3. **Pair with focus states**
   - Always include keyboard navigation focus indicators
   - Don't rely solely on animation for feedback
   - Combine with visual states (color, border, shadow)

4. **Limit simultaneous animations**
   - Don't animate more than 2-3 elements at once
   - Use `delay` for staggered animations
   - Keep frame rates smooth (60fps target)

## Common Patterns

### Modal Dialog

```tsx
import { motion, AnimatePresence } from "framer-motion";
import { motionPresets } from "@/lib/motion-presets";

export function Modal({ open, onClose, children }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            {...motionPresets.patterns.modal.backdrop}
            onClick={onClose}
            className="fixed inset-0 bg-black/50"
          />
          <motion.div
            {...motionPresets.patterns.modal.content}
            className="fixed inset-0 flex items-center justify-center"
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

### Interactive Button

```tsx
import { motion } from "framer-motion";
import { motionPresets } from "@/lib/motion-presets";

export function Button({ onClick, children }) {
  return (
    <motion.button
      {...motionPresets.promote.scale(1.04)}
      onClick={onClick}
      className="px-4 py-2 rounded-lg bg-primary text-primary-foreground"
    >
      {children}
    </motion.button>
  );
}
```

### Staggered List

```tsx
import { motion } from "framer-motion";
import { motionPresets } from "@/lib/motion-presets";

export function List({ items }) {
  return (
    <div>
      {items.map((item, index) => (
        <motion.div
          key={item.id}
          initial={motionPresets.entrance.slideUp().initial}
          animate={motionPresets.entrance.slideUp().animate}
          transition={{
            ...motionPresets.transitions.spring,
            delay: index * 0.05,
          }}
        >
          {item.label}
        </motion.div>
      ))}
    </div>
  );
}
```

### Dismissible Item

```tsx
import { motion, AnimatePresence } from "framer-motion";
import { motionPresets } from "@/lib/motion-presets";

export function DismissibleItem({ item, onDismiss }) {
  const [isDismissed, setIsDismissed] = useState(false);

  return (
    <AnimatePresence>
      {!isDismissed && (
        <motion.div
          {...motionPresets.entrance.slideUp()}
          exit={motionPresets.exit.slideDown()}
          className="flex items-center justify-between p-4"
        >
          <span>{item.text}</span>
          <button
            onClick={() => {
              setIsDismissed(true);
              onDismiss(item.id);
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

## Development

### View the Motion Gallery

Open the motion gallery in development mode:

```
http://localhost:5173/motion-gallery
```

The gallery provides:

- Interactive preview of all animation presets
- Reduced motion simulation toggle
- Usage code examples
- Implementation patterns
- Accessibility guidelines

### Adding New Presets

To add a new preset to `src/lib/motion-presets.ts`:

```tsx
// Add to the appropriate category (entrance, exit, promote, remove, confirm, danger)
export const entrance = {
  // ... existing presets

  myNewAnimation: (customParam?: number): Variants => {
    const config = getConfig();
    return {
      initial: {
        /* ... */
      },
      animate: {
        /* ... */
      },
      transition: {
        type: "spring",
        stiffness: config.springStiffness,
        damping: config.springDamping,
        duration: config.duration,
      },
    };
  },
};
```

Always:

- Use `getConfig()` to respect reduced motion
- Return `Variants` type for type safety
- Document the preset with JSDoc comments
- Add an example to the motion gallery

## Performance Tips

1. **Use `will-change` CSS for complex animations**

   ```tsx
   <motion.div style={{ willChange: "transform" }} />
   ```

2. **Memoize animated components**

   ```tsx
   export const AnimatedButton = React.memo(function AnimatedButton(props) {
     return <motion.button {...motionPresets.promote.scale()} />;
   });
   ```

3. **Use `layoutId` for FLIP animations when appropriate**

   ```tsx
   <motion.div layoutId="item" />
   ```

4. **Debounce animations triggered by frequent events**
   ```tsx
   const debouncedAnimate = useCallback(
     debounce(() => setAnimating(true), 100),
     [],
   );
   ```

## References

- [Framer Motion Documentation](https://www.framer.com/motion/)
- [Web.dev: CSS animations and performance](https://web.dev/animations/)
- [MDN: prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
- [A11y Project: Motion](https://www.a11yproject.com/posts/understanding-vestibular-disorders/)
