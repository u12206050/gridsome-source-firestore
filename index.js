const { firestore } = require('firebase-admin')
const db = require('./db')

const axios = require('axios')
const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()

const isDev = process.env.NODE_ENV === 'development'

function docData(doc, parent = null) {
  return {
    data: doc.data(),
    id: doc.id,
    ref: doc.ref,
    parent: parent,
  }
}

function getFilename(url){
  return url.replace(/%2F/g, '/').split('/').pop().replace(/\#(.*?)$/, '').replace(/\?(.*?)$/, '');
}

function downloadImage(url, image_path) {
  return axios({
    url: url,
    responseType: 'stream',
  }).then(response => {
    response.data.pipe(fs.createWriteStream(image_path));

    return {
      status: true,
      error: '',
    };
  }).catch(error => ({
    status: false,
    error: 'Error: ' + error.message,
  }));
}

class FirestoreSource {
  // defaultOptions merged with this.options in App.vue
  static defaultOptions () {
    return {
      debug: false,
      ignoreImages: false,
      imageDirectory: 'fg_images',
      collections: []
    }
  }

  constructor (api, options = FirestoreSource.defaultOptions()) {
    if (!Array.isArray(options.collections) || !options.collections.length) throw new Error('At least one collection is required')

    this.verbose = options.debug
    this.images = options.ignoreImages ? false : {}
    this.imageDirectory = options.imageDirectory
    this.collections = options.collections
    this.cTypes = {}

    api.loadSource(async (store) => {
      this.store = store
      await this.processCollections(this.collections)
      if (this.images) await this.downloadImages()
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
        this.verbose && console.log(`No nodes for ${cName}`)
      }

      if (!colDef.skip) {
        this.verbose && console.log(`Creating content type for ${cName} with ${docs.length} nodes`)

        if (!this.cTypes[cName]) {
          this.cTypes[cName] = addContentType({
            typeName: cName
          })
        }

        const cType = this.cTypes[cName]

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

  async downloadImages() {
    const STATIC_DIR = path.join(ROOT, this.imageDirectory)

    if (!fs.existsSync(STATIC_DIR)) fs.mkdirSync(STATIC_DIR)

    await Object.keys(this.images).map(async (id) => {
      const url = this.images[id]

      let fileName = getFilename(url)
      const filePath = path.join(STATIC_DIR, fileName)

      if (!fs.existsSync(filePath)) {
        this.verbose && console.log(`Downloading ${url}`)
        await downloadImage(url, filePath)
        this.verbose && console.log(`Downloaded ${fileName}`)
      } else this.verbose && console.log(`${id} already exists ${fileName}`)
    })
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
          const id = this.store.makeUid(getFilename(field))
          if (!this.images[id]) this.images[id] = field

          return path.join(ROOT, this.imageDirectory, getFilename(field))
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

FirestoreSource.db = db

module.exports = FirestoreSource