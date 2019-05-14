# Gridsome source Firestore
Gridsome Source Plugin to load data from Firebase's Firestore


## Install

  `npm install gridsome-source-firestore`

## Setup

The source plugin requires at least the following variables from `Firebase` to exist in your `.env` file or `.env.development` and `.env.production` if you use those.

```env
GRIDSOME_API_KEY=XXX
GRIDSOME_DATABASE_URL=XXX
GRIDSOME_PROJECT_ID=XXX
```

The reason why we prefix it with `GRIDSOME_` is to allow you to use the variables on the client side as well if needed.


## Usage

Within plugins in the `gridsome-config.js` file, you'll add the collections and fields you want to use.

```javascript:title=gridsome-config.js
// gridsome-config.js

const { db } = require('gridsome-source-firestore')

module.exports = {
  plugins: [
    {
      use: 'gridsome-source-firestore',
      debug: true, // Default false
      options: {
        collections: [
          {
            ref: db.collection('topics'),
            slug: (doc, slugify) => {
              return `/topics/${slugify(doc.data.title)}`
            },
            children: [
              {
                ref: (parentDoc) => {
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
`ref` | `FirestoreReference`, `Function<Document>:FirestoreReference` | Optionally with filters, limits, order by etc. If `Function`, it is only allowed on children. Callback with the `parent` document as argument.
`slug` | *optional* `String`, `Function<Document>:String` | Default is `slug` field. Otherwise name the field on the document to use. If `Function`: Callback function on each document. Return the value of the slug. eg. `/hello-world`
`children` | *optional* `Array<Collection>`
`skip` | *optional* `Boolean` | If this is a parent and you don't want to generate content from it you can skip to not create nodes. Children collections will still be executed.

**Examples**

Property | Example
---|---
`ref` | `db.collection('topics').where('active', '==', true)`
`ref` in child | `(parentDoc) => { return parentDoc.ref.collection('posts').limit(parentDoc.data.showLast || 10) }`
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
        image
        route
      }
    }
  }

  allFireTopicsPosts {
    edges {
      node {
        title
        body
        author
        route
        topic: _parent {
          title
        }
      }
    }
  }
}
```

**`_parent`** exists on every child if the parent isn't skipped.