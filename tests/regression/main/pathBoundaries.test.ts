import { afterEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { makeTempDir } from '../../helpers/temp'

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('electron')
})

async function loadLibrary(documentsRoot: string) {
  vi.doMock('electron', () => ({
    app: { getPath: () => documentsRoot },
    dialog: { showOpenDialog: vi.fn() }
  }))
  return import('../../../src/main/library')
}

async function loadSkills(documentsRoot: string) {
  vi.doMock('electron', () => ({
    dialog: { showOpenDialog: vi.fn() }
  }))
  vi.doMock('../../../src/main/library', () => ({
    LIBRARY_ROOT: path.join(documentsRoot, 'Fabulist'),
    docPath: (id: string) => path.join(documentsRoot, 'Fabulist', id)
  }))
  return import('../../../src/main/skills')
}

describe('main process path boundaries', () => {
  it('rejects document IDs that cannot be folder names', async () => {
    const root = await makeTempDir('fabulist-doc-ids-')
    const library = await loadLibrary(root)

    expect(() => library.docPath('')).toThrow()
    expect(() => library.docPath('.hidden')).toThrow()
    expect(() => library.docPath('nested/doc')).toThrow()
    expect(() => library.docPath('nested\\doc')).toThrow()
    expect(() => library.docPath('bad\u0000id')).toThrow()
    expect(library.docPath('valid-doc')).toBe(path.join(root, 'Fabulist', 'valid-doc'))
  })

  it('does not let deleteDoc target the library root', async () => {
    const root = await makeTempDir('fabulist-delete-root-')
    const library = await loadLibrary(root)
    await fs.mkdir(library.LIBRARY_ROOT, { recursive: true })
    await fs.writeFile(path.join(library.LIBRARY_ROOT, 'sentinel.txt'), 'keep')

    await expect(library.deleteDoc('')).rejects.toThrow()
    await expect(fs.readFile(path.join(library.LIBRARY_ROOT, 'sentinel.txt'), 'utf8')).resolves.toBe(
      'keep'
    )
  })

  it('rejects skill slug traversal on enable and disable paths', async () => {
    const root = await makeTempDir('fabulist-skill-slugs-')
    const skills = await loadSkills(root)

    await expect(skills.setEnabled('doc', '../../document.md', true)).rejects.toThrow()
    await expect(skills.setEnabled('doc', '../../document.md', false)).rejects.toThrow()
    await expect(skills.remove('../skill')).rejects.toThrow()
    await expect(skills.readSkillFile('../skill')).rejects.toThrow()
  })
})
