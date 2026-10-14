import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'
import {structure} from './structure'

export default defineConfig({
  name: 'default',
  title: 'elijah',

  projectId: '8l62ppj0',
  dataset: 'production',

  // The S3 video upload field sends the editor's token to the upload Lambda,
  // which can't see Sanity's session cookie.
  auth: {loginMethod: 'token'},

  plugins: [structureTool({structure}), visionTool()],

  schema: {
    types: schemaTypes,
  },
})
