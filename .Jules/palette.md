
## 2025-06-06 - Improve accessibility for icon-only buttons
**Learning:** Found several icon-only buttons (.settings-close-btn, .audio-control-widget, and other icon-based controls) without descriptive ARIA labels or title attributes, making them opaque to screen readers.
**Action:** Adding appropriate `aria-label` attributes to all icon-only interactive elements across the application to provide clear context for assistive technologies. Also ensuring focus states exist for keyboard navigation.
