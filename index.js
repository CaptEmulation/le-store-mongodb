const debug = require('debug');
const mongoose = require('mongoose');
const crypto = require('crypto');
const {
  Account,
  Certificate,
} = require('./src/models');

exports.create = function create(options) {
  const {
    mongoUri = 'mongodb://localhost/greenlock',
    mongoOpts = {},
  } = options;
  const log = debug('le-store-mongodb');
  const db = mongoose.createConnection(mongoUri, Object.assign({
    useNewUrlParser: true,
    autoReconnect: true,
    useFindAndModify: false,
  }, mongoOpts));

  db.model('Account', Account);
  db.model('Certificate', Certificate);

  function debugResult(msg, cb) {
    return (err, ...results) => {
      if (err) {
        log('ERROR--', err && err.message || err);
        return cb(err);
      }
      log(msg, 'results', ...results);
      cb(null, ...results);
    };
  }

  function accountQuery(opts) {
    const possible = [];
    if (opts.email) {
      possible.push({
        email: opts.email,
      });
    }
    if (opts.accountId) {
      possible.push({
        id: opts.accountId,
      });
    }
    return {
      $or: possible,
    };
  }

  function accountResults(opts, cb) {
    return (err, model, ...results) => {
      if (err) return cb(err);
      cb(null, model && Object.assign(
        opts.keypair && { keypair: opts.keypair } || {},
        opts.receipt && { receipt: opts.receipt } || {},
        opts.email && { email: opts.email } || {},
        opts.id && { id: opts.id }  || {},
        model.toJSON(),
        {},
      ) || model, ...results);
    }
  }

  function certificateQuery(opts) {
    if (opts.domains && opts.domains.length) {
      return {
        domains: { $in: opts.domains }
      };
    }

    if (opts.accountId) {
      return {
        accountId: opts.accountId,
      };
    }

    if (opts.email) {
      return {
        email: opts.email,
      };
    }
    throw new Error('no query available for', opts);
  }

  function certificatetResults(opts, cb) {
    return (err, model, ...results) => {
      if (err) return cb(err);
      if (typeof cb !== 'function') {
        console.error(cb);
      }
      cb(null, model && Object.assign(
        opts.email && { email: opts.email } || {},
        opts.accountId && { accountId: opts.accountId } || {},
        opts.domains && { domains: opts.domains } || {},
        model.toJSON(),
        {},
      ) || model, ...results);
    }
  }

  const accounts = {
    // Accounts
    setKeypair(opts, keypair, cb) {
      const query = accountQuery(opts);
      log('accounts.setKeypair(', query, keypair, ')');
      db.model('Account').findOneAndUpdate(accountQuery(opts), {
        $set: {
          keypair,
        },
      }, {
        upsert: true,
        new: true,
      }, debugResult('accounts.setKeypair', (err, account) => {
        if (err) return cb(err);
        return cb(null, account && account.keypair || account);
      }));
    },
    // Accounts
    checkKeypair: function (opts, cb) {
      const query = accountQuery(opts);
      log('accounts.checkKeypair(', query, ')');
      db.model('Account').findOne(
        accountQuery(opts),
        debugResult('accounts.checkKeypair',
          (err, account) => {
            if (err) return cb(err);
            return cb(null, account && account.keypair || account);
          },
        ),
      );
    },

    // Accounts
    check: function (opts, cb) {
      const query = accountQuery(opts);
      log('accounts.check(', query, ')');
      db.model('Account').findOne(query, debugResult('accounts.check',
        accountResults(opts, cb),
      ));
    },
    // Accounts
    set: function (opts, reg, cb) {
      const query = accountQuery(opts);
      log('accounts.set(', query, reg, ')');
      const id = crypto.createHash('sha256').update(reg.keypair.publicKeyPem).digest('hex');
      db.model('Account').findOneAndUpdate(query, {
        $set: {
          id,
          email: opts.email,
          receipt: reg.receipt,
          agreeTos: opts.agreeTos || reg.agreeTos,
        },
      }, {
        upsert: true,
        new: true,
      }, debugResult('accounts.set',
        accountResults(opts, (err, account) => {
          if (err) return cb(err);
          return cb(null, account && {
            ...reg,
            ...account,
          } || account);
        }),
      ));
    },
  };

  const certificates = {
    // Certificates
    setKeypair: function (opts, keypair, cb) {
      const query = certificateQuery(opts);
      log('certificates.setKeypair(', query, keypair, ')');
      // opts.domains - this is an array, but you nly need the first (or any) of them
      db.model('Certificate').findOneAndUpdate(query, {
        $set: keypair,
      }, {
        upsert: true,
        new: true,
      }, debugResult('certificates.setKeypair', (err, cert) => {
        if (err) return cb(err);
        return cb(null, cert && {
          ...keypair,
          ...cert,
        } || cert);
      }));
    },
    // Certificates
    checkKeypair(opts, cb) {
      const query = certificateQuery(opts);
      log('certificates.checkKeypair(', query, ')');
      db.model('Certificate').findOne(query, (err, cert) => {
        if (err) return cb(err);
        return cb(null, cert && cert.keypair);
      });
    },
    // Certificates
    check(opts, cb) {
      const query = certificateQuery(opts);
      log('certificates.check(', query, ')');
      if (typeof cb !== 'function') {
        console.error(cb);
      }
      db.model('Certificate').findOne(query, debugResult('certificates.check', certificatetResults(opts, cb)));
    },
    // Certificates
    set(opts, cb) {
      const query = certificateQuery(opts);
      log('certificates.set(', query, ')');
      if (typeof cb !== 'function') {
        throw new Error('cb is not defined');
      }
      // opts.domains - this is an array, but you nly need the first (or any) of them
      db.model('Certificate').findOneAndUpdate(query, {
        $set: {
          domains: opts.domains,
          email: opts.email,
          accountId: opts.accountId,
          ...opts.certs,
        },
      }, {
        upsert: true,
        new: true,
      }, debugResult('certificates.set', certificatetResults(opts, cb)));
    }

  };

  return {
    getOptions: function () {
      // merge options with default settings and then return them
      return options;
    },
    accounts: accounts,
    certificates: certificates
  };
};
