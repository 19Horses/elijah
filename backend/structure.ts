import type {StructureResolver} from 'sanity/structure'

const singletonTypes = new Set(['mainTimeline'])

export const structure: StructureResolver = (S) =>
  S.list()
    .title('Content')
    .items([
      S.listItem()
        .title('Main Timeline')
        .id('mainTimeline')
        .child(S.document().schemaType('mainTimeline').documentId('mainTimeline')),
      S.divider(),
      ...S.documentTypeListItems().filter((listItem) => !singletonTypes.has(listItem.getId()!)),
    ])
