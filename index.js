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
      debug: false,
      collections: []
    }
  }

  constructor (api, options = {}) {
    if (!Array.isArray(options.collections) || !options.collections.length) throw new Error('At least one collection is required')

    this.verbose = options.debug
    this.collections = options.collections
    this.cTypes = {}

    api.loadSource((store) => {
      this.store = store
      return this.processCollections(this.collections)
    })
  }

  /* Capitalize string */
  capitalize(colName) {
    return colName.charAt(0).toUpperCase() + colName.slice(1)
  }

  /* Return the content  type name for the given collection name and optional segments */
  typeName(colName, segments = []) {
    let tName = 'Fire'

    let segNames = []
    segments && segments.forEach((seg, i) => {
      if (!i % 2) segNames.push(this.capitalize(seg))
    })
    tName += segNames.reverse().join('')

    tName += this.capitalize(colName)

    return tName
  }

  async processCollections(collections, parentDoc = null) {
    const { slugify, addContentType, getContentType, createReference } = this.store

    await Promise.all(collections.map(async (colDef) => {

      // TODO: if isDev then subscribe to snapshots and update nodes accordingly

      let ref = (() => {
        if (typeof colDef.ref === 'function') {
          if (!parentDoc) console.warn('No parent document exists to give to ref callback')
          return colDef.ref(parentDoc)
        }
        return colDef.ref
      })()

      const cName = this.typeName(ref._queryOptions.collectionId, ref._queryOptions.parentPath.segments)
      this.verbose && console.log(`Fetching ${cName}`)

      const docs = await ref.get().then(snap => {
        if (snap.size) return snap.docs.map(doc => docData(doc, parentDoc))
        else if (snap.exist) {
          isDocument = true
          return docData(snap, parentDoc)
        }
        return []
      })

      // Could be single document
      if (!Array.isArray(docs)) docs = [docs]

      if (!docs.length) {
        console.log(`No nodes for ${cName}`)
      }

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
            id: doc.id,
            path: this.getPath(colDef.slug, doc),
            _parent: parentDoc ? parentDoc.ref : null
          }, '_')
          this.verbose && console.log(`${node.id}: ${node.route}`)
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

  normalizeField(field, name) {
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
              return this.store.createReference(this.typeName('', field._path.segments), field.id)
          }
        }

        const tmp = {}
        Object.keys(field).forEach(p => {
          if (field.hasOwnProperty(p))
            tmp[p] = this.normalizeField(field[p], p)
        })
        return tmp
    }
  }
}

FirestoreSource.db = db

module.exports = FirestoreSource