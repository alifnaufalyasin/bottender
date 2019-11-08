/* @flow */
import isBefore from 'date-fns/isBefore';
import subMinutes from 'date-fns/subMinutes';
import { MongoClient } from 'mongodb';

import { type Session } from './Session';
import { type SessionStore } from './SessionStore';

type Cursor = {
  toArray: () => Promise<Array<any>>,
};

type MongoCollection = {
  find: () => Cursor,
  findOne: (filter: Object) => Promise<{}>,
  updateOne: (filter: Object, data: Object, options: Object) => Promise<void>,
  remove: (filter: Object) => Promise<void>,
};

type MongoConnection = {
  collection: (name: string) => MongoCollection,
};

const MINUTES_IN_ONE_YEAR = 365 * 24 * 60;

export default class MongoSessionStore implements SessionStore {
  _url: string;

  _collectionName: string;

  // The number of minutes to store the data in the session.
  _expiresIn: number;

  _connection: ?MongoConnection;

  constructor(
    url: string,
    options: { collectionName?: string } = {},
    expiresIn: number
  ) {
    this._url = url;
    this._collectionName = options.collectionName || 'sessions';
    this._expiresIn = expiresIn || MINUTES_IN_ONE_YEAR;
  }

  async init(): Promise<MongoSessionStore> {
    this._connection = (await MongoClient.connect(this._url)).db();
    // $FlowFixMe
    return this;
  }

  async read(key: string): Promise<Session | null> {
    const filter = { id: key };
    try {
      const session = await this._sessions.findOne(filter);

      if (session && this._expired(session)) {
        return null;
      }

      return session;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  async all(): Promise<Array<Session>> {
    return this._sessions.find().toArray();
  }

  async write(key: string, sess: Session): Promise<void> {
    const filter = { id: key };

    sess.lastActivity = Date.now();

    try {
      await this._sessions.updateOne(
        filter,
        { $set: sess },
        {
          upsert: true,
        }
      );
    } catch (err) {
      console.error(err);
    }
  }

  async destroy(key: string): Promise<void> {
    const filter = { id: key };
    try {
      await this._sessions.remove(filter);
    } catch (err) {
      console.error(err);
    }
  }

  _expired(sess: Session): boolean {
    return (
      sess.lastActivity !== undefined &&
      isBefore(sess.lastActivity, subMinutes(Date.now(), this._expiresIn))
    );
  }

  get _sessions(): MongoCollection {
    if (this._connection == null) {
      throw new Error(
        'MongoSessionStore: must call `init` before any operation.'
      );
    }
    return this._connection.collection(this._collectionName);
  }
}
