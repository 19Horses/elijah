import {defineField, defineType} from 'sanity'
import {S3VideoInput} from '../components/S3VideoInput'

// A video stored in our own S3 bucket and served through CloudFront. Only the
// object key is stored; the frontend builds the playback URL from it.
export const s3Video = defineType({
  name: 's3Video',
  title: 'Video (S3)',
  type: 'object',
  components: {input: S3VideoInput},
  fields: [
    defineField({name: 'key', title: 'S3 key', type: 'string', readOnly: true}),
    defineField({name: 'filename', title: 'Original filename', type: 'string', readOnly: true}),
    defineField({name: 'mimeType', title: 'MIME type', type: 'string', readOnly: true}),
    defineField({name: 'size', title: 'Size (bytes)', type: 'number', readOnly: true}),
    defineField({name: 'duration', title: 'Duration (seconds)', type: 'number', readOnly: true}),
    defineField({name: 'width', title: 'Width', type: 'number', readOnly: true}),
    defineField({name: 'height', title: 'Height', type: 'number', readOnly: true}),
  ],
})
