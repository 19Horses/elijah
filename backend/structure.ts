import type {StructureResolver} from 'sanity/structure'
import {ImportBandsintownEvents} from './tools/ImportBandsintownEvents'

const singletonTypes = new Set(['mainTimeline'])

export const structure: StructureResolver = (S) =>
  S.list()
    .title('Content')
    .items([
      S.listItem()
        .title('Main Timeline')
        .id('mainTimeline')
        .child(S.document().schemaType('mainTimeline').documentId('mainTimeline')),
      S.listItem()
        .title('Import Bandsintown Events')
        .id('import-bandsintown-events')
        .child(S.component(ImportBandsintownEvents).title('Import Bandsintown Events')),
      S.divider(),
      ...S.documentTypeListItems().filter((listItem) => !singletonTypes.has(listItem.getId()!)),
    ])
