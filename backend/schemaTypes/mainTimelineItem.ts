import {defineField, defineType} from 'sanity'

export const mainTimelineItem = defineType({
  name: 'mainTimelineItem',
  title: 'Timeline Item',
  type: 'object',
  fields: [
    defineField({
      name: 'content',
      title: 'Content',
      type: 'reference',
      to: [{type: 'imageAsset'}, {type: 'audioAsset'}, {type: 'newsletter'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'unlockTime',
      title: 'Unlock Time',
      type: 'datetime',
    }),
    defineField({
      name: 'expiryTime',
      title: 'Expiry Time',
      type: 'datetime',
    }),
  ],
  preview: {
    select: {
      title: 'content.title',
      contentType: 'content._type',
      media: 'content.image',
    },
    prepare({title, contentType}) {
      const typeLabels: Record<string, string> = {
        audioAsset: 'Audio',
        imageAsset: 'Image',
        newsletter: 'Newsletter',
      }
      return {
        title: title ?? 'Untitled',
        subtitle: typeLabels[contentType] ?? 'Content',
      }
    },
  },
})
