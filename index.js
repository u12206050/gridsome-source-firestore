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

    api.loadSource((store) => {
      this.store = store
      return this.processCollections(options.collections)
    })
  }

  async processCollections(collections, parentDoc = null) {
    const { slugify, addContentType, getContentType, createReference } = this.store

    await Promise.all(collections.map(async (colDef) => {
      const cName = `Fire${colDef.name}`
      console.log(`Fetching ${cName}`)

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
        console.log(`No nodes for ${cName}`)
        return null
      }

      // Could be single document
      if (!Array.isArray(docs)) docs = [docs]

      if (!colDef.skip) {
        console.log(`Creating content type for ${cName} with ${docs.length} nodes`)
        if (!this.cTypes[cName]) {
          this.cTypes[cName] = addContentType({
            typeName: cName
          })
        }

        const cType = getContentType(cName)

        docs.forEach(doc => {
          const node = this.normalizeField({
            ...doc.data,
            id: this.getId(colDef.id, doc),
            route: this.getPath(colDef.slug, doc)
          })
          console.log(`${node.id}: ${node.route}`)
          cType.addNode(node)
        })
      }

      if (Array.isArray(colDef.children)) {
        await Promise.all(docs.map(async doc => {
          await this.processCollections(colDef.children, doc)
        }))
      }
    }))
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

FirestoreSource.db = db

module.exports = FirestoreSource