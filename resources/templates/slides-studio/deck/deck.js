// Keyboard navigation: arrows/space/PageUp/PageDown step between slides,
// Home/End jump to the first/last. Scroll and trackpad still work naturally.
const slides = Array.from(document.querySelectorAll('.slide'))

function currentIndex() {
  const mid = window.scrollY + window.innerHeight / 2
  let best = 0
  slides.forEach((s, i) => {
    if (Math.abs(s.offsetTop + s.offsetHeight / 2 - mid) <
        Math.abs(slides[best].offsetTop + slides[best].offsetHeight / 2 - mid)) best = i
  })
  return best
}

function go(i) {
  const target = slides[Math.max(0, Math.min(slides.length - 1, i))]
  target?.scrollIntoView({ behavior: 'smooth' })
}

addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return
  const forward = ['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)
  const back = ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)
  if (forward || back) {
    e.preventDefault()
    go(currentIndex() + (forward ? 1 : -1))
  } else if (e.key === 'Home') {
    e.preventDefault()
    go(0)
  } else if (e.key === 'End') {
    e.preventDefault()
    go(slides.length - 1)
  }
})
