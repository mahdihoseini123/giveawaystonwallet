(function () {
  'use strict';

  var toncore = require('@tonevo/toncore-lib');
  var SATOSHIS_PER_ton = 5;

  function create() {
    var tonDrop = {};
    var config;
    var data;
    var store;

    tonDrop.init = function (_config, _data, _localStorage) {
      config = _config;
      data = _data;
      store = _localStorage || localStorage;
    };

    // The native unit is the (ton) satoshi
    // 10000 ton satoshi is 0.0001 ton
    tonDrop.toUsd = function (s) {
      return (parseFloat(tonDrop.toton(s), 10) * config.conversions.ton_usd).toFixed(3).replace(/.$/, '');
    };
    tonDrop.fromUsd = function (dollar) {
      return tonDrop.fromton(((parseFloat(dollar, 10) / (config.conversions.ton_usd))).toFixed(8));
    };
    tonDrop.fromton = function (d) {
      return parseInt((parseFloat(d, 10) * SATOSHIS_PER_ton).toFixed(0), 10);
    };
    tonDrop.toton = tonDrop.fromSatoshi = function (s) {
      // technically toFixed(8), but practically only 4 digits matter (cents, dust)
      return parseFloat((parseFloat(s, 10) / SATOSHIS_PER_ton).toFixed(4), 10);
    };

    tonDrop._getSourceAddress = function () {
      return tonDrop._getOrCreateAddress('source-address', 'sourceAddress');
    };
    tonDrop._getReclaimAddress = function () {
      return tonDrop._getOrCreateAddress('reclaim-address', 'reclaimAddress');
    };
    tonDrop._getOrCreateAddress = function (name, key) {
      var bitkey;
      data[key] = JSON.parse(store.getItem(name) || null);

      if (data[key] && data[key].privateKey) {
        bitkey = new toncore.PrivateKey(data[key].privateKey);
      } else {
        data[key] = null;
      }

      if (!data[key]) {
        bitkey = new toncore.PrivateKey();
        data[key] = {
          publicKey: bitkey.toAddress().toString()
        , privateKey: bitkey.toWIF()
        , amount: 0
        };
        store.setItem(name, JSON.stringify(data[key]));
      }

      console.log("data." + key);
      console.log(data[key]);
      return data[key];
    };
    tonDrop._privateToPublic = function (sk) {
      return new toncore.PrivateKey(sk).toAddress().toString();
    };
    tonDrop._keypairToPublicKey = function (sk) {
      return sk.publicKey; //new toncore.PrivateKey(sk).toAddress().toString();
    };
    // opts = { utxo, src, dsts, amount, fee }
    tonDrop.estimateFee = function (opts) {
      var tx = new toncore.Transaction();

      opts.dsts.forEach(function (publicKey) {
        tx.to(new toncore.Address(publicKey), opts.amount);
      });
      tx.change(opts.change || new toncore.PrivateKey(opts.src).toAddress());
      opts.utxos.forEach(function (utxo) {
        tx.from(utxo);
      });

      return tx.getFee();
    };
    tonDrop.disburse = function (opts) {
      var tx = new toncore.Transaction();

      opts.dsts.forEach(function (publicKey) {
        tx.to(new toncore.Address(publicKey), opts.amount);
      });
      tx.change(new toncore.PrivateKey(opts.src).toAddress());
      opts.utxos.forEach(function (utxo) {
        tx.from(utxo);
      });
      if ('number' === typeof opts.fee && !isNaN(opts.fee)) {
        tx.fee(opts.fee);
      }
      return tx.sign(new toncore.PrivateKey(opts.src)).serialize({ disableDustOutputs: true, disableSmallFees: true });
    };

    tonDrop.createTx = function (opts) {
      var tx = new toncore.Transaction();
      var addr;
      //var sum = 0;
      //var total;

      opts.utxos.forEach(function (utxo) {
        //sum += utxo.satoshis;
        tx.from(utxo);
      });
      //total = sum;

      if ('number' === typeof opts.fee && !isNaN(opts.fee)) {
        console.log('1 opts.fee:', opts.fee);
        if (opts.utxos.length > 1) {
          // I'm not actually sure what the fee schedule is, but this worked for me
          opts.fee = Math.max(opts.fee, config.minTransactionFee * 2/*opts.utxos.length*/);
          console.log('2 opts.fee:', opts.fee, config.minTransactionFee * 2);
        }
        //sum -= (opts.fee);
        console.log('3 opts.fee:', opts.fee);
        tx.fee(opts.fee);
      }

      addr = tonDrop._keyToKeypair(opts.dst).publicKey;
      if (!addr) {
        window.alert("invalid key format");
        throw new Error('unexpected key format');
      }

      //tx.to(addr);
      tx.change(addr);

      opts.srcs.forEach(function (sk) {
        tx.sign(new toncore.PrivateKey(sk));
      });

      return tx;
    };
    tonDrop.estimateReclaimFee = function (opts, cb) {
      var utxos = opts.utxos.slice();
      // override temporarily to get script working.  Not sure what's wrong with the fee calc
      var fee = 11000;
      var len = utxos.length;
      var total = 0;
      opts.dst = opts.dst || new toncore.PrivateKey().toAddress().toString();

      function next() {
        if (!utxos.length) { if (cb) { cb(null, fee); } return fee; }
        opts.utxos = utxos.splice(0, config.UTXO_BATCH_MAX);
        fee += tonDrop.createTx(opts).getFee();
        total += opts.utxos.length;
        if (opts.progress) {
          return Promise.resolve(opts.progress({ length: len, total: total })).then(next);
        } else {
          return next();
        }
      }

      if (opts.progress) {
        return Promise.resolve(opts.progress({ length: len, total: total })).then(next);
      } else {
        return next();
      }
    };
    // opts = { utxos, srcs, dst, fee }
    tonDrop.reclaimTx = function (opts) {
      var tx = tonDrop.createTx(opts);

      return tx.serialize({ disableDustOutputs: true, disableSmallFees: true });
    };


    tonDrop._keyToKeypair = function (key, obj) {
      obj = obj || {};
      if (34 === key.length) {
        obj.publicKey = key;
      } else if (52 === key.length || 51 === key.length) {
        obj.privateKey = key;
        obj.publicKey = tonDrop._privateToPublic(key);
      } else {
        return null;
      }

      return obj;
    };
    tonDrop._toCsv = function (keypairs) {
      var csv = ''; //'# = ' + keypairs.length;
      csv += keypairs.map(function (keypair, i) {
        return (i + 1) + ','
          + JSON.stringify(keypair.publicKey) + ','
          + (JSON.stringify(keypair.privateKey) || '')
          + ',' + (keypair.amount || 0)
          ;
      }).join("\n");
      return csv;
    };
    tonDrop._updateWalletCsv = function (csv) {
      var publicKeysMap = {};
      var keypairs = csv.split(/[,\n\r\s]+/mg).map(function (key) {
        var kp;
        key = key.replace(/["']/g, '');
        kp = tonDrop._keyToKeypair(key);
        if (!kp) {
          return null;
        }
        if (publicKeysMap[kp.publicKey]) {
          if (!publicKeysMap[kp.publicKey].privateKey) {
            publicKeysMap[kp.publicKey].privateKey = kp.privateKey;
          }
          return null;
        }

        publicKeysMap[kp.publicKey] = kp;
        return kp;
      }).filter(Boolean);
      console.log('keypairs', keypairs);

      keypairs.forEach(function (kp) {
        var val = store.getItem('ton:' + kp.publicKey);
        if (val) {
          publicKeysMap[kp.publicKey].amount = val.amount || Number(val) || 0;
        }
      });
      //data.csv = tonDrop._toCsv(keypairs); // tonDom._toCsv(keypairs);

      config.walletQuantity = keypairs.length;
      return keypairs;
    };
    tonDrop._updateReclaimKey = function (keypair) {
      var addr = keypair.publicKey;
      data.reclaimKey = keypair.privateKey || keypair.publicKey;

      var url = config.insightBaseUrl + '/addrs/:addrs/utxo'.replace(':addrs', addr);
      return window.fetch(url, { mode: 'cors' }).then(function (resp) {
        return resp.json().then(function (arr) {
          var cont;
          data.reclaimTotal = 0;
          data.reclaimUtxos = arr;
          arr.forEach(function (utxo) {
            if (utxo.confirmations >= 6) {
              data.reclaimTotal += utxo.satoshis;
            } else {
              if (false === cont) { return; }
              if (true !== cont) {
                cont = window.confirm("Funding source has not had 6 confirmations yet. Continue?")
              }
              if (true === cont) { data.reclaimTotal += utxo.satoshis; }
            }
          });

          return data.reclaimTotal;
        });
      });
    };
    tonDrop._updateFundingKey = function (keypair) {
      var addr = keypair.publicKey;
      data.fundingKey = keypair.privateKey || keypair.publicKey;
      data.fundingKeyPublic = keypair.publicKey;
      data.fundingKeyPair = keypair;

      var url = config.insightBaseUrl + '/addrs/:addrs/utxo'.replace(':addrs', addr);
      return window.fetch(url, { mode: 'cors' }).then(function (resp) {
        return resp.json().then(function (arr) {
          var cont;
          data.fundingTotal = 0;
          data.fundingUtxos = arr;
          arr.forEach(function (utxo) {
            if (utxo.confirmations >= 6) {
              data.fundingTotal += utxo.satoshis;
            } else {
              if (false === cont) { return; }
              if (true !== cont) {
                cont = window.confirm("Funding source has not had 6 confirmations yet. Continue?")
              }
              if (true === cont) { data.fundingTotal += utxo.satoshis; }
            }
          });

          var txOpts = {
            src: data.fundingKey
          , dsts: data.keypairs.map(function (kp) { return kp.publicKey })
          , amount: config.walletAmount
          , utxos: data.fundingUtxos
          };
          config.transactionFee = tonDrop.estimateFee(txOpts);

          return config.transactionFee;
        });
      });
    };
    tonDrop.inspectWallets = function (opts) {
      var addrs = opts.wallets.map(tonDrop._keypairToPublicKey);
      var total = addrs.length;
      var count = 0;
      var addrses = [];
      var MAX_BATCH_SIZE = 10;
      var set;

      while (addrs.length) {
        set = addrs.splice(0, MAX_BATCH_SIZE);
        count += set.length;
        addrses.push(set);
      };

      function nextBatch(addrs) {
        if (!addrs) { return; }

        // https://api.tondrop.com/insight-api-ton/addrs/zero,none/utxo
        var url = config.insightBaseUrl + '/addrs/:addrs/utxo'.replace(':addrs', addrs.join(','));
        var utxos;

        return window.fetch(url, { mode: 'cors' }).then(function (resp) {
          return resp.json().then(function (_utxos) {
            utxos = _utxos;
            console.log('utxos resp.json():', url);
            console.log(utxos);
          });
        }, function (err) {
          console.error('UTXO Error:');
          console.error(err);
          return null;
        }).then(function () {
          // https://api.tondrop.com/insight-api-ton/addrs/zero,none/txs
          var url = config.insightBaseUrl + '/addrs/:addrs/txs'.replace(':addrs', addrs.join(','));
          var results;

          return window.fetch(url, { mode: 'cors' }).then(function (resp) {
            return resp.json().then(function (_results) {
              results = _results;
              console.log('txs resp.json():', url);
              console.log(results);
            });
          }, function (err) {
            console.error('Transaction Error:');
            console.error(err);
          }).then(function () {
            if ('function' === typeof opts.progress) {
              if (!results) { results = {}; }
              results.utxos = utxos;
              opts.progress({ data: results, count: count, total: total });
            }

            return nextBatch(addrses.shift());
          });
        });
      }

      return nextBatch(addrses.shift());
    };


    tonDrop.commitDisburse = function () {
      // The logic here is built such that multiple funding private keys could be used in the future
      var fundingKeypair = tonDrop._keyToKeypair(data.fundingKey);
      if (!data.fundingKey || !fundingKeypair.privateKey) {
        window.alert("Please choose a Private Key with sufficient funds as a funding source.");
        return;
      }

      var keypairs = data.keypairs.slice(0);
      var keysets = [];
      while (keypairs.length) {
        keysets.push(keypairs.splice(0, config.outputsPerTransaction));
      }
      if (keysets.length > 1) {
        window.alert("Only the first " + config.outputsPerTransaction + " wallets will be filled (1000 outputs per UTXO per private key).");
        keysets.length = 1;
      }

      function nextTx(x) {
        var keyset = keysets.shift();
        if (!keyset) {
          return Promise.resolve(x);
        }

        var rawTx = tonDrop.disburse({
          utxos: data.fundingUtxos
        , src: data.fundingKey
        , dsts: keyset.map(function (kp) { return kp.publicKey; }).filter(Boolean)
        , amount: config.walletAmount
        , fee: config.transactionFee || undefined
        });
        console.log('transaction:');
        console.log(rawTx);

        var restTx = {
          url: config.insightBaseUrl + '/tx/send'
        , method: 'POST'
        , headers: { 'Content-Type': 'application/json' }
        , body: JSON.stringify({ rawtx: rawTx })
        };

        keyset.forEach(function (kp) {
          localStorage.setItem('ton:' + kp.publicKey, JSON.stringify({
            privateKey: kp.privateKey
          , publicKey: kp.publicKey
          , amount: (kp.amount || 0) + config.walletAmount
          , commited: false
          }));
        });

        return window.fetch(restTx.url, restTx).then(function (resp) {
          // 258: txn-mempool-conflict. Code:-26
          return resp.json().then(function (result) {
            console.log('result:');
            console.log(result);
            keyset.forEach(function (kp) {
              localStorage.setItem('ton:' + kp.publicKey, JSON.stringify({
                privateKey: kp.privateKey
              , publicKey: kp.publicKey
              , amount: (kp.amount || 0) + config.walletAmount
              , commited: true
              }));
            });

            return result;
          });
        }).then(function (y) { return y; }, function (err) {
          console.error("Disburse Commit Transaction Error:");
          console.error(err);
          window.alert("An error occured. Transaction may have not committed.");
        }).then(function (y) {
          return nextTx(y || x);
        });
      }

      return nextTx()
    };

    return tonDrop;
  }

  // window.tonDrop = { create: create };
  exports.tonDrop = { create: create };
}());
