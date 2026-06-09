import {defineField, defineType} from 'sanity'

export const audioAsset = defineType({
  name: 'audioAsset',
  title: 'Audio',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 4,
    }),
    defineField({
      name: 'date',
      title: 'Date',
      type: 'date',
    }),
    defineField({
      name: 'expiryDate',
      title: 'Expiry Date',
      type: 'datetime',
    }),
    defineField({
      name: 'unlockDate',
      title: 'Unlock Date',
      type: 'datetime',
    }),
    defineField({
      name: 'isOnMainTimeline',
      title: 'On Main Timeline',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'audio',
      title: 'Audio',
      type: 'file',
      options: {
        accept: 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac',
      },
      validation: (Rule) => Rule.required(),
    }),
  ],
  preview: {
    select: {
      title: 'title',
      hasAudio: 'audio.asset',
    },
    prepare(selection) {
      const {title, hasAudio} = selection
      return {
        title,
        subtitle: hasAudio ? 'Audio uploaded' : 'No audio uploaded',
      }
    },
  },
})
