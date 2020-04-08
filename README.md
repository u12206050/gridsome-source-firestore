# Gridsome source Firestore

Gridsome Source Plugin to load data from Firebase's Firestore

  * Reference fields of collections included get automatically attached as Graphql References

  * Image urls on fields within documents are downloaded and optimized by Gridsome.

  * Load collections and their sub-collections and access them via `_parent` and the `belongsTo` property

  * Live data updates from Firestore while you develop! `debug: true`

[Example](https://github.com/u12206050/gridsome-firestore-starter)
[Demo](https://gridsome-firestore-source.netlify.com/)

## BREAKING CHANGES

View the [changelog](https://github.com/u12206050/gridsome-source-firestore/blob/master/CHANGELOG.md) for any possible changes from previous versions.

## Install

  `npm install gridsome-source-firestore`

## Setup

Until Firestore receives support for handling custom service accounts, the only way is to download the Firebase AdminSDK service account credentials for your project. This does give the plugin full access to your Firebase.

In order to build your site from another server, you'll also these credentials but: BE VERY CAREFUL HOW YOU TRANSPORT THEM! DO NOT PUSH THEM TO GITHUB OR ANY OTHER CODE REPOSITORY!

### Set up Firebase AdminSDK service credentials

1. Navigate to the [settings/serviceaccounts/adminsdk](https://console.firebase.google.com/u/0/project/_/settings/serviceaccounts/adminsdk) of your firebase project.
2. Make sure `Firebase Admin SDK` is selected, and click `Generate new private key``
3. Download the key and save it to the root of your project.
4. For the saftey of everyone included this line in your `.gitignore` file: `*-firebase-adminsdk-*.json`

## Usage

Within plugins in the `gridsome-config.js` file, you'll add the collections and fields you want to use.

```javascript:title=gridsome-config.js
// gridsome-config.js

const { db } = require('gridsome-source-firestore')

module.exports = {
  plugins: [
    {
      use: 'gridsome-source-firestore',
      options: {
        credentials: require('./my-project-firebase-adminsdk-qw2123.json'), // Replace with your credentials file you downloaded.
        debug: true, // Default false, should be true to enable live data updates
        ignoreImages: false, // Default false
        imageDirectory: 'fg_images', // Default /fg_images
        collections: [
          {
            // name: Topics, // Uncomment and use only when needed.
            ref: (db) => {
              return db.collection('topics')
            },
            slug: (doc, slugify) => {
              return `/topics/${slugify(doc.data.title)}`
            },
            children: [
              {
                ref: (db, parentDoc) => {
                  return parentDoc.ref.collection('posts')
                },
                slug: (doc, slugify) => {
                  return `/${slugify(doc.data.title)}`
                },
              }
            ]
          }
        ]
      }
    }
  ]
}
```

## Definition

### Collections: `Array<Collection>`

### Collection: `Object`

Property | Type | Description
---|---|---
`name` | *optional* `Stirng` | Under the hood these names are used to link relationships. So only set the name manually if you are using the same Firestore collection multiple times.
`ref` | `Fn<Firestore, Document>` | Return `FirestoreReference` Optionally with filters, limits, order by etc. A callback function with the arguments `db` and `parentDoc` document as argument.
`slug` | *optional* `String`, `Fn<Document>:String` | Default is `slug` field. Otherwise name the field on the document to use. If `Function`: Callback function on each document. Return the value of the slug. eg. `/hello-world`
`children` | *optional* `Array<Collection>`
`skip` | *optional* `Boolean` | If this is a parent and you don't want to generate content from it you can skip to not create nodes. Children collections will still be executed.

**Examples**

Property | Example
---|---
`ref` | `(db) => { return db.collection('topics').where('active', '==', true) }`
`ref` in child | `(db, parentDoc) => { return parentDoc.ref.collection('posts').limit(parentDoc.data.showLast \|\| 10) }`
`slug` | `(doc, slugify) => { return '/topics/' + slugify(doc.data.title)' }`
`children` | `[...]`
`skip`| true "**Must have specified children then**"

### Document

Is an object sent on each callback with the following structure:

Key | Info
---|---
`id` | The key of the document
`ref` | The FirestoreReference of the document
`data` | Data object containing all the fields and value of the document from Firestore
`parent`? | If exists, is the Document with similar structure of the parent to the collection of this document


## Page Queries

```
query {
  allFireTopics {
    edges {
      node {
        title
        image (width: 800, height: 450)
        route
      }
    }
  }

  allFireTopicsPosts {
    edges {
      node {
        title
        body
        author {
          fullname
          image (width: 200, height: 200)
        }
        route
        image (width: 800, height: 450)
        topic: _parent {
          title
        }
      }
    }
  }
}
```

**`_parent`** exists on every child if the parent isn't skipped.
