const { firestore } = require('firebase-admin')
const db = require('./db')

const isDev = process.env.NODE_ENV === 'development'

function docData(doc, parent = null) {
  return {
    data: doc.data(),
    id: doc.id,
    ref: doc.ref,
    parent: parent,
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

    this.cTypes = {}

    api.loadSource(async (store) => {
      this.store = store
      await this.processCollections(options.collections)
    })
  }

  async processCollections(collections, parentDoc = null) {
    const { slugify, addContentType, getContentType, createReference } = this.store

    await collections.forEach(async (colDef) => {
      console.log(`Fetching ${colDef.name}`)

      // TODO: if isDev then subscribe to snapshots and update nodes accordingly

      let ref = (() => {
        if (typeof colDef.ref === 'function') {
          if (!parentDoc) console.log('No parent document exists to give to ref callback')
          return colDef.ref(parentDoc)
        }
        return colDef.ref
      })()

      const docs = await ref.get().then(snap => {
        if (snap.size) return snap.docs.map(doc => docData(doc, parentDoc))
        else if (snap.exist) {
          isDocument = true
          return docData(snap, parentDoc)
        }
        return null
      })
      if (!docs) {
        console.log(`No nodes for ${colDef.name}`)
        return null
      }

      // Could be single document
      if (!Array.isArray(docs)) docs = [docs]

      if (!colDef.skip) {
        console.log(`Creating content type for ${colDef.name} with ${docs.length} nodes`)
        if (!this.cTypes[colDef.name]) {
          this.cTypes[colDef.name] = addContentType({
            typeName: colDef.name,
            route: `/${slugify(colDef.name)}/:slug`
          })
        }

        const cType = getContentType(colDef.name)

        docs.forEach(doc => {
          doc.data.id = this.getId(colDef.id, doc)
          doc.data.path = this.getPath(colDef.slug, doc)
          cType.addNode(this.normalizeField(doc.data))
        })
      }

      if (Array.isArray(colDef.children)) {
        await docs.forEach(async doc => {
          await this.processCollections(colDef.children, doc)
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

    return doc.id
  }

  getPath(slug, doc) {
    let path = (() => {
      const { slugify } = this.store
      if (slug) {
        if (typeof slug === 'function') return slug(doc, slugify)
        if (typeof slug === 'string' && doc.data[slug]) return slugify(doc.data[slug])
        console.warn(`Slug field is falsy, trying default instead`)
      }

      if (doc.data.slug) return slugify(doc.data.slug)
      return doc.id
    })()

    if (path[0] !== '/') return `/${path}`
    return path
  }

  normalizeField(field) {
    if (!field) return field
    switch (typeof field) {
      case "string":
      case "number":
      case "boolean": return field
      case "object":
        if (field.constructor) {
          switch (field.constructor) {
            case Date: return field
            case firestore.Timestamp: return field.toDate()
            case firestore.GeoPoint: return {
              lat: field.latitude,
              long: field.longitude
            }
            case firestore.DocumentReference:
              console.warn('DocumentReference fields are not supported yet')
              return null
          }
        }

        const tmp = {}
        Object.keys(field).forEach(p => {
          if (field.hasOwnProperty(p))
            tmp[p] = this.normalizeField(field[p])
        })
        return tmp
    }
  }
}

module.exports = FirestoreSource