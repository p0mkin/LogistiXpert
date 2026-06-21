## $(date +'%Y-%m-%d') - Added Global Focus Visible Outline & Aria Labels
**Learning:** The project lacked visual indicators when navigating with a keyboard (focus rings) and aria-labels for icon-only components like the sound toggle.
**Action:** Added a global `*:focus-visible` to styles.css using the existing neon variable, and `aria-label`s to HTML templates where missing. In the future, prefer global `*:focus-visible` rather than element-by-element when styling.
