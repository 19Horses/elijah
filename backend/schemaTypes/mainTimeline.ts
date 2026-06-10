import {defineField, defineType} from 'sanity'

export const mainTimeline = defineType({
  name: 'mainTimeline',
  title: 'Main Timeline',
  type: 'document',
  fields: [
    defineField({
      name: 'colour',
      title: 'Colour',
      type: 'string',
      description: 'Background colour for the timeline (e.g. #ffffff)',
    }),
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
