import { Streamdown } from 'streamdown'

// Shared markdown renderer for agent replies and comment threads.
// Streamdown tolerates the half-written markdown that arrives mid-stream
// (unterminated code fences, dangling list items) so partial tokens still
// read cleanly. The app ships no Tailwind, so streamdown's utility classes
// are inert — the `.md` rules in global.css style the semantic HTML instead,
// and shiki's inline colors carry code-block highlighting on their own.
export default function Markdown({
  text,
  streaming
}: {
  text: string
  streaming?: boolean
}): React.JSX.Element {
  return (
    <Streamdown
      className="md"
      mode={streaming ? 'streaming' : 'static'}
      lineNumbers={false}
      controls={{ code: { copy: true, download: false }, table: false, mermaid: false }}
    >
      {text}
    </Streamdown>
  )
}
