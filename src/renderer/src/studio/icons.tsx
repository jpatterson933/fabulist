/**
 * Plugin Studio icon set — every glyph used across the studio surface lives here so the
 * components stay markup-free and a single icon is defined once (Chevron in particular was
 * triplicated across SkillStudio / StudioChanges / StudioDiff).
 *
 * Each icon defaults to `width/height="1em"` and paints with `currentColor`, so it inherits
 * the size and color of its button — the studio runs a dark palette (`--ink` is light), so a
 * hardcoded fill would be invisible. Pass `width`/`height` (and any svg prop) to override.
 */

type IconProps = React.SVGProps<SVGSVGElement>

// — File-tree toolbar —————————————————————————————————————————————

export const NewFile = (props: IconProps): React.JSX.Element => (
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 16 16" aria-hidden {...props}>
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="m9.5 1.1l3.4 3.5l.1.4v2h-1V6H8V2H3v11h4v1H2.5l-.5-.5v-12l.5-.5h6.7l.3.1zM9 2v3h2.9L9 2zm4 14h-1v-3H9v-1h3V9h1v3h3v1h-3v3z"
      clipRule="evenodd"
    />
  </svg>
)

export const NewFolder = (props: IconProps): React.JSX.Element => (
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 16 16" aria-hidden {...props}>
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M14.5 2H7.71l-.85-.85L6.51 1h-5l-.5.5v11l.5.5H7v-1H1.99V6h4.49l.35-.15l.86-.86H14v1.5l-.001.51h1.011V2.5L14.5 2zm-.51 2h-6.5l-.35.15l-.86.86H2v-3h4.29l.85.85l.36.15H14l-.01.99zM13 16h-1v-3H9v-1h3V9h1v3h3v1h-3v3z"
      clipRule="evenodd"
    />
  </svg>
)

export const Refresh = (props: IconProps): React.JSX.Element => (
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden {...props}>
    <path
      fill="currentColor"
      d="M5 5h5v5H9V6.5c-2.35.97-4 3.29-4 6c0 3.58 2.91 6.5 6.5 6.5a6.5 6.5 0 0 0 6.5-6.5c0-3.08-2.14-5.66-5-6.33V5.14c3.42.7 6 3.72 6 7.36c0 4.13-3.36 7.5-7.5 7.5A7.5 7.5 0 0 1 4 12.5C4 9.72 5.5 7.3 7.74 6H5V5Z"
    />
  </svg>
)

export const CollapseAll = (props: IconProps): React.JSX.Element => (
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 16 16" aria-hidden {...props}>
    <g fill="currentColor">
      <path d="M9 9H4v1h5V9z" />
      <path
        fillRule="evenodd"
        d="m5 3l1-1h7l1 1v7l-1 1h-2v2l-1 1H3l-1-1V6l1-1h2V3zm1 2h4l1 1v4h2V3H6v2zm4 1H3v7h7V6z"
        clipRule="evenodd"
      />
    </g>
  </svg>
)

// — File-panel tabs ———————————————————————————————————————————————

export const Files = (props: IconProps): React.JSX.Element => (
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden {...props}>
    <path
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M9 6h.337c.244 0 .367 0 .482.028c.102.024.2.065.29.12c.1.061.187.148.36.32l3.063 3.063c.172.173.258.26.32.36c.055.09.096.188.12.29c.028.114.028.235.028.474V18M9 6H4.6c-.56 0-.84 0-1.054.109a1 1 0 0 0-.437.437C3 6.76 3 7.04 3 7.6v11.8c0 .56 0 .84.109 1.054a1 1 0 0 0 .437.437C3.76 21 4.039 21 4.598 21h7.803c.559 0 .84 0 1.053-.109a.999.999 0 0 0 .437-.437C14 20.24 14 19.96 14 19.4V18M9 6v3.4c0 .56 0 .84.109 1.054a1 1 0 0 0 .437.437c.214.109.493.109 1.052.109H14m-4-5V4.6c0-.56 0-.84.109-1.054a1 1 0 0 1 .437-.437C10.76 3 11.04 3 11.6 3H16m0 0h.337c.244 0 .367 0 .482.028c.102.024.2.065.29.12c.1.061.187.148.36.32l3.063 3.063c.172.173.258.26.32.36c.055.09.096.188.12.29c.028.114.028.235.028.474V16.4c0 .56 0 .84-.11 1.054a.998.998 0 0 1-.435.437C20.24 18 19.96 18 19.402 18H14m2-15v3.4c0 .56 0 .84.109 1.054a1 1 0 0 0 .437.437C16.76 8 17.039 8 17.598 8H21"
    />
  </svg>
)

export const GitBranch = (props: IconProps): React.JSX.Element => (
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden {...props}>
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
      <path d="M18 8a2 2 0 1 0 0-4a2 2 0 0 0 0 4ZM6 20a2 2 0 1 0 0-4a2 2 0 0 0 0 4Zm0-4V3" />
      <path d="M8 18h1c3.5 0 9-2.1 9-8.5V8" />
    </g>
  </svg>
)

export const Export = (props: IconProps): React.JSX.Element => (
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <path
      fillRule="evenodd"
      d="M9 2.221V7H4.221a2 2 0 0 1 .365-.5L8.5 2.586A2 2 0 0 1 9 2.22ZM11 2v5a2 2 0 0 1-2 2H4v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-7Zm3 2h2.01v2.01h-2V8h2v2.01h-2V12h2v2.01h-2V16h2v2.01h-2v2H12V18h2v-1.99h-2V14h2v-1.99h-2V10h2V8.01h-2V6h2V4Z"
      clipRule="evenodd"
    />
  </svg>
)

// — Header panel toggles ——————————————————————————————————————————

/** Left-rail toggle (a panel split). */
export const Rail = (props: IconProps): React.JSX.Element => (
  <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
    <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
    <path d="M6 2.5v11" stroke="currentColor" strokeWidth="1.3" />
  </svg>
)

/** Files-panel toggle (a file tree). */
export const FileTypeLightTree = (props: IconProps): React.JSX.Element => (
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 32 32" fill="currentColor" aria-hidden {...props}>
    <path d="M3.021 2.022h1.997v27.955H3.021zM28.98 27.98H5.018v1.997H28.98zm-6.99-8.985H5.019v1.997h16.973zM13.006 9.01H5.018v1.997h7.987z" />
  </svg>
)

// — Changes panel —————————————————————————————————————————————————

/** Open changes / open staged changes (a file diff). */
export const FileDiff = (props: IconProps): React.JSX.Element => (
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden {...props}>
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2zm-5-11v4m-2-2h4m-4 5h4" />
    </g>
  </svg>
)

/** Open the file in the editor (a document + pencil). */
export const OpenFile = (props: IconProps): React.JSX.Element => (
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M18 5V4a1 1 0 0 0-1-1H8.914a1 1 0 0 0-.707.293L4.293 7.207A1 1 0 0 0 4 7.914V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5M9 3v4a1 1 0 0 1-1 1H4m11.383.772 2.745 2.746m1.215-3.906a2.089 2.089 0 0 1 0 2.953l-6.65 6.646L9 17.95l.739-3.692 6.646-6.646a2.087 2.087 0 0 1 2.958 0Z"
    />
  </svg>
)

export const Discard = (props: IconProps): React.JSX.Element => (
  <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
    <path d="M5 4.5 3 6.5l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    <path
      d="M3 6.5h6.5a3 3 0 0 1 0 6H6"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const Check = (props: IconProps): React.JSX.Element => (
  <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
    <path
      d="M3.5 8.5 6.5 11.5 12.5 4.5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

// — Shared primitives —————————————————————————————————————————————

export const Plus = (props: IconProps): React.JSX.Element => (
  <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
    <path d="M8 3.25v9.5M3.25 8h9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export const Minus = (props: IconProps): React.JSX.Element => (
  <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
    <path d="M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export const Close = (props: IconProps): React.JSX.Element => (
  <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
    <path d="M4.25 4.25l7.5 7.5M11.75 4.25l-7.5 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

/** Disclosure chevron; rotates via the `is-collapsed` class when closed. */
export const Chevron = ({ open }: { open: boolean }): React.JSX.Element => (
  <svg
    className={`studio-file-chevron ${open ? '' : 'is-collapsed'}`}
    width="10"
    height="10"
    viewBox="0 0 12 12"
    fill="none"
    aria-hidden
  >
    <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** The empty-state brand glyph. */
export const PluginStudio = (props: IconProps): React.JSX.Element => (
  <svg width="38" height="38" viewBox="0 0 38 38" fill="none" aria-hidden {...props}>
    <rect x="5" y="6" width="28" height="26" rx="6" stroke="currentColor" strokeWidth="1.7" />
    <path d="M12 15.5h14M12 22.5h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M27 21.5l3 3-3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
