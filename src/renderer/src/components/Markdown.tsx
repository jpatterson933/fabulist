import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const SAFE_LINK = /^(https?:|mailto:)/i

/**
 * Render chat prose as Markdown (GFM: tables, lists, fenced code, etc.) so the LLM's
 * output reads as formatted text instead of raw `**asterisks**`. Used only in the Skill
 * Studio chat/test/comments — the document chat and every file editor are untouched.
 *
 * Safe by construction: react-markdown does not render raw HTML (no XSS via injected
 * tags) and sanitizes URLs; links additionally open in the system browser rather than
 * navigating the app window, and only for http(s)/mailto.
 */
export default function Markdown({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="bubble-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault()
                if (href && SAFE_LINK.test(href)) void window.fabulist.openExternal(href)
              }}
            >
              {children}
            </a>
          )
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
