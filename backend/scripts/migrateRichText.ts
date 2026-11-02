/**
 * Converts plain-text descriptions and newsletter content to rich text, so
 * the formatting controls (bold, italic, underline, links, lists) can be
 * used on them. Each blank-line-separated chunk becomes a paragraph; single
 * line breaks inside a chunk are kept.
 *
 * Only touches fields still holding a plain string, so it's safe to run more
 * than once. Pass --dry-run to list what would change without writing.
 *
 * Run from the `backend` directory:
 *   npx sanity exec scripts/migrateRichText.ts --with-user-token
 *   npx sanity exec scripts/migrateRichText.ts --with-user-token -- --dry-run
 */
import {getCliClient} from 'sanity/cli'

const client = getCliClient({apiVersion: '2025-06-01'})
const dryRun = process.argv.includes('--dry-run')

// Which field holds the text on each document type.
const FIELDS: Record<string, string> = {
  newsletter: 'content',
  imageAsset: 'description',
  audioAsset: 'description',
  event: 'description',
  collection: 'description',
}

function randomKey(): string {
  return Math.random().toString(36).slice(2, 12)
}

function toBlocks(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => ({
      _type: 'block',
      _key: randomKey(),
      style: 'normal',
      markDefs: [],
      children: [{_type: 'span', _key: randomKey(), text: paragraph, marks: []}],
    }))
}

async function run() {
  let tx = client.transaction()
  let count = 0
  for (const [type, field] of Object.entries(FIELDS)) {
    // Drafts too, so an open edit isn't left holding plain text.
        const docs: Array<{_id: string; text: unknown}> = await client.fetch(
      `*[_type == $type && defined(${field})]{_id, "text": ${field}}`,
      {type},
    )
    for (const doc of docs) {
      // Already rich text (an array of blocks): leave it be.
      if (typeof doc.text !== 'string') {
        continue
      }
      count += 1
      console.log(`${type} ${doc._id}: ${field} → ${toBlocks(doc.text).length} paragraph(s)`)
      tx = tx.patch(doc._id, {set: {[field]: toBlocks(doc.text)}})
    }
  }

  if (count === 0) {
    console.log('Nothing to convert.')
    return
  }
  if (dryRun) {
    console.log(`Dry run: ${count} field(s) would be converted. Nothing written.`)
    return
  }
  const result = await tx.commit()
  console.log(`Done. Updated ${result.results.length} document(s).`)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
