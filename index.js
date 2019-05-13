const db = require('./db')
const getSlug = require('speakingurl')

const isDev = process.env.NODE_ENV === 'development'

function docData(doc, parent = null) {
  return {
    data: doc.data(),
    __key__: doc.id,
    __ref__: doc.ref,
    __parent__: parent,
  }
}

class FirestoreSource {
  // defaultOptions merged with this.options in App.vue
  static defaultOptions () {
    return {
      collections: []
    }
  }

  constructor (api, options = {}) {
    if (!Array.isArray(options.collections) || !options.collections.length) throw new Error('At least one collection is required')

    this.contentTypes = {}

    api.loadSource(async (store) => {
      await this.createContentTypes(store, options.collections)
    })
  }

  async createContentTypes (store, collections, parentDoc = null) {

    this.collections.forEach((def) => {
      console.log(`Fetching ${def.name}`)

      // TODO: if isDev then subscribe to snapshots and update nodes accordingly

      await let docs = def.ref.get().then(snap => {
        if (snap.size) return snap.docs.map(doc => docData(doc, parentDoc))
        else if (snap.exist) {
          isDocument = true
          return docData(snap, parentDoc)
        }
        return null
      })
      if (!docs) return null

      // Could be single document
      if (!Array.isArray(docs)) docs = [docs]

      if (!def.skip) {
        console.log(`Creating content type for ${def.name} with ${docs.length} nodes`)
        const cType = this.contentTypes[def.name] = this.store.addContentType({
          typeName: def.name
        })

        docs.forEach(doc => {
          doc.data.id = this.getId(doc)
          doc.data.path = this.getPath(doc)
          cType.addNode(doc.data)
        })
      }

      if (Array.isArray(def.children)) {
        docs.forEach(doc => {
          await this.createContentTypes(store, def.children, doc)
        })
      }
    })
  }

  getId(id, doc) {
    if (id) {
      if (typeof id === 'function') return id(doc)
      if (typeof id === 'string' && doc.data[id]) return doc.data[id]
      console.warn(`Id field is falsy, using default instead`)
    }

    return doc.__key__
  }

  getPath(slug, doc) {
    let path = (() => {
      if (slug) {
        if (typeof slug === 'function') return slug(doc, getSlug)
        if (typeof slug === 'string' && doc.data[slug]) return getSlug(doc.data[slug])
        console.warn(`Slug field is falsy, trying default instead`)
      }

      if (doc.data.slug) return getSlug(doc.data.slug)
      return doc.__key__
    })()

    if (path[0] !== '/') return `/${path}`
    return path
  }
}

module.exports = FirestoreSource