const admin = require('firebase-admin')
const { firestore } = require('firebase-admin')
const file = require('./file.js')

const ISDEV = process.env.NODE_ENV === 'development'

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
      credentials: null,
      debug: false,
      ignoreImages: false,
      imageDirectory: 'fg_images',
      collections: []
    }
  }

  constructor (api, options = FirestoreSource.defaultOptions()) {
    if (!Array.isArray(options.collections) || !options.collections.length) throw new Error('At least one collection is required')
    if (!options.credentials) throw new Error('Firestore-source: Missing credentials')

    this.loadImages = false
    this.verbose = options.debug
    this.images = options.ignoreImages ? false : {}
    this.imageDirectory = options.imageDirectory
    this.collections = options.collections
    this.cTypes = {}

    admin.initializeApp({
      credential: admin.credential.cert(options.credentials)
    })
    const db = admin.firestore()
    this.db = db

    api.loadSource(async (store) => {
      this.store = store
      await this.processCollections(this.collections)
      if (this.images && this.loadImages) await this.downloadImages()
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
    const { slugify, addCollection, getContentType, createReference } = this.store

    await Promise.all(collections.map(async (colDef) => {

      if (typeof colDef.ref !== 'function') throw new Error('Ref should be callback instead. fn(db, parentDoc?)')
      const ref = colDef.ref(this.db, parentDoc)

      const cName = colDef.name || this.typeName(ref._queryOptions.collectionId, ref._queryOptions.parentPath.segments)
      this.verbose && console.log(`Fetching ${cName}`)

      const docs = await ref.get().then(snap => {
        if (snap.size) return snap.docs.map(doc => docData(doc, parentDoc))
        else if (snap.exist) return docData(snap, parentDoc)
        return []
      })

      // Could be single document
      if (!Array.isArray(docs)) docs = [docs]

      if (!docs.length) {
        this.verbose && console.log(`No nodes for ${cName}`)
      }

      if (!colDef.skip) {
        this.verbose && console.log(`Creating content type for ${cName} with ${docs.length} nodes`)

        if (!this.cTypes[cName]) {
          this.cTypes[cName] = addCollection({
            typeName: cName
          })
        }

        const cType = this.cTypes[cName]

        docs.forEach(doc => {
          const node = this.createNode(doc, colDef.slug, parentDoc)
          cType.addNode(node)
        })
      }

      if (Array.isArray(colDef.children)) {
        await Promise.all(docs.map(async doc => {
          await this.processCollections(colDef.children, doc)
        }))
      }

      /* Currently only able to watch and update top-level collections */
      if (!colDef.skip && this.verbose && ISDEV) {
        this.watch(ref, cName, colDef.slug, parentDoc)
      }
    }))
  }

  createNode(doc, slug, parentDoc) {
    const node = this.normalizeField({
      ...doc.data,
      id: doc.id,
      path: this.getPath(slug, doc),
      _parent: parentDoc ? parentDoc.ref : null
    }, '_')
    this.verbose && console.log(`${node.id}: ${node.path}`)

    return node
  }

  async watch(ref, cName, slug, parentDoc) {
    const cType = this.cTypes[cName]

    let ids = []

    const updateDoc = (doc) => {
      let _d = docData(doc, parentDoc)
      ids.push(_d.id)

      const node = this.createNode(_d, slug, parentDoc)

      if (cType.getNodeById(_d.id)) cType.updateNode(node)
      else cType.addNode(node)
    }

    ref.onSnapshot(async snap => {
      ids = []

      if (snap.size) {
        snap.docs.forEach(updateDoc)
      } else if (snap.exist) {
        updateDoc(snap)
      }

      cType.collection.mapReduce((node) => node.id, (arr) => {
        arr.forEach(id => {
          if (ids.indexOf(id) < 0) cType.removeNode(id)
        })
      })

      if (this.loadImages) await this.downloadImages()
    })
  }

  async downloadImages() {
    file.createDirectory(this.imageDirectory)

    await Object.keys(this.images).map(async (id) => {
      const { filename, url, filepath } = this.images[id]

      if (!file.exists(filepath)) {
        await file.download(url, filepath)
        ISDEV && console.log(`Downloaded ${filename}`)
      } else ISDEV && console.log(`${filename} already exists`)
    })

    this.loadImages = false
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
        if (this.images && field.match(/^https:\/\/.*\/.*\.(jpg|png|svg|gif|jpeg)($|\?)/i)) {
          const filename = file.getFilename(field)
          const id = this.store.makeUid(field)
          const filepath = file.getFullPath(this.imageDirectory, filename)
          if (!this.images[id]) this.images[id] = {
            filename,
            url: field,
            filepath
          }

          this.loadImages = true

          return filepath
        }
      case "number":
      case "boolean": return field
      case "object":
        if (Array.isArray(field)) {
          return field.map(f => this.normalizeField(f, name))
        }
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

module.exports = FirestoreSource
