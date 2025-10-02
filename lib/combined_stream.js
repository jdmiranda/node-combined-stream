var util = require('util');
var Stream = require('stream').Stream;
var DelayedStream = require('delayed-stream');

module.exports = CombinedStream;

// Buffer pool for efficient memory reuse
var BufferPool = {
  _pools: {},
  _poolSizes: [1024, 4096, 16384, 65536],

  getBuffer: function(size) {
    // Find appropriate pool size
    var poolSize = this._poolSizes.find(function(s) { return s >= size; }) || size;

    if (!this._pools[poolSize]) {
      this._pools[poolSize] = [];
    }

    var pool = this._pools[poolSize];
    if (pool.length > 0) {
      return pool.pop();
    }

    return Buffer.allocUnsafe(poolSize);
  },

  releaseBuffer: function(buffer) {
    var size = buffer.length;
    var poolSize = this._poolSizes.find(function(s) { return s >= size; }) || size;

    if (!this._pools[poolSize]) {
      this._pools[poolSize] = [];
    }

    // Limit pool size to prevent memory leaks
    if (this._pools[poolSize].length < 10) {
      this._pools[poolSize].push(buffer);
    }
  }
};

function CombinedStream() {
  this.writable = false;
  this.readable = true;
  this.dataSize = 0;
  this.maxDataSize = 2 * 1024 * 1024;
  this.pauseStreams = true;

  this._released = false;
  this._streams = [];
  this._currentStream = null;
  this._insideLoop = false;
  this._pendingNext = false;

  // Cache bound event handlers to avoid creating new functions
  this._boundGetNext = this._getNext.bind(this);
  this._boundCheckDataSize = this._checkDataSize.bind(this);
  this._boundHandleError = this._handleError.bind(this);

  // Stream state cache
  this._streamStateCache = new Map();
}
util.inherits(CombinedStream, Stream);

CombinedStream.create = function(options) {
  var combinedStream = new this();

  options = options || {};
  for (var option in options) {
    combinedStream[option] = options[option];
  }

  return combinedStream;
};

CombinedStream.isStreamLike = function(stream) {
  return (typeof stream !== 'function')
    && (typeof stream !== 'string')
    && (typeof stream !== 'boolean')
    && (typeof stream !== 'number')
    && (!Buffer.isBuffer(stream));
};

CombinedStream.prototype.append = function(stream) {
  var isStreamLike = CombinedStream.isStreamLike(stream);

  if (isStreamLike) {
    // Cache stream state
    var streamState = {
      isDelayed: stream instanceof DelayedStream,
      hasDataListener: false
    };

    if (!streamState.isDelayed) {
      var newStream = DelayedStream.create(stream, {
        maxDataSize: Infinity,
        pauseStream: this.pauseStreams,
      });
      // Use cached bound function instead of creating new one
      stream.on('data', this._boundCheckDataSize);
      streamState.hasDataListener = true;
      stream = newStream;
    }

    this._streamStateCache.set(stream, streamState);
    this._handleErrors(stream);

    if (this.pauseStreams) {
      stream.pause();
    }
  }

  this._streams.push(stream);
  return this;
};

CombinedStream.prototype.pipe = function(dest, options) {
  Stream.prototype.pipe.call(this, dest, options);
  this.resume();
  return dest;
};

CombinedStream.prototype._getNext = function() {
  this._currentStream = null;

  if (this._insideLoop) {
    this._pendingNext = true;
    return; // defer call
  }

  this._insideLoop = true;
  try {
    do {
      this._pendingNext = false;
      this._realGetNext();
    } while (this._pendingNext);
  } finally {
    this._insideLoop = false;
  }
};

CombinedStream.prototype._realGetNext = function() {
  var stream = this._streams.shift();


  if (typeof stream == 'undefined') {
    this.end();
    return;
  }

  if (typeof stream !== 'function') {
    this._pipeNext(stream);
    return;
  }

  var getStream = stream;
  var self = this;
  getStream(function(stream) {
    var isStreamLike = CombinedStream.isStreamLike(stream);
    if (isStreamLike) {
      // Use cached bound function
      stream.on('data', self._boundCheckDataSize);
      self._handleErrors(stream);
    }

    self._pipeNext(stream);
  });
};

CombinedStream.prototype._pipeNext = function(stream) {
  this._currentStream = stream;

  var isStreamLike = CombinedStream.isStreamLike(stream);
  if (isStreamLike) {
    // Use cached bound function to avoid creating new function on each call
    stream.on('end', this._boundGetNext);
    stream.pipe(this, {end: false});
    return;
  }

  var value = stream;
  this.write(value);
  this._getNext();
};

CombinedStream.prototype._handleErrors = function(stream) {
  // Use cached bound function for error handling
  stream.on('error', this._boundHandleError);
};

CombinedStream.prototype._handleError = function(err) {
  this._emitError(err);
};

CombinedStream.prototype.write = function(data) {
  this.emit('data', data);
};

CombinedStream.prototype.pause = function() {
  if (!this.pauseStreams) {
    return;
  }

  if(this.pauseStreams && this._currentStream && typeof(this._currentStream.pause) == 'function') this._currentStream.pause();
  this.emit('pause');
};

CombinedStream.prototype.resume = function() {
  if (!this._released) {
    this._released = true;
    this.writable = true;
    this._getNext();
  }

  if(this.pauseStreams && this._currentStream && typeof(this._currentStream.resume) == 'function') this._currentStream.resume();
  this.emit('resume');
};

CombinedStream.prototype.end = function() {
  this._reset();
  this.emit('end');
};

CombinedStream.prototype.destroy = function() {
  this._reset();
  this.emit('close');
};

CombinedStream.prototype._reset = function() {
  this.writable = false;
  this._streams = [];
  this._currentStream = null;
  // Clear stream state cache to prevent memory leaks
  if (this._streamStateCache) {
    this._streamStateCache.clear();
  }
};

CombinedStream.prototype._checkDataSize = function() {
  this._updateDataSize();
  if (this.dataSize <= this.maxDataSize) {
    return;
  }

  var message =
    'DelayedStream#maxDataSize of ' + this.maxDataSize + ' bytes exceeded.';
  this._emitError(new Error(message));
};

CombinedStream.prototype._updateDataSize = function() {
  // Optimized data size calculation - reduce function calls
  var totalSize = 0;
  var streams = this._streams;
  var len = streams.length;

  // Use for loop instead of forEach for better performance
  for (var i = 0; i < len; i++) {
    var stream = streams[i];
    if (stream.dataSize) {
      totalSize += stream.dataSize;
    }
  }

  if (this._currentStream && this._currentStream.dataSize) {
    totalSize += this._currentStream.dataSize;
  }

  this.dataSize = totalSize;
};

CombinedStream.prototype._emitError = function(err) {
  this._reset();
  this.emit('error', err);
};
