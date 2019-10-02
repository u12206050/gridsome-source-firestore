1.1.1 Renamed deprecated Gridsome method addContentType to addCollection

1.1.0 UPDATED FIREBASE-ADMIN

1.0.0 QUEUE FOR MANAGING DOWNLOADS

  * Images are downloaded in a queue instead of downloading all at once.

0.9.0 BREAKING CHANGES

  * Now requires credentials instead of the enviroment variables.

  * The callback function for the child `ref` property has been changed to include the `db` Firestore object. **OLD**: (parentDoc) => {} >>> **NEW**: (db, parentDoc?) => {}

  * You should now always use the callback function on the `ref` property as it includes the `db` object you need to create `DocumentReference` or `CollectionReference`. **OLD** `ref: db.collection('posts')` >>> **NEW**: `ref: (db) => { return db.collection('posts') }`

0.8.1 Dynamic data updates

  * Added support for live development Firestore updates

0.8.0 Image Support

  * Download images found of fields within documents. Images can then be optimized by Gridsome

0.7.0 BREAKING CHANGES

  * Removed custom ID and Name option in order to have document references working

  * Add support for Node References
