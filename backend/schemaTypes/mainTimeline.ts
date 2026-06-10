import {defineField, defineType} from 'sanity'

export const mainTimeline = defineType({
  name: 'mainTimeline',
  title: 'Main Timeline',
  type: 'document',
  fields: [
    defineField({
      name: 'items',
      title: 'Timeline Items',
      type: 'array',
      of: [{type: 'mainTimelineItem'}],
    }),
  ],
  preview: {
    prepare() {
      return {
        title: 'Main Timeline',
      }
    },
  },
})
