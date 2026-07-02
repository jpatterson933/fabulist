import { useEffect, useMemo, useRef, useState } from 'react'
import {
  dragAndDropFeature,
  hotkeysCoreFeature,
  keyboardDragAndDropFeature,
  renamingFeature,
  searchFeature,
  selectionFeature,
  syncDataLoaderFeature,
  type DragTarget,
  type ItemInstance
} from '@headless-tree/core'
import { useTree } from '@headless-tree/react'
import type { FileMeta } from '@shared/types'
import { useStore } from '@/store'
import { fileIconUrl, folderIconUrl } from '@/lib/fileIcons'

/** Synthetic id for the tree root (project-relative paths can never equal it). */
const ROOT = '<root>'

interface TreeItem {
  name: string
  isFolder: boolean
  meta?: FileMeta
  children: string[]
}

const parentOf = (p: string): string => {
  const slash = p.lastIndexOf('/')
  return slash === -1 ? ROOT : p.slice(0, slash)
}
const baseName = (p: string): string => p.split('/').pop() ?? p

/** Files + folders as an id→item map; folders sort first, then registry order. */
function buildItems(files: FileMeta[], folders: string[]): Record<string, TreeItem> {
  const items: Record<string, TreeItem> = {
    [ROOT]: { name: '', isFolder: true, children: [] }
  }
  const ensureFolder = (p: string): void => {
    if (p === ROOT || items[p]) return
    ensureFolder(parentOf(p))
    items[p] = { name: baseName(p), isFolder: true, children: [] }
    items[parentOf(p)].children.push(p)
  }
  // explicit folders first (covers empty ones), then any implied by file paths
  for (const f of folders) ensureFolder(f)
  for (const d of files) {
    ensureFolder(parentOf(d.file))
    if (items[d.file]) continue // a folder claimed this path; files can't shadow it
    items[d.file] = { name: baseName(d.file), isFolder: false, meta: d, children: [] }
    items[parentOf(d.file)].children.push(d.file)
  }
  for (const item of Object.values(items)) {
    item.children.sort((a, b) => {
      const fa = items[a].isFolder
      if (fa !== items[b].isFolder) return fa ? -1 : 1
      if (fa) return items[a].name.localeCompare(items[b].name)
      return 0 // files keep registry order (project.json, then discovery)
    })
  }
  return items
}

interface Creating {
  parent: string
  kind: 'file' | 'folder'
}

interface Menu {
  x: number
  y: number
  /** ROOT for the empty-area menu */
  itemId: string
}

export default function FileTree(): React.JSX.Element {
  const activeProjectId = useStore((s) => s.activeProjectId)
  const files = useStore((s) => s.files)
  const folders = useStore((s) => s.folders)
  const activeFile = useStore((s) => s.activeFile)
  const activePanel = useStore((s) => s.activePanel)
  const openTab = useStore((s) => s.openTab)
  const renamePath = useStore((s) => s.renamePath)
  const deleteFile = useStore((s) => s.deleteFile)
  const deleteFolder = useStore((s) => s.deleteFolder)
  const createFileAt = useStore((s) => s.createFileAt)
  const createFolder = useStore((s) => s.createFolder)

  const items = useMemo(() => buildItems(files, folders), [files, folders])
  const itemsRef = useRef(items)
  itemsRef.current = items
  const allFolders = useMemo(
    () => Object.keys(items).filter((id) => id !== ROOT && items[id].isFolder),
    [items]
  )

  // Collapsed folders are what we remember (so new folders default to open),
  // kept in the same per-project localStorage slot the old tree used.
  const storageKey = `fabulist:collapsed:${activeProjectId}`
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(storageKey) ?? '[]') as string[])
    } catch {
      return new Set()
    }
  })
  useEffect(() => {
    try {
      setCollapsed(new Set(JSON.parse(localStorage.getItem(storageKey) ?? '[]') as string[]))
    } catch {
      setCollapsed(new Set())
    }
  }, [storageKey])
  const expandedItems = useMemo(
    () => allFolders.filter((f) => !collapsed.has(f)),
    [allFolders, collapsed]
  )

  const [menu, setMenu] = useState<Menu | null>(null)
  const [creating, setCreating] = useState<Creating | null>(null)
  const [createName, setCreateName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashError = (message: string): void => {
    setError(message)
    if (errorTimer.current) clearTimeout(errorTimer.current)
    errorTimer.current = setTimeout(() => setError(null), 4000)
  }
  const attempt = async (op: Promise<void>): Promise<void> => {
    try {
      await op
    } catch (err) {
      flashError(err instanceof Error ? err.message.replace(/^.*Error(?: invoking.*?)?: /, '') : String(err))
    }
  }

  /** Drop dragged items already covered by a dragged ancestor folder. */
  const topLevelOnly = (ids: string[]): string[] =>
    ids.filter((id) => !ids.some((other) => other !== id && id.startsWith(`${other}/`)))

  const moveInto = (ids: string[], folder: string): void => {
    void (async () => {
      for (const id of topLevelOnly(ids)) {
        const dest = folder === ROOT ? baseName(id) : `${folder}/${baseName(id)}`
        if (dest === id || parentOf(id) === folder) continue
        await attempt(renamePath(id, dest))
      }
    })()
  }

  const tree = useTree<TreeItem>({
    rootItemId: ROOT,
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => item.getItemData().isFolder,
    dataLoader: {
      getItem: (id) => itemsRef.current[id] ?? { name: baseName(id), isFolder: false, children: [] },
      getChildren: (id) => itemsRef.current[id]?.children ?? []
    },
    state: { expandedItems },
    setExpandedItems: (updater) => {
      const next = typeof updater === 'function' ? updater(expandedItems) : updater
      const nextCollapsed = new Set(allFolders.filter((f) => !next.includes(f)))
      setCollapsed(nextCollapsed)
      localStorage.setItem(storageKey, JSON.stringify([...nextCollapsed]))
    },
    indent: 14,
    canReorder: false,
    onPrimaryAction: (item) => {
      if (!item.isFolder()) void openTab(item.getId())
    },
    onRename: (item, value) => {
      const clean = value.trim().replace(/[/\\]/g, '-')
      if (!clean || clean === item.getItemName()) return
      const parent = parentOf(item.getId())
      void attempt(renamePath(item.getId(), parent === ROOT ? clean : `${parent}/${clean}`))
    },
    // match what the row shows (title) as well as the filename
    isSearchMatchingItem: (search, item) => {
      const d = item.getItemData()
      return (
        search.length > 0 &&
        `${d.name} ${d.meta?.title ?? ''}`.toLowerCase().includes(search.toLowerCase())
      )
    },
    canDrop: (_items, target) => itemsRef.current[target.item.getId()]?.isFolder ?? false,
    onDrop: (dragged, target: DragTarget<TreeItem>) => {
      moveInto(dragged.map((i) => i.getId()), target.item.getId())
    },
    features: [
      syncDataLoaderFeature,
      selectionFeature,
      hotkeysCoreFeature,
      dragAndDropFeature,
      keyboardDragAndDropFeature,
      renamingFeature,
      searchFeature
    ]
  })

  useEffect(() => {
    tree.rebuildTree()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  // dev console access, like window.__store
  if (import.meta.env.DEV) {
    ;(window as unknown as Record<string, unknown>).__tree = tree
  }

  // close the context menu on any outside click or Escape
  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const selectionFor = (item: ItemInstance<TreeItem>): string[] => {
    const selected = tree.getState().selectedItems ?? []
    return selected.includes(item.getId()) ? topLevelOnly(selected) : [item.getId()]
  }

  const requestDelete = (item: ItemInstance<TreeItem>): void => {
    const ids = selectionFor(item)
    const label =
      ids.length === 1
        ? `Delete “${baseName(ids[0])}”${itemsRef.current[ids[0]]?.isFolder ? ' and everything in it' : ''}?`
        : `Delete ${ids.length} items?`
    if (!window.confirm(label)) return
    void (async () => {
      for (const id of ids) {
        await attempt(itemsRef.current[id]?.isFolder ? deleteFolder(id) : deleteFile(id))
      }
    })()
  }

  const startCreate = (parent: string, kind: 'file' | 'folder'): void => {
    if (parent !== ROOT && collapsed.has(parent)) {
      tree.getItemInstance(parent)?.expand()
    }
    setCreateName('')
    setCreating({ parent, kind })
  }

  const submitCreate = (name: string): void => {
    const c = creating
    setCreating(null)
    if (!c) return
    const clean = name.trim().replace(/[\\]/g, '')
    if (!clean) return
    const rel = c.parent === ROOT ? clean : `${c.parent}/${clean}`
    void attempt(c.kind === 'folder' ? createFolder(rel) : createFileAt(rel))
  }

  const treeItems = tree.getItems()
  const containerProps = tree.getContainerProps()

  const renderCreateRow = (level: number): React.JSX.Element => (
    <div
      className="tree-item tree-create"
      style={{ '--rail-depth': level } as React.CSSProperties}
      key="__create__"
    >
      <img
        className="tree-icon"
        src={
          creating?.kind === 'folder'
            ? folderIconUrl(createName, false)
            : fileIconUrl(createName || 'file')
        }
        alt=""
        aria-hidden
      />
      <input
        className="tree-rename-input"
        autoFocus
        value={createName}
        onChange={(e) => setCreateName(e.currentTarget.value)}
        placeholder={creating?.kind === 'folder' ? 'folder name' : 'file name'}
        onBlur={(e) => submitCreate(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submitCreate(e.currentTarget.value)
          if (e.key === 'Escape') setCreating(null)
        }}
      />
    </div>
  )

  // where the inline-create row goes: right under its parent folder row
  const createAnchor = creating
    ? creating.parent === ROOT
      ? -1
      : treeItems.findIndex((i) => i.getId() === creating.parent)
    : null

  return (
    <div
      {...containerProps}
      className="tree"
      onKeyDown={(e) => {
        ;(containerProps.onKeyDown as React.KeyboardEventHandler | undefined)?.(e)
        if (e.defaultPrevented || e.target instanceof HTMLInputElement) return
        if (e.key === 'Delete' || (e.key === 'Backspace' && e.metaKey)) {
          e.preventDefault()
          const focused = tree.getFocusedItem()
          if (focused && focused.getId() !== ROOT) requestDelete(focused)
        }
      }}
    >
      {tree.isSearchOpen() && (
        <div className="tree-search">
          <input {...tree.getSearchInputElementProps()} className="tree-search-input" placeholder="Jump to file…" />
        </div>
      )}
      {creating && createAnchor === -1 && renderCreateRow(0)}
      {treeItems.map((item) => {
        const data = item.getItemData()
        const id = item.getId()
        const level = item.getItemMeta().level
        const isActive = !item.isFolder() && id === activeFile && !activePanel
        const classes = [
          'tree-item',
          item.isFolder() ? 'is-folder' : 'is-file',
          isActive ? 'is-active' : '',
          item.isSelected() ? 'is-selected' : '',
          item.isFocused() ? 'is-focused' : '',
          item.isDragTarget() ? 'is-drop' : '',
          tree.isSearchOpen() && item.isMatchingSearch() ? 'is-match' : ''
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <div key={id} style={{ '--rail-depth': level } as React.CSSProperties}>
            <button
              {...item.getProps()}
              className={classes}
              title={data.meta?.kindLabel ? `${id} · ${data.meta.kindLabel}` : id}
              onDoubleClick={() => item.startRenaming()}
              onContextMenu={(e) => {
                e.preventDefault()
                if (!item.isSelected()) item.select()
                item.setFocused()
                setMenu({ x: e.clientX, y: e.clientY, itemId: id })
              }}
            >
              {item.isFolder() ? (
                <>
                  <svg
                    className={`library-folder-chevron ${item.isExpanded() ? 'is-open' : ''}`}
                    width="9"
                    height="9"
                    viewBox="0 0 12 12"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M4.5 3 7.5 6l-3 3"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <img
                    className="tree-icon"
                    src={folderIconUrl(data.name, item.isExpanded())}
                    alt=""
                    aria-hidden
                  />
                </>
              ) : data.meta?.kindIcon ? (
                <span className="library-file-glyph" aria-hidden>
                  {data.meta.kindIcon}
                </span>
              ) : (
                <img className="tree-icon" src={fileIconUrl(data.name)} alt="" aria-hidden />
              )}
              {item.isRenaming() ? (
                <input
                  {...item.getRenameInputProps()}
                  className="tree-rename-input"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="tree-item-title">
                  {item.isFolder() ? data.name : data.meta?.title ?? data.name}
                </span>
              )}
              {item.isFolder() && !item.isRenaming() && (
                <span className="library-folder-count">{data.children.length}</span>
              )}
            </button>
            {creating && createAnchor !== null && createAnchor !== -1 && treeItems[createAnchor]?.getId() === id
              ? renderCreateRow(level + 1)
              : null}
          </div>
        )
      })}

      {menu && (
        <TreeMenu
          menu={menu}
          isFolder={items[menu.itemId]?.isFolder ?? true}
          onClose={() => setMenu(null)}
          onAction={(action) => {
            const id = menu.itemId
            const item = id === ROOT ? null : tree.getItemInstance(id)
            setMenu(null)
            switch (action) {
              case 'new-file':
                startCreate(id === ROOT || items[id]?.isFolder ? id : parentOf(id), 'file')
                break
              case 'new-folder':
                startCreate(id === ROOT || items[id]?.isFolder ? id : parentOf(id), 'folder')
                break
              case 'rename':
                item?.startRenaming()
                break
              case 'delete':
                if (item) requestDelete(item)
                break
              case 'reveal':
                if (activeProjectId) {
                  if (id === ROOT) void window.fabulist.library.reveal(activeProjectId)
                  else void window.fabulist.project.revealFile(activeProjectId, id)
                }
                break
            }
          }}
        />
      )}
      {error && <p className="tree-error">{error}</p>}
    </div>
  )
}

type MenuAction = 'new-file' | 'new-folder' | 'rename' | 'delete' | 'reveal'

function TreeMenu({
  menu,
  isFolder,
  onAction,
  onClose
}: {
  menu: Menu
  isFolder: boolean
  onAction: (action: MenuAction) => void
  onClose: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: menu.x, y: menu.y })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      x: Math.min(menu.x, window.innerWidth - r.width - 8),
      y: Math.min(menu.y, window.innerHeight - r.height - 8)
    })
  }, [menu])
  const isRoot = menu.itemId === ROOT
  const entry = (action: MenuAction, label: string, danger = false): React.JSX.Element => (
    <button
      className={`tree-menu-item ${danger ? 'is-danger' : ''}`}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={() => onAction(action)}
    >
      {label}
    </button>
  )
  return (
    <div
      ref={ref}
      className="tree-menu"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      {entry('new-file', isFolder ? 'New file inside' : 'New file beside')}
      {entry('new-folder', isFolder ? 'New folder inside' : 'New folder beside')}
      {!isRoot && entry('rename', 'Rename')}
      {entry('reveal', 'Reveal in Finder')}
      {!isRoot && entry('delete', 'Delete', true)}
    </div>
  )
}
